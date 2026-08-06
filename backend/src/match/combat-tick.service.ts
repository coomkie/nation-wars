import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { MatchService } from './match.service';
import { MatchGateway } from './match.gateway';
import { BATTLEFIELD, COMBAT_TICK_HZ, MatchState, Unit } from '../common/types';

/** Soft collision radius — keeps units from stacking on one spot */
const UNIT_RADIUS = 22;
const SEPARATION_STRENGTH = 0.55;

@Injectable()
export class CombatTickService {
  private readonly logger = new Logger(CombatTickService.name);
  private interval: NodeJS.Timeout | null = null;
  private readonly dt = 1 / COMBAT_TICK_HZ;

  constructor(
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService,
    private readonly gateway: MatchGateway,
  ) {}

  start(): void {
    this.stop();
    this.interval = setInterval(() => this.tick(), this.dt * 1000);
    this.logger.log(`Combat tick started @ ${COMBAT_TICK_HZ}Hz`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private tick(): void {
    const match = this.matchService.getState();
    if (match.status !== 'active') return;

    const moved: Array<{ unitId: string; position: { x: number; y: number } }> =
      [];
    const damaged: Array<{ unitId: string; hp: number; maxHp: number }> = [];
    const engaged: Array<{ unitId: string; targetUnitId: string }> = [];
    // Object bag: assignments happen inside tickSwingImpact callbacks;
    // TS CFA ignores closure writes on bare `let`, which would narrow to `never`.
    const siege = {
      baseDamaged: null as {
        nationId: string;
        currentHp: number;
        maxHp: number;
      } | null,
      baseDestroyedNationId: null as string | null,
    };

    const allUnits = [...match.nationA.units, ...match.nationB.units].filter(
      (u) => u.state !== 'dead',
    );

    for (const u of allUnits) {
      if ((u.stunRemaining ?? 0) > 0) {
        u.stunRemaining = Math.max(0, (u.stunRemaining ?? 0) - this.dt);
      }
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

    // Desired velocity per unit this tick (then apply collision)
    const desired = new Map<string, { x: number; y: number }>();

    for (const unit of allUnits) {
      if (unit.hp <= 0) continue;
      if ((unit.stunRemaining ?? 0) > 0) {
        unit.attackImpactIn = 0;
        desired.set(unit.id, { x: 0, y: 0 });
        continue;
      }

      const isA = unit.nationId === match.nationA.nationId;
      const enemies = allUnits.filter(
        (e) => e.nationId !== unit.nationId && e.hp > 0,
      );

      // Acquire / refresh target while advancing
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
            // Approach target position (2D); stop short at attack range along the vector
            const dx = t.position.x - unit.position.x;
            const dy = t.position.y - unit.position.y;
            const d = Math.hypot(dx, dy) || 1;
            const stopAt = Math.max(unit.attackRangeValue * 0.85, UNIT_RADIUS + 4);
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
          // March toward enemy base; stop at this unit's attack range (ranged sieges from afar)
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

        // Siege check after movement applied below
      }

      if (unit.state === 'engaging' && unit.targetUnitId) {
        const target = enemies.find((e) => e.id === unit.targetUnitId);
        if (!target) {
          unit.state = 'advancing';
          unit.targetUnitId = null;
          unit.attackImpactIn = 0;
          continue;
        }

        const dist = this.dist(unit, target);
        // Too far: chase again (2D), do not stand still forever
        if (dist > unit.attackRangeValue * 1.2) {
          unit.state = 'advancing';
          unit.attackImpactIn = 0;
          // Will steer next tick; give a small chase impulse now
          desired.set(
            unit.id,
            this.steerToward(unit, target.position.x, target.position.y),
          );
          continue;
        }

        // In range: STOP moving and attack (prevents mutual drag/chase)
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
          (unit.attackImpactIn ?? 0) <= 0
        ) {
          this.beginUnitSwing(unit, target.position);
        }
      }

      if (unit.state === 'attacking_base') {
        const base = isA ? match.baseB : match.baseA;
        const blocker = this.findTarget(unit, enemies, isA);
        if (blocker) {
          const dist = this.dist(unit, blocker);
          if (dist <= unit.attackRangeValue) {
            unit.state = 'engaging';
            unit.targetUnitId = blocker.id;
            unit.attackImpactIn = 0;
            engaged.push({ unitId: unit.id, targetUnitId: blocker.id });
            desired.set(unit.id, { x: 0, y: 0 });
            continue;
          }
          if (dist <= Math.max(unit.detectionRange, 200)) {
            unit.state = 'advancing';
            unit.targetUnitId = blocker.id;
            unit.attackImpactIn = 0;
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
          (unit.attackImpactIn ?? 0) <= 0
        ) {
          this.beginUnitSwing(unit, { x: baseX, y: baseY });
        }
      }
    }

    // Apply steering + soft collision separation (2D)
    for (const unit of allUnits) {
      if (unit.hp <= 0 || unit.state === 'dead') continue;

      let vx = desired.get(unit.id)?.x ?? 0;
      let vy = desired.get(unit.id)?.y ?? 0;

      // Separation from all nearby units
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
        vx += sepX * SEPARATION_STRENGTH * unit.moveSpeed * this.dt;
        vy += sepY * SEPARATION_STRENGTH * unit.moveSpeed * this.dt;
      }

      // Engaging / sieging: only allow separation (no chase drag), capped
      if (unit.state === 'engaging' || unit.state === 'attacking_base') {
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

      // Enter base siege when within this unit's attack reach (ranged can stay far)
      if (unit.state === 'advancing' && !unit.targetUnitId) {
        const isA = unit.nationId === match.nationA.nationId;
        const enemyBaseX = isA ? BATTLEFIELD.baseBX : BATTLEFIELD.baseAX;
        if (
          Math.abs(unit.position.x - enemyBaseX) <= this.baseAttackReach(unit)
        ) {
          unit.state = 'attacking_base';
        }
      }

      // If already sieging but drifted out of range, resume advance
      if (unit.state === 'attacking_base') {
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

    // HQ ranged defense — shoot nearest enemy in range
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

    // Re-filter in case base killed units this tick
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
    damaged.push({ unitId: best.id, hp: best.hp, maxHp: best.maxHp });
    base.attackCooldown = 1 / Math.max(0.05, spd);

    if (best.hp <= 0) {
      best.state = 'dead';
      best.targetUnitId = null;
      this.gateway.emitUnitDied({
        unitId: best.id,
        nationId: best.nationId,
        victimUsername: best.username,
        victimDisplayName: best.displayName,
        killerUnitId: `base:${base.nationId}`,
        killerUsername: 'Base',
        killerDisplayName: 'Base',
        killerNationId: base.nationId,
      });
    }
  }

  /**
   * Start a swing: overlay plays attack anim now; damage lands after
   * attackImpactIn (== 1/attackSpeed, last anim frame).
   */
  private beginUnitSwing(
    unit: Unit,
    aim: { x: number; y: number },
  ) {
    const period = 1 / Math.max(0.05, unit.attackSpeed);
    this.gateway.emitUnitAttack(unit.id);
    if (unit.attackRange === 'ranged' && unit.spriteKey !== 'mage') {
      this.gateway.emitProjectile({
        id: `${unit.id}-${Date.now()}`,
        kind: 'arrow',
        from: { ...unit.position },
        to: { ...aim },
        durationMs: Math.min(320, Math.round(period * 1000 * 0.45)),
      });
    }
    unit.attackImpactIn = period;
    unit.attackCooldown = period;
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
    if (
      emitProjectile &&
      unit.attackRange === 'ranged' &&
      unit.spriteKey !== 'mage'
    ) {
      this.gateway.emitProjectile({
        id: `${unit.id}-${Date.now()}`,
        kind: 'arrow',
        from: { ...unit.position },
        to: { ...primary.position },
        durationMs: 300,
      });
    }

    const victims = new Map<string, { unit: Unit; isPrimary: boolean }>();
    victims.set(primary.id, { unit: primary, isPrimary: true });

    if (unit.isSplash && (unit.splashRadius ?? 0) > 0) {
      const r = unit.splashRadius!;
      // Overlay VFX: mage_explosion sprites only (no procedural AoE ring)
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
    for (const { unit: victim, isPrimary } of victims.values()) {
      let dmg = isPrimary ? unit.attackDamage : splashDmg;
      // Blocking reduces damage from ranged attackers (archer, mage, …)
      if (unit.attackRange === 'ranged') {
        const block = Math.min(1, Math.max(0, victim.blocking ?? 0));
        dmg *= 1 - block;
      }
      const before = victim.hp;
      victim.hp = Math.max(0, victim.hp - dmg);
      if (victim.hp !== before) {
        damaged.push({
          unitId: victim.id,
          hp: victim.hp,
          maxHp: victim.maxHp,
        });
      }
      this.applyCrowdControl(unit, victim, isA);

      if (victim.hp <= 0 && victim.state !== 'dead') {
        victim.state = 'dead';
        victim.targetUnitId = null;
        this.gateway.emitUnitDied({
          unitId: victim.id,
          nationId: victim.nationId,
          victimUsername: victim.username,
          victimDisplayName: victim.displayName,
          killerUnitId: unit.id,
          killerUsername: unit.username,
          killerDisplayName: unit.displayName,
          killerNationId: unit.nationId,
        });
        if (victim.id === primary.id) primaryDied = true;
      }
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

  /** Stun / knockback — values come from UnitType so they scale via admin */
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
      // Prefer push along attacker's march if almost overlapping
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

  /** How close a unit must be (on X) to siege the enemy HQ */
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
    const step = Math.min(d, unit.moveSpeed * this.dt);
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
      const dy = Math.abs(e.position.y - unit.position.y);
      const nearOurBase =
        Math.abs(e.position.x - ourBaseX) <= BATTLEFIELD.baseReachDist + 100;
      const raidingHome = e.state === 'attacking_base' || nearOurBase;

      // Detect mainly by X proximity; Y is closed via diagonal steering
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
