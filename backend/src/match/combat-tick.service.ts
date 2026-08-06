import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MatchService } from './match.service';
import { MatchGateway } from './match.gateway';
import { SpritesService } from '../sprites/sprites.service';
import {
  BATTLEFIELD,
  COMBAT_TICK_HZ,
  MatchState,
  Unit,
} from '../common/types';

/** Soft collision radius — keeps units from stacking on one spot */
const UNIT_RADIUS = 22;
const SEPARATION_STRENGTH = 0.55;
const TRAIL_ZONE_RADIUS = 48;
const SLOW_REFRESH_SEC = 0.4;

@Injectable()
export class CombatTickService {
  private readonly logger = new Logger(CombatTickService.name);
  private interval: NodeJS.Timeout | null = null;
  private readonly dt = 1 / COMBAT_TICK_HZ;

  /**
   * Delay before on-death bomb AoE (damage + fx:explosion).
   * Lets Dead anim play first so boom lines up with the VFX.
   */
  private readonly deathAoeDelaySec = 0.75;

  private pendingDeathAoes: Array<{
    remaining: number;
    dead: Unit;
  }> = [];

  /** Ranged damage after attack-anim release + projectile travel */
  private pendingRangedImpacts: Array<{
    remaining: number;
    shooterId: string;
    targetUnitId: string | null;
    aim: { x: number; y: number };
    vsBase: boolean;
  }> = [];

  /** Bell ring: apply stun when Attack anim finishes */
  private pendingBellStuns: Array<{
    remaining: number;
    ringerId: string;
  }> = [];

  constructor(
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService,
    private readonly gateway: MatchGateway,
    private readonly sprites: SpritesService,
  ) {}

  start(): void {
    this.stop();
    this.pendingDeathAoes = [];
    this.pendingRangedImpacts = [];
    this.pendingBellStuns = [];
    this.interval = setInterval(() => this.tick(), this.dt * 1000);
    this.logger.log(`Combat tick started @ ${COMBAT_TICK_HZ}Hz`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.pendingDeathAoes = [];
    this.pendingRangedImpacts = [];
    this.pendingBellStuns = [];
  }

  private tick(): void {
    const match = this.matchService.getState();
    if (match.status !== 'active') {
      this.pendingDeathAoes = [];
      this.pendingRangedImpacts = [];
      this.pendingBellStuns = [];
      return;
    }

    const moved: Array<{ unitId: string; position: { x: number; y: number } }> =
      [];
    const damaged: Array<{ unitId: string; hp: number; maxHp: number }> = [];
    const engaged: Array<{ unitId: string; targetUnitId: string }> = [];
    const siege = {
      baseDamaged: null as {
        nationId: string;
        currentHp: number;
        maxHp: number;
      } | null,
      baseDestroyedNationId: null as string | null,
    };

    if (!match.zones) match.zones = [];

    // Resolve delayed death bombs before targeting so corpses aren't retargeted
    this.flushPendingDeathAoes(damaged);

    const allUnits = [...match.nationA.units, ...match.nationB.units].filter(
      (u) => u.state !== 'dead' && u.hp > 0,
    );

    // Release delayed ranged shots (after attack anim), then land pending impacts
    for (const unit of allUnits) {
      this.tickAttackRelease(unit);
    }
    this.flushPendingRangedImpacts(damaged, siege);
    this.flushPendingBellStuns();

    // Expire zones + apply zone slows
    const now = Date.now();
    match.zones = match.zones.filter((z) => z.expiresAt > now);
    for (const u of allUnits) {
      if ((u.stunRemaining ?? 0) > 0) {
        u.stunRemaining = Math.max(0, (u.stunRemaining ?? 0) - this.dt);
      }
      if ((u.slowRemaining ?? 0) > 0) {
        u.slowRemaining = Math.max(0, (u.slowRemaining ?? 0) - this.dt);
        if ((u.slowRemaining ?? 0) <= 0) u.slowFactor = 0;
      }
      // Strongest overlapping enemy-nation zone
      let zoneSlow = 0;
      for (const z of match.zones) {
        if (z.nationId === u.nationId) continue;
        const d = Math.hypot(u.position.x - z.x, u.position.y - z.y);
        if (d <= z.radius) zoneSlow = Math.max(zoneSlow, z.slowPct);
      }
      if (zoneSlow > 0) this.applySlow(u, zoneSlow);

      if (u.targetUnitId) {
        const t = allUnits.find((x) => x.id === u.targetUnitId);
        if (!t || t.state === 'dead' || t.hp <= 0) {
          u.targetUnitId = null;
          if (u.state === 'engaging') {
            u.state = 'advancing';
            this.gateway.emitUnitState({
              unitId: u.id,
              state: 'advancing',
              targetUnitId: null,
            });
          }
        }
      }
    }

    const desired = new Map<string, { x: number; y: number }>();

    for (const unit of allUnits) {
      if (unit.hp <= 0) continue;
      if ((unit.stunRemaining ?? 0) > 0) {
        this.clearSwingTiming(unit);
        desired.set(unit.id, { x: 0, y: 0 });
        continue;
      }

      const isA = unit.nationId === match.nationA.nationId;
      const enemies = allUnits.filter(
        (e) => e.nationId !== unit.nationId && e.hp > 0,
      );

      // Cocoon: immobile, no attack/aura; timer → emerge or stay until killed
      if (unit.state === 'cocooning') {
        desired.set(unit.id, { x: 0, y: 0 });
        this.clearSwingTiming(unit);
        unit.targetUnitId = null;
        unit.cocoonRemaining = (unit.cocoonRemaining ?? 0) - this.dt;
        if ((unit.cocoonRemaining ?? 0) <= 0 && unit.hp > 0) {
          this.emergeFromCocoon(unit, damaged);
        }
        continue;
      }

      // Stationary supports: hold position, no siege / no march
      if (unit.stationary) {
        desired.set(unit.id, { x: 0, y: 0 });
        if (unit.state === 'attacking_base') unit.state = 'advancing';
        // Optional engage if dealsDamage and enemy in range
        if (unit.dealsDamage !== false) {
          const target = this.findTarget(unit, enemies, isA);
          if (target && this.dist(unit, target) <= unit.attackRangeValue) {
            unit.targetUnitId = target.id;
            if (unit.state !== 'engaging') {
              engaged.push({ unitId: unit.id, targetUnitId: target.id });
            }
            unit.state = 'engaging';
            this.tickSwingImpact(unit, () => {
              if (unit.state !== 'engaging' || !unit.targetUnitId) return;
              const still = enemies.find((e) => e.id === unit.targetUnitId);
              if (!still || still.hp <= 0) return;
              this.fireUnitAttack(unit, still, enemies, damaged, isA, false);
            });
            unit.attackCooldown = (unit.attackCooldown ?? 0) - this.dt;
            if (
              (unit.attackCooldown ?? 0) <= 0 &&
              (unit.attackImpactIn ?? 0) <= 0 &&
              (unit.attackReleaseIn ?? 0) <= 0
            ) {
              this.beginUnitSwing(unit, target.position);
            }
          } else {
            unit.state = 'advancing';
            unit.targetUnitId = null;
          }
        } else {
          unit.state = 'advancing';
          unit.targetUnitId = null;
        }
        continue;
      }

      if (!unit.targetUnitId || unit.state === 'advancing') {
        const target = this.findTarget(unit, enemies, isA);
        if (target) {
          unit.targetUnitId = target.id;
          const dist = this.dist(unit, target);
          if (dist <= unit.attackRangeValue) {
            if (unit.state !== 'engaging') {
              engaged.push({ unitId: unit.id, targetUnitId: target.id });
            }
            unit.state = 'engaging';
          } else {
            unit.state = 'advancing';
          }
        }
      }

      if (unit.state === 'advancing') {
        let goalX: number;
        let goalY: number;

        if (unit.targetUnitId) {
          const t = enemies.find((e) => e.id === unit.targetUnitId);
          if (t) {
            const dx = t.position.x - unit.position.x;
            const dy = t.position.y - unit.position.y;
            const d = Math.hypot(dx, dy) || 1;
            const stopAt = Math.max(
              unit.attackRangeValue * 0.85,
              UNIT_RADIUS + 4,
            );
            if (d > stopAt) {
              const scale = (d - stopAt) / d;
              goalX = unit.position.x + dx * scale;
              goalY = unit.position.y + dy * scale;
            } else {
              goalX = unit.position.x;
              goalY = unit.position.y;
              unit.state = 'engaging';
              engaged.push({ unitId: unit.id, targetUnitId: t.id });
            }
          } else {
            goalX = isA ? BATTLEFIELD.baseBX : BATTLEFIELD.baseAX;
            goalY = unit.position.y;
          }
        } else {
          const enemyBaseX = isA ? BATTLEFIELD.baseBX : BATTLEFIELD.baseAX;
          const reach = this.baseAttackReach(unit);
          const distX = Math.abs(unit.position.x - enemyBaseX);
          if (distX <= reach) {
            unit.state = 'attacking_base';
            desired.set(unit.id, { x: 0, y: 0 });
            continue;
          }
          const stopAt = Math.max(unit.attackRangeValue * 0.9, UNIT_RADIUS + 4);
          const dir = unit.position.x < enemyBaseX ? 1 : -1;
          goalX = enemyBaseX - dir * stopAt;
          goalY = unit.position.y;
        }

        desired.set(unit.id, this.steerToward(unit, goalX, goalY));
      }

      if (unit.state === 'engaging' && unit.targetUnitId) {
        const target = enemies.find((e) => e.id === unit.targetUnitId);
        if (!target) {
          unit.state = 'advancing';
          unit.targetUnitId = null;
          this.clearSwingTiming(unit);
          continue;
        }

        const dist = this.dist(unit, target);
        if (dist > unit.attackRangeValue * 1.2) {
          unit.state = 'advancing';
          this.clearSwingTiming(unit);
          desired.set(
            unit.id,
            this.steerToward(unit, target.position.x, target.position.y),
          );
          continue;
        }

        desired.set(unit.id, { x: 0, y: 0 });

        this.tickSwingImpact(unit, () => {
          if (unit.state !== 'engaging' || !unit.targetUnitId) return;
          const still = enemies.find((e) => e.id === unit.targetUnitId);
          if (!still || still.hp <= 0) return;
          if (this.dist(unit, still) > unit.attackRangeValue * 1.25) return;
          this.fireUnitAttack(unit, still, enemies, damaged, isA, false);
        });

        unit.attackCooldown = (unit.attackCooldown ?? 0) - this.dt;
        if (
          (unit.attackCooldown ?? 0) <= 0 &&
          (unit.attackImpactIn ?? 0) <= 0 &&
          (unit.attackReleaseIn ?? 0) <= 0
        ) {
          this.beginUnitSwing(unit, target.position);
        }
      }

      if (unit.state === 'attacking_base') {
        if (unit.dealsDamage === false) {
          unit.state = 'advancing';
          desired.set(unit.id, { x: 0, y: 0 });
          continue;
        }
        const base = isA ? match.baseB : match.baseA;
        const blocker = this.findTarget(unit, enemies, isA);
        if (blocker) {
          const dist = this.dist(unit, blocker);
          if (dist <= unit.attackRangeValue) {
            unit.state = 'engaging';
            unit.targetUnitId = blocker.id;
            this.clearSwingTiming(unit);
            engaged.push({ unitId: unit.id, targetUnitId: blocker.id });
            desired.set(unit.id, { x: 0, y: 0 });
            continue;
          }
          if (dist <= Math.max(unit.detectionRange, 200)) {
            unit.state = 'advancing';
            unit.targetUnitId = blocker.id;
            this.clearSwingTiming(unit);
            desired.set(
              unit.id,
              this.steerToward(
                unit,
                blocker.position.x,
                blocker.position.y,
              ),
            );
            continue;
          }
        }

        desired.set(unit.id, { x: 0, y: 0 });

        const baseX = isA ? BATTLEFIELD.baseBX : BATTLEFIELD.baseAX;
        const baseY = (BATTLEFIELD.laneMinY + BATTLEFIELD.laneMaxY) / 2;

        this.tickSwingImpact(unit, () => {
          if (unit.state !== 'attacking_base') return;
          base.currentHp = Math.max(0, base.currentHp - unit.attackDamage);
          siege.baseDamaged = {
            nationId: base.nationId,
            currentHp: base.currentHp,
            maxHp: base.maxHp,
          };
          if (base.currentHp <= 0) {
            siege.baseDestroyedNationId = base.nationId;
          }
        });

        unit.attackCooldown = (unit.attackCooldown ?? 0) - this.dt;
        if (
          (unit.attackCooldown ?? 0) <= 0 &&
          (unit.attackImpactIn ?? 0) <= 0 &&
          (unit.attackReleaseIn ?? 0) <= 0
        ) {
          this.beginUnitSwing(unit, { x: baseX, y: baseY });
        }
      }
    }

    // Aura pulses + trail drops (before movement so trails mark current pos)
    for (const unit of allUnits) {
      if (unit.hp <= 0 || unit.state === 'cocooning') continue;
      const isA = unit.nationId === match.nationA.nationId;
      const enemies = allUnits.filter(
        (e) => e.nationId !== unit.nationId && e.hp > 0,
      );
      this.tickAura(unit, enemies, damaged, isA);
      this.tickTrail(unit, match);
    }

    for (const unit of allUnits) {
      if (unit.hp <= 0 || unit.state === 'dead') continue;

      let vx = desired.get(unit.id)?.x ?? 0;
      let vy = desired.get(unit.id)?.y ?? 0;

      let sepX = 0;
      let sepY = 0;
      let sepCount = 0;
      for (const other of allUnits) {
        if (other.id === unit.id || other.hp <= 0) continue;
        const dx = unit.position.x - other.position.x;
        const dy = unit.position.y - other.position.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const minDist = UNIT_RADIUS * 2;
        if (d < minDist) {
          const push = (minDist - d) / minDist;
          sepX += (dx / d) * push;
          sepY += (dy / d) * push;
          sepCount++;
        }
      }
      if (sepCount > 0) {
        const spd = this.effectiveMoveSpeed(unit);
        vx += sepX * SEPARATION_STRENGTH * spd * this.dt;
        vy += sepY * SEPARATION_STRENGTH * spd * this.dt;
      }

      if (
        unit.stationary ||
        unit.state === 'cocooning' ||
        unit.state === 'engaging' ||
        unit.state === 'attacking_base'
      ) {
        vx = sepCount > 0 ? sepX * SEPARATION_STRENGTH * 8 : 0;
        vy = sepCount > 0 ? sepY * SEPARATION_STRENGTH * 8 : 0;
      }

      const prevX = unit.position.x;
      const prevY = unit.position.y;
      unit.position.x += vx;
      unit.position.y += vy;

      unit.position.x = Math.max(
        BATTLEFIELD.baseAX,
        Math.min(BATTLEFIELD.baseBX, unit.position.x),
      );
      unit.position.y = Math.max(
        BATTLEFIELD.laneMinY,
        Math.min(BATTLEFIELD.laneMaxY, unit.position.y),
      );

      if (
        !unit.stationary &&
        unit.state === 'advancing' &&
        !unit.targetUnitId
      ) {
        const isA = unit.nationId === match.nationA.nationId;
        const enemyBaseX = isA ? BATTLEFIELD.baseBX : BATTLEFIELD.baseAX;
        if (
          Math.abs(unit.position.x - enemyBaseX) <= this.baseAttackReach(unit)
        ) {
          unit.state = 'attacking_base';
        }
      }

      if (!unit.stationary && unit.state === 'attacking_base') {
        const isA = unit.nationId === match.nationA.nationId;
        const enemyBaseX = isA ? BATTLEFIELD.baseBX : BATTLEFIELD.baseAX;
        if (
          Math.abs(unit.position.x - enemyBaseX) >
          this.baseAttackReach(unit) * 1.25
        ) {
          unit.state = 'advancing';
        }
      }

      if (
        Math.abs(unit.position.x - prevX) > 0.05 ||
        Math.abs(unit.position.y - prevY) > 0.05
      ) {
        moved.push({
          unitId: unit.id,
          position: { ...unit.position },
        });
      }
    }

    match.nationA.units = match.nationA.units.filter((u) => u.state !== 'dead');
    match.nationB.units = match.nationB.units.filter((u) => u.state !== 'dead');
    match.frontline = this.matchService.computeFrontlineFromBases(match);

    this.tickBaseDefense(
      match.baseA,
      BATTLEFIELD.baseAX,
      match.nationB.units,
      match,
      damaged,
    );
    this.tickBaseDefense(
      match.baseB,
      BATTLEFIELD.baseBX,
      match.nationA.units,
      match,
      damaged,
    );

    match.nationA.units = match.nationA.units.filter((u) => u.state !== 'dead');
    match.nationB.units = match.nationB.units.filter((u) => u.state !== 'dead');

    if (moved.length) this.gateway.emitUnitsMoved(moved);
    for (const e of engaged) {
      this.gateway.emitUnitEngaged(e.unitId, e.targetUnitId);
    }
    for (const d of damaged) {
      this.gateway.emitUnitDamaged(d.unitId, d.hp, d.maxHp);
    }
    if (siege.baseDamaged) {
      this.gateway.emitBaseDamaged(
        siege.baseDamaged.nationId,
        siege.baseDamaged.currentHp,
        siege.baseDamaged.maxHp,
      );
      this.gateway.emitMatchUpdate(match);
    }

    if (siege.baseDestroyedNationId) {
      this.gateway.emitBaseDestroyed(siege.baseDestroyedNationId);
      const winnerNationId =
        siege.baseDestroyedNationId === match.nationA.nationId
          ? match.nationB.nationId
          : match.nationA.nationId;
      void this.matchService.endMatch('base_destroyed', winnerNationId);
    }
  }

  private noteHp(
    damaged: Array<{ unitId: string; hp: number; maxHp: number }>,
    unit: Unit,
  ) {
    const row = { unitId: unit.id, hp: unit.hp, maxHp: unit.maxHp };
    const i = damaged.findIndex((d) => d.unitId === unit.id);
    if (i >= 0) damaged[i] = row;
    else damaged.push(row);
  }

  private tickAura(
    unit: Unit,
    enemies: Unit[],
    damaged: Array<{ unitId: string; hp: number; maxHp: number }>,
    isA: boolean,
  ) {
    if ((unit.auraRadius ?? 0) <= 0) return;
    const hasEffect =
      (unit.auraDamagePerTick ?? 0) > 0 ||
      (unit.auraSlowPct ?? 0) > 0 ||
      ((unit.auraStunChance ?? 0) > 0 && (unit.auraStunDuration ?? 0) > 0);
    if (!hasEffect) return;

    unit.auraCooldown = (unit.auraCooldown ?? 0) - this.dt;
    if ((unit.auraCooldown ?? 0) > 0) return;
    unit.auraCooldown = Math.max(0.05, unit.auraInterval ?? 1);

    // Bell: play Attack anim now; apply stun when anim ends (SFX on last frame)
    if (unit.spriteKey === 'bell_ringer') {
      this.gateway.emitUnitAttack(unit.id);
      const ringDelay = Math.max(0.15, this.attackAnimDurationSec(unit));
      this.pendingBellStuns.push({
        remaining: ringDelay,
        ringerId: unit.id,
      });
      return;
    }

    const r = unit.auraRadius;
    for (const e of enemies) {
      if (this.dist(unit, e) > r) continue;
      if ((unit.auraSlowPct ?? 0) > 0) this.applySlow(e, unit.auraSlowPct);
      if ((unit.auraDamagePerTick ?? 0) > 0) {
        const before = e.hp;
        e.hp = Math.max(0, e.hp - unit.auraDamagePerTick);
        if (e.hp !== before) this.noteHp(damaged, e);
        if (e.hp <= 0 && e.state !== 'dead') {
          this.killUnit(e, unit, damaged);
          this.noteHp(damaged, e); // cocoon HP overwrites lethal 0
        }
      }
      if (
        (unit.auraStunChance ?? 0) > 0 &&
        (unit.auraStunDuration ?? 0) > 0 &&
        Math.random() < unit.auraStunChance
      ) {
        const resist = Math.min(1, Math.max(0, e.stunResist ?? 0));
        const dur = unit.auraStunDuration * (1 - resist);
        if (dur > 0) {
          e.stunRemaining = Math.max(e.stunRemaining ?? 0, dur);
        }
      }
    }
  }

  private flushPendingBellStuns() {
    if (!this.pendingBellStuns.length) return;
    const match = this.matchService.getState();
    const keep: typeof this.pendingBellStuns = [];
    for (const p of this.pendingBellStuns) {
      p.remaining -= this.dt;
      if (p.remaining > 0) {
        keep.push(p);
        continue;
      }
      const ringer = [...match.nationA.units, ...match.nationB.units].find(
        (u) => u.id === p.ringerId && u.hp > 0 && u.state !== 'dead',
      );
      if (!ringer || (ringer.auraRadius ?? 0) <= 0) continue;
      const enemies = [...match.nationA.units, ...match.nationB.units].filter(
        (e) =>
          e.nationId !== ringer.nationId &&
          e.hp > 0 &&
          e.state !== 'dead',
      );
      const r = ringer.auraRadius;
      for (const e of enemies) {
        if (this.dist(ringer, e) > r) continue;
        if (
          (ringer.auraStunChance ?? 0) <= 0 ||
          (ringer.auraStunDuration ?? 0) <= 0
        ) {
          continue;
        }
        if (Math.random() >= ringer.auraStunChance) continue;
        const resist = Math.min(1, Math.max(0, e.stunResist ?? 0));
        const dur = ringer.auraStunDuration * (1 - resist);
        if (dur > 0) {
          e.stunRemaining = Math.max(e.stunRemaining ?? 0, dur);
        }
      }
    }
    this.pendingBellStuns = keep;
  }

  private tickTrail(unit: Unit, match: MatchState) {
    if ((unit.trailSlowPct ?? 0) <= 0 || (unit.trailDuration ?? 0) <= 0) return;
    const interval = Math.max(0.1, unit.trailInterval || 0.5);
    unit.trailCooldown = (unit.trailCooldown ?? 0) - this.dt;
    if ((unit.trailCooldown ?? 0) > 0) return;
    unit.trailCooldown = interval;
    match.zones.push({
      id: randomUUID(),
      nationId: unit.nationId,
      x: unit.position.x,
      y: unit.position.y,
      radius: TRAIL_ZONE_RADIUS,
      slowPct: unit.trailSlowPct,
      expiresAt: Date.now() + unit.trailDuration * 1000,
    });
  }

  private applySlow(unit: Unit, slowPct: number) {
    const pct = Math.max(0, slowPct);
    if (pct <= 0) return;
    unit.slowFactor = Math.max(unit.slowFactor ?? 0, pct);
    unit.slowRemaining = Math.max(unit.slowRemaining ?? 0, SLOW_REFRESH_SEC);
  }

  private effectiveMoveSpeed(unit: Unit): number {
    const factor = Math.max(0, unit.slowFactor ?? 0);
    return unit.moveSpeed * Math.max(0.05, 1 - factor);
  }

  private tickBaseDefense(
    base: {
      nationId: string;
      currentHp: number;
      attackCooldown?: number;
    },
    baseX: number,
    enemies: Unit[],
    match: MatchState,
    damaged: Array<{ unitId: string; hp: number; maxHp: number }>,
  ) {
    if (!base.nationId || base.currentHp <= 0) return;
    const range = match.baseAttackRange ?? 0;
    const dmg = match.baseAttackDamage ?? 0;
    const spd = match.baseAttackSpeed ?? 0;
    if (range <= 0 || dmg <= 0 || spd <= 0) return;

    base.attackCooldown = (base.attackCooldown ?? 0) - this.dt;
    if ((base.attackCooldown ?? 0) > 0) return;

    const baseY = (BATTLEFIELD.laneMinY + BATTLEFIELD.laneMaxY) / 2;
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (e.hp <= 0 || e.state === 'dead') continue;
      const d = Math.hypot(e.position.x - baseX, e.position.y - baseY);
      if (d <= range && d < bestD) {
        best = e;
        bestD = d;
      }
    }
    if (!best) return;

    this.gateway.emitProjectile({
      id: `base-${base.nationId}-${Date.now()}`,
      kind: 'base',
      from: { x: baseX, y: baseY - 40 },
      to: { ...best.position },
      durationMs: 280,
    });

    best.hp = Math.max(0, best.hp - dmg);
    this.noteHp(damaged, best);
    base.attackCooldown = 1 / Math.max(0.05, spd);

    if (best.hp <= 0) {
      this.killUnit(
        best,
        {
          id: `base:${base.nationId}`,
          username: 'Base',
          displayName: 'Base',
          nationId: base.nationId,
        } as Unit,
        damaged,
      );
      this.noteHp(damaged, best);
    }
  }

  private clearSwingTiming(unit: Unit) {
    unit.attackImpactIn = 0;
    unit.attackReleaseIn = 0;
    unit.pendingAim = null;
  }

  /**
   * Overlay Attack plays at fixed 10fps. Duration = frameCount/10 (+ pad for
   * socket/texture lag). Cooldown/period can be longer — remainder is idle hold.
   */
  /**
   * Overlay attack playback FPS (must match battle-overlay attackAnimFps).
   * Atk/s ≤ 1 → fixed 10 FPS. Atk/s > 1 → compress clip into 1/Atk/s.
   */
  private static readonly OVERLAY_ATTACK_FPS = 10;
  private static readonly ATTACK_ANIM_PAD_SEC = 0.15;

  private attackFrameCount(spriteKey: string | undefined): number {
    const key = (spriteKey || '').toLowerCase();
    if (!key) return 12;
    const clips = this.sprites.getCatalog().clips[key];
    const attack = clips?.attack;
    if (!attack) return 12;
    const n =
      attack.east?.length ||
      attack.west?.length ||
      attack.south?.length ||
      attack.north?.length ||
      0;
    return n > 0 ? n : 12;
  }

  private attackPlaybackFps(unit: Unit): number {
    const frames = Math.max(1, this.attackFrameCount(unit.spriteKey));
    const speed = Math.max(0.05, unit.attackSpeed || 1);
    if (speed <= 1) return CombatTickService.OVERLAY_ATTACK_FPS;
    return Math.max(
      CombatTickService.OVERLAY_ATTACK_FPS,
      frames * speed,
    );
  }

  /** Full Attack clip duration at overlay playback FPS (+ pad when not sped up). */
  private attackAnimDurationSec(unit: Unit): number {
    const frames = Math.max(1, this.attackFrameCount(unit.spriteKey));
    const fps = this.attackPlaybackFps(unit);
    const pad =
      unit.attackSpeed > 1
        ? 0.05
        : CombatTickService.ATTACK_ANIM_PAD_SEC;
    return frames / fps + pad;
  }

  /** Seconds until Attack frame `index` is shown (frame 0 at t=0). */
  private attackFrameDelaySec(unit: Unit, frameIndex: number | null): number {
    const frames = Math.max(1, this.attackFrameCount(unit.spriteKey));
    const last = frames - 1;
    let f = frameIndex;
    if (f == null || !Number.isFinite(f) || f < 0) f = last;
    f = Math.min(last, Math.floor(f));
    return f / this.attackPlaybackFps(unit);
  }

  private beginUnitSwing(
    unit: Unit,
    aim: { x: number; y: number },
  ) {
    if (unit.dealsDamage === false) return;
    const period = 1 / Math.max(0.05, unit.attackSpeed);
    const animDur = Math.max(0.15, this.attackAnimDurationSec(unit));
    this.gateway.emitUnitAttack(unit.id);

    // Crossbower / cannon / archer: release at attackShotFrame (default last)
    if (this.delaysProjectileUntilAnimEnd(unit)) {
      unit.pendingAim = { ...aim };
      unit.attackReleaseIn = this.attackFrameDelaySec(
        unit,
        unit.attackShotFrame,
      );
      unit.attackImpactIn = 0;
      // Next swing only after full Attack anim finishes
      unit.attackCooldown = Math.max(period, animDur);
      return;
    }

    // Melee: damage near end of Attack anim; wait full Atk period between swings
    unit.attackImpactIn = Math.min(period, animDur);
    unit.attackCooldown = Math.max(period, animDur);
  }

  private delaysProjectileUntilAnimEnd(unit: Unit): boolean {
    const key = unit.spriteKey || '';
    return (
      unit.attackRange === 'ranged' &&
      (key === 'crossbower' || key === 'cannon' || key === 'archer')
    );
  }

  /** Emit projectile visual; returns travel duration in ms. */
  private releaseRangedShot(
    unit: Unit,
    aim: { x: number; y: number },
  ): number {
    const fx = this.rangedProjectileFx(unit);
    const from = this.muzzlePoint(unit, aim);
    const travelMs = this.projectileTravelMs(unit, from, aim);
    this.gateway.emitProjectile({
      id: `${unit.id}-${Date.now()}`,
      kind: fx.kind,
      from,
      to: { ...aim },
      durationMs: travelMs,
      spriteKey: fx.spriteKey,
      flip: fx.flip,
      explodeEffect: fx.explodeEffect,
      explodeRadius: fx.explodeRadius,
      unitId: unit.id,
    });
    return travelMs;
  }

  private tickAttackRelease(unit: Unit) {
    if ((unit.attackReleaseIn ?? 0) <= 0) return;
    unit.attackReleaseIn = (unit.attackReleaseIn ?? 0) - this.dt;
    if ((unit.attackReleaseIn ?? 0) > 0) return;
    unit.attackReleaseIn = 0;

    const match = this.matchService.getState();
    let aim = unit.pendingAim ?? null;
    const vsBase = unit.state === 'attacking_base';
    if (unit.targetUnitId) {
      const t = [...match.nationA.units, ...match.nationB.units].find(
        (u) => u.id === unit.targetUnitId && u.hp > 0 && u.state !== 'dead',
      );
      if (t) aim = { ...t.position };
    } else if (vsBase) {
      const isA = unit.nationId === match.nationA.nationId;
      aim = {
        x: isA ? BATTLEFIELD.baseBX : BATTLEFIELD.baseAX,
        y: unit.position.y,
      };
    }
    unit.pendingAim = null;
    if (!aim) return;

    const travelMs = this.releaseRangedShot(unit, aim);
    this.pendingRangedImpacts.push({
      remaining: travelMs / 1000,
      shooterId: unit.id,
      targetUnitId: unit.targetUnitId,
      aim: { ...aim },
      vsBase,
    });
  }

  private flushPendingRangedImpacts(
    damaged: Array<{ unitId: string; hp: number; maxHp: number }>,
    siege: {
      baseDamaged: {
        nationId: string;
        currentHp: number;
        maxHp: number;
      } | null;
      baseDestroyedNationId: string | null;
    },
  ) {
    if (!this.pendingRangedImpacts.length) return;
    const match = this.matchService.getState();
    const keep: typeof this.pendingRangedImpacts = [];

    for (const p of this.pendingRangedImpacts) {
      p.remaining -= this.dt;
      if (p.remaining > 0) {
        keep.push(p);
        continue;
      }

      const shooter = [...match.nationA.units, ...match.nationB.units].find(
        (u) => u.id === p.shooterId && u.hp > 0 && u.state !== 'dead',
      );
      if (!shooter) continue;

      const isA = shooter.nationId === match.nationA.nationId;

      if (p.vsBase) {
        const base = isA ? match.baseB : match.baseA;
        base.currentHp = Math.max(0, base.currentHp - shooter.attackDamage);
        siege.baseDamaged = {
          nationId: base.nationId,
          currentHp: base.currentHp,
          maxHp: base.maxHp,
        };
        if (base.currentHp <= 0) {
          siege.baseDestroyedNationId = base.nationId;
        }
        continue;
      }

      const enemies = [...match.nationA.units, ...match.nationB.units].filter(
        (e) =>
          e.nationId !== shooter.nationId &&
          e.hp > 0 &&
          e.state !== 'dead',
      );
      let primary =
        (p.targetUnitId
          ? enemies.find((e) => e.id === p.targetUnitId)
          : undefined) ?? null;
      if (!primary || primary.hp <= 0) {
        primary =
          enemies
            .map((e) => ({ e, d: this.dist(shooter, e) }))
            .filter(({ d }) => d <= shooter.attackRangeValue * 1.35)
            .sort((a, b) => a.d - b.d)[0]?.e ?? null;
      }
      if (!primary) continue;
      this.fireUnitAttack(shooter, primary, enemies, damaged, isA, false);
    }

    this.pendingRangedImpacts = keep;
  }

  /** Front-center edge of unit toward aim (approx display half-size). */
  private muzzlePoint(
    unit: Unit,
    aim: { x: number; y: number },
  ): { x: number; y: number } {
    const half = 32 * Math.max(0.5, unit.scale ?? 1);
    const dx = aim.x - unit.position.x;
    const facing = dx >= 0 ? 1 : -1;
    return {
      x: unit.position.x + facing * half * 0.92,
      y: unit.position.y - half * 0.08,
    };
  }

  private projectileTravelMs(
    unit: Unit,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): number {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const speed = unit.spriteKey === 'cannon' ? 520 : 780;
    const ms = Math.round((dist / speed) * 1000);
    if (unit.spriteKey === 'cannon') return Math.max(280, Math.min(650, ms));
    return Math.max(160, Math.min(420, ms));
  }

  /** Visual projectile for ranged units (mage uses attack-anim explosion instead). */
  private rangedProjectileFx(unit: Unit): {
    kind: string;
    spriteKey?: string;
    flip?: boolean;
    explodeEffect?: string;
    explodeRadius?: number;
  } {
    const key = unit.spriteKey || '';
    if (key === 'crossbower') {
      return {
        kind: 'crossbower_arrow',
        spriteKey: 'crossbower_arrow',
        flip: true,
      };
    }
    if (key === 'cannon') {
      return {
        kind: 'cannon_ball',
        spriteKey: 'cannon_ball',
        flip: false,
        explodeEffect: 'cannon_explosion',
        explodeRadius: unit.splashRadius ?? 100,
      };
    }
    if (key === 'archer') {
      return {
        kind: 'archer_arrow',
        spriteKey: 'archer_arrow',
        flip: true,
      };
    }
    return { kind: 'arrow' };
  }

  private tickSwingImpact(unit: Unit, onImpact: () => void) {
    if ((unit.attackImpactIn ?? 0) <= 0) return;
    unit.attackImpactIn = (unit.attackImpactIn ?? 0) - this.dt;
    if ((unit.attackImpactIn ?? 0) > 0) return;
    unit.attackImpactIn = 0;
    onImpact();
  }

  private fireUnitAttack(
    unit: Unit,
    primary: Unit,
    enemies: Unit[],
    damaged: Array<{ unitId: string; hp: number; maxHp: number }>,
    isA: boolean,
    emitProjectile = true,
  ) {
    if (unit.dealsDamage === false) return;

    if (
      emitProjectile &&
      unit.attackRange === 'ranged' &&
      unit.spriteKey !== 'mage'
    ) {
      this.releaseRangedShot(unit, primary.position);
    }

    const victims = new Map<string, { unit: Unit; isPrimary: boolean }>();
    victims.set(primary.id, { unit: primary, isPrimary: true });

    if (unit.isSplash && (unit.splashRadius ?? 0) > 0) {
      const r = unit.splashRadius!;
      for (const e of enemies) {
        if (e.id === primary.id || e.hp <= 0) continue;
        if (this.dist(primary, e) <= r) {
          victims.set(e.id, { unit: e, isPrimary: false });
        }
      }
    }

    const splashDmg =
      unit.aoeDamage > 0 ? unit.aoeDamage : unit.attackDamage * 0.55;

    let primaryDied = false;
    let healed = false;
    const healBefore = unit.hp;

    for (const { unit: victim, isPrimary } of victims.values()) {
      let dmg = isPrimary ? unit.attackDamage : splashDmg;
      const mod = victim.damageTakenMods?.[unit.unitTypeId] ?? 0;
      dmg = Math.max(0, dmg * (1 + mod));

      const before = victim.hp;
      victim.hp = Math.max(0, victim.hp - dmg);
      const dealt = before - victim.hp;
      if (dealt > 0) {
        this.noteHp(damaged, victim);
        if ((unit.lifesteal ?? 0) > 0) {
          unit.hp = Math.min(
            unit.maxHp,
            unit.hp + dealt * unit.lifesteal,
          );
          healed = true;
        }
      }
      this.applyCrowdControl(unit, victim, isA);

      if (victim.hp <= 0 && victim.state !== 'dead') {
        this.killUnit(victim, unit, damaged);
        this.noteHp(damaged, victim); // cocoon HP overwrites lethal 0
        if (victim.id === primary.id) primaryDied = true;
      }
    }

    if (healed && unit.hp !== healBefore) {
      this.noteHp(damaged, unit);
    }

    if (primaryDied || primary.hp <= 0) {
      unit.targetUnitId = null;
      unit.state = 'advancing';
      this.gateway.emitUnitState({
        unitId: unit.id,
        state: 'advancing',
        targetUnitId: null,
      });
    }
  }

  /**
   * Mark dead, remove from match immediately (avoids match:update respawn),
   * schedule optional on-death AoE so boom syncs with VFX.
   */
  private killUnit(
    victim: Unit,
    killer: Unit,
    damaged: Array<{ unitId: string; hp: number; maxHp: number }>,
  ) {
    if (victim.state === 'dead') return;
    if (this.tryEnterCocoon(victim, damaged)) return;

    victim.state = 'dead';
    victim.hp = 0;
    victim.targetUnitId = null;

    this.gateway.emitUnitDied({
      unitId: victim.id,
      nationId: victim.nationId,
      victimUsername: victim.username,
      victimDisplayName: victim.displayName,
      killerUnitId: killer.id,
      killerUsername: killer.username,
      killerDisplayName: killer.displayName,
      killerNationId: killer.nationId,
      spriteKey: victim.spriteKey,
      onDeathAoe: !!victim.onDeathAoe,
    });

    // Drop from arrays now so spawn → match:update cannot resurrect corpses
    this.removeUnitFromMatch(victim);

    if (victim.onDeathAoe && (victim.splashRadius ?? 0) > 0) {
      this.pendingDeathAoes.push({
        remaining: this.deathAoeDelaySec,
        dead: victim,
      });
    }
  }

  private removeUnitFromMatch(unit: Unit) {
    const match = this.matchService.getState();
    match.nationA.units = match.nationA.units.filter((u) => u.id !== unit.id);
    match.nationB.units = match.nationB.units.filter((u) => u.id !== unit.id);
  }

  private flushPendingDeathAoes(
    damaged: Array<{ unitId: string; hp: number; maxHp: number }>,
  ) {
    if (!this.pendingDeathAoes.length) return;
    const due: Unit[] = [];
    const keep: typeof this.pendingDeathAoes = [];
    for (const p of this.pendingDeathAoes) {
      p.remaining -= this.dt;
      if (p.remaining <= 0) due.push(p.dead);
      else keep.push(p);
    }
    this.pendingDeathAoes = keep;
    for (const dead of due) {
      this.triggerDeathAoe(dead, damaged);
    }
  }

  /** First death → cocoon with fixed HP; returns true if entered. */
  private tryEnterCocoon(
    victim: Unit,
    damaged: Array<{ unitId: string; hp: number; maxHp: number }>,
  ): boolean {
    if (
      !victim.canMolt ||
      victim.hasMoltUsed ||
      victim.state === 'cocooning' ||
      !victim.moltFormSnapshot ||
      (victim.cocoonHp ?? 0) <= 0
    ) {
      return false;
    }

    victim.hasMoltUsed = true;
    victim.state = 'cocooning';
    victim.targetUnitId = null;
    this.clearSwingTiming(victim);
    victim.attackCooldown = 0;
    victim.stunRemaining = 0;
    victim.hp = victim.cocoonHp;
    victim.maxHp = victim.cocoonHp;
    victim.cocoonRemaining = Math.max(0.1, victim.cocoonDurationSec ?? 5);
    if (victim.cocoonSpriteKey) {
      victim.spriteKey = victim.cocoonSpriteKey;
    }

    this.noteHp(damaged, victim);
    this.gateway.emitUnitState({
      unitId: victim.id,
      state: 'cocooning',
      targetUnitId: null,
    });
    this.gateway.emitUnitMolted(victim);
    return true;
  }

  private emergeFromCocoon(
    unit: Unit,
    damaged: Array<{ unitId: string; hp: number; maxHp: number }>,
  ) {
    const snap = unit.moltFormSnapshot;
    if (!snap || unit.hp <= 0) return;

    unit.unitTypeId = snap.unitTypeId;
    unit.unitTypeName = snap.unitTypeName;
    unit.spriteKey = snap.spriteKey;
    unit.maxHp = snap.maxHp;
    unit.hp = snap.maxHp;
    unit.attackDamage = snap.attackDamage;
    unit.attackSpeed = snap.attackSpeed;
    unit.moveSpeed = snap.moveSpeed;
    unit.attackRange = snap.attackRange;
    unit.attackRangeValue = snap.attackRangeValue;
    unit.detectionRange = snap.detectionRange;
    unit.isSplash = snap.isSplash;
    unit.splashRadius = snap.splashRadius;
    unit.stunChance = snap.stunChance;
    unit.stunDuration = snap.stunDuration;
    unit.knockbackForce = snap.knockbackForce;
    unit.stunResist = snap.stunResist;
    unit.knockbackResist = snap.knockbackResist;
    unit.aoeDamage = snap.aoeDamage;
    unit.damageTakenMods = { ...(snap.damageTakenMods ?? {}) };
    unit.lifesteal = snap.lifesteal;
    unit.scale = snap.scale;
    unit.sfxSpawnVolume = snap.sfxSpawnVolume ?? 1;
    unit.sfxAttackVolume = snap.sfxAttackVolume ?? 1;
    unit.attackSfxFrame =
      typeof snap.attackSfxFrame === 'number' ? snap.attackSfxFrame : null;
    unit.attackShotFrame =
      typeof snap.attackShotFrame === 'number' ? snap.attackShotFrame : null;
    unit.maxActivePerNation = snap.maxActivePerNation;
    unit.stationary = snap.stationary;
    unit.dealsDamage = snap.dealsDamage;
    unit.onDeathAoe = snap.onDeathAoe;
    unit.auraRadius = snap.auraRadius;
    unit.auraInterval = snap.auraInterval;
    unit.auraDamagePerTick = snap.auraDamagePerTick;
    unit.auraSlowPct = snap.auraSlowPct;
    unit.auraStunChance = snap.auraStunChance;
    unit.auraStunDuration = snap.auraStunDuration;
    unit.trailSlowPct = snap.trailSlowPct;
    unit.trailDuration = snap.trailDuration;
    unit.trailInterval = snap.trailInterval;
    // Form 2 cannot molt again
    unit.canMolt = false;
    unit.moltFormSnapshot = null;
    unit.cocoonRemaining = 0;
    unit.state = 'advancing';
    unit.targetUnitId = null;

    this.noteHp(damaged, unit);
    this.gateway.emitUnitState({
      unitId: unit.id,
      state: 'advancing',
      targetUnitId: null,
    });
    this.gateway.emitUnitMolted(unit);
  }

  private triggerDeathAoe(
    dead: Unit,
    damaged: Array<{ unitId: string; hp: number; maxHp: number }>,
  ) {
    const match = this.matchService.getState();
    const radius = dead.splashRadius ?? 0;
    const dmg =
      dead.aoeDamage > 0 ? dead.aoeDamage : dead.attackDamage * 0.55;
    this.gateway.emitExplosion({
      x: dead.position.x,
      y: dead.position.y,
      radius,
      effect: `${dead.spriteKey}_explosion`,
    });

    const enemies = [
      ...match.nationA.units,
      ...match.nationB.units,
    ].filter(
      (e) =>
        e.id !== dead.id &&
        e.nationId !== dead.nationId &&
        e.state !== 'dead' &&
        e.hp > 0,
    );

    const isA = dead.nationId === match.nationA.nationId;
    for (const e of enemies) {
      if (this.dist(dead, e) > radius) continue;
      const mod = e.damageTakenMods?.[dead.unitTypeId] ?? 0;
      const applied = Math.max(0, dmg * (1 + mod));
      const before = e.hp;
      e.hp = Math.max(0, e.hp - applied);
      if (e.hp !== before) this.noteHp(damaged, e);
      this.applyCrowdControl(dead, e, isA);
      if (e.hp <= 0 && e.state !== 'dead') {
        this.killUnit(e, dead, damaged);
        this.noteHp(damaged, e); // cocoon HP overwrites lethal 0
      }
    }
  }

  private applyCrowdControl(attacker: Unit, victim: Unit, isA: boolean) {
    if (victim.hp <= 0) return;
    const stunResist = Math.min(1, Math.max(0, victim.stunResist ?? 0));
    const kbResist = Math.min(1, Math.max(0, victim.knockbackResist ?? 0));
    const stunChance = attacker.stunChance * (1 - stunResist);
    const stunDuration = attacker.stunDuration * (1 - stunResist);
    if (stunChance > 0 && stunDuration > 0 && Math.random() < stunChance) {
      victim.stunRemaining = Math.max(
        victim.stunRemaining ?? 0,
        stunDuration,
      );
    }
    const force = attacker.knockbackForce * (1 - kbResist);
    if (force > 0) {
      const dx = victim.position.x - attacker.position.x;
      const dy = victim.position.y - attacker.position.y;
      const d = Math.hypot(dx, dy) || 1;
      const fx = d < 2 ? (isA ? 1 : -1) : dx / d;
      const fy = d < 2 ? 0 : dy / d;
      victim.position.x += fx * force;
      victim.position.y += fy * force * 0.35;
      victim.position.x = Math.max(
        BATTLEFIELD.baseAX,
        Math.min(BATTLEFIELD.baseBX, victim.position.x),
      );
      victim.position.y = Math.max(
        BATTLEFIELD.laneMinY,
        Math.min(BATTLEFIELD.laneMaxY, victim.position.y),
      );
      this.gateway.emitUnitsMoved([
        { unitId: victim.id, position: { ...victim.position } },
      ]);
    }
  }

  private baseAttackReach(unit: Unit): number {
    return Math.max(unit.attackRangeValue, BATTLEFIELD.baseReachDist);
  }

  private steerToward(
    unit: Unit,
    goalX: number,
    goalY: number,
  ): { x: number; y: number } {
    const dx = goalX - unit.position.x;
    const dy = goalY - unit.position.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return { x: 0, y: 0 };
    const step = Math.min(d, this.effectiveMoveSpeed(unit) * this.dt);
    return { x: (dx / d) * step, y: (dy / d) * step };
  }

  private dist(a: Unit, b: Unit): number {
    return Math.hypot(
      a.position.x - b.position.x,
      a.position.y - b.position.y,
    );
  }

  private findTarget(
    unit: Unit,
    enemies: Unit[],
    isA: boolean,
  ): Unit | null {
    const ourBaseX = isA ? BATTLEFIELD.baseAX : BATTLEFIELD.baseBX;
    let best: Unit | null = null;
    let bestScore = Infinity;

    for (const e of enemies) {
      const d = this.dist(unit, e);
      const dx = Math.abs(e.position.x - unit.position.x);
      const nearOurBase =
        Math.abs(e.position.x - ourBaseX) <= BATTLEFIELD.baseReachDist + 100;
      const raidingHome = e.state === 'attacking_base' || nearOurBase;

      const inDetect = dx <= unit.detectionRange;
      const homeDefenseRange = Math.max(unit.detectionRange, 450);
      const inHomeDefense = raidingHome && dx <= homeDefenseRange;

      if (!inDetect && !inHomeDefense) continue;

      let score = d;
      if (e.state === 'attacking_base') score -= 1000;
      else if (nearOurBase) score -= 400;
      if (d <= unit.attackRangeValue) score -= 80;

      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }
}
