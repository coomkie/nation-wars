import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  BATTLEFIELD,
  GiftNationMapping,
  GiftUnitTypeMapping,
  MatchEndReason,
  MatchState,
  MatchNationState,
  ProcessedGift,
  Unit,
  Base,
} from '../common/types';
import { MatchHistory } from './match-history.entity';
import { MatchGateway } from './match.gateway';
import { MatchTimerService } from './match-timer.service';
import { CombatTickService } from './combat-tick.service';
import { BracketService } from '../bracket/bracket.service';
import { NationService } from '../nation/nation.service';
import { UnitTypeService } from '../unit-type/unit-type.service';
import { UnitTypeEntity } from '../unit-type/unit-type.entity';

export interface StartMatchDto {
  bracketNodeId?: string;
  nationAId: string;
  nationBId: string;
  durationMinutes?: number;
  intermissionSeconds?: number;
  defaultNationId: string;
  defaultUnitTypeId: string;
  baseMaxHp?: number;
  baseAttackRange?: number;
  baseAttackDamage?: number;
  baseAttackSpeed?: number;
  giftMappings?: GiftNationMapping[];
  giftUnitTypeMappings?: GiftUnitTypeMapping[];
}

@Injectable()
export class MatchService implements OnModuleInit {
  private readonly logger = new Logger(MatchService.name);
  private match: MatchState | null = null;
  private unitTypeCache = new Map<string, UnitTypeEntity>();
  private defaults = {
    durationMinutes: 15,
    intermissionSeconds: 20,
    baseMaxHp: 1000,
    giftMappings: [] as GiftNationMapping[],
    giftUnitTypeMappings: [] as GiftUnitTypeMapping[],
    defaultUnitTypeId: '',
    stageBgUrl: null as string | null,
    battlefieldBgUrl: null as string | null,
    baseAttackRange: 220,
    baseAttackDamage: 8,
    baseAttackSpeed: 0.5,
  };

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(MatchHistory)
    private readonly history: Repository<MatchHistory>,
    private readonly gateway: MatchGateway,
    @Inject(forwardRef(() => MatchTimerService))
    private readonly timer: MatchTimerService,
    @Inject(forwardRef(() => CombatTickService))
    private readonly combat: CombatTickService,
    @Inject(forwardRef(() => BracketService))
    private readonly brackets: BracketService,
    private readonly nations: NationService,
    private readonly unitTypes: UnitTypeService,
  ) {}

  async onModuleInit() {
    this.defaults.durationMinutes =
      Number(this.config.get('DEFAULT_MATCH_DURATION_MINUTES')) || 15;
    this.defaults.intermissionSeconds =
      Number(this.config.get('DEFAULT_INTERMISSION_SECONDS')) || 20;
    this.defaults.baseMaxHp =
      Number(this.config.get('DEFAULT_BASE_MAX_HP')) || 1000;
    const types = await this.unitTypes.findAll();
    if (types[0]) this.defaults.defaultUnitTypeId = types[0].id;
    this.match = this.createIdle();
    this.gateway.emitMatchInit(this.match);
  }

  getState(): MatchState {
    return this.match ?? this.createIdle();
  }

  getSettings() {
    return { ...this.defaults };
  }

  setSettings(partial: {
    durationMinutes?: number;
    intermissionSeconds?: number;
    baseMaxHp?: number;
    stageBgUrl?: string | null;
    battlefieldBgUrl?: string | null;
    baseAttackRange?: number;
    baseAttackDamage?: number;
    baseAttackSpeed?: number;
  }) {
    if (partial.durationMinutes != null && partial.durationMinutes >= 1) {
      this.defaults.durationMinutes = partial.durationMinutes;
    }
    if (partial.intermissionSeconds != null && partial.intermissionSeconds >= 0) {
      this.defaults.intermissionSeconds = partial.intermissionSeconds;
    }
    if (partial.baseMaxHp != null && partial.baseMaxHp >= 1) {
      this.defaults.baseMaxHp = partial.baseMaxHp;
    }
    let bgChanged = false;
    if (partial.stageBgUrl !== undefined) {
      this.defaults.stageBgUrl = partial.stageBgUrl;
      if (this.match) this.match.stageBgUrl = partial.stageBgUrl;
      bgChanged = true;
    }
    if (partial.battlefieldBgUrl !== undefined) {
      this.defaults.battlefieldBgUrl = partial.battlefieldBgUrl;
      if (this.match) this.match.battlefieldBgUrl = partial.battlefieldBgUrl;
      bgChanged = true;
    }
    if (partial.baseAttackRange != null && partial.baseAttackRange >= 0) {
      this.defaults.baseAttackRange = partial.baseAttackRange;
      if (this.match) this.match.baseAttackRange = partial.baseAttackRange;
    }
    if (partial.baseAttackDamage != null && partial.baseAttackDamage >= 0) {
      this.defaults.baseAttackDamage = partial.baseAttackDamage;
      if (this.match) this.match.baseAttackDamage = partial.baseAttackDamage;
    }
    if (partial.baseAttackSpeed != null && partial.baseAttackSpeed >= 0) {
      this.defaults.baseAttackSpeed = partial.baseAttackSpeed;
      if (this.match) this.match.baseAttackSpeed = partial.baseAttackSpeed;
    }
    if (
      this.match &&
      (bgChanged ||
        partial.baseAttackRange != null ||
        partial.baseAttackDamage != null ||
        partial.baseAttackSpeed != null)
    ) {
      this.gateway.emitMatchUpdate(this.match);
    }
    return this.getSettings();
  }

  setStageBgUrl(url: string | null) {
    return this.setSettings({ stageBgUrl: url });
  }

  setBattlefieldBgUrl(url: string | null) {
    return this.setSettings({ battlefieldBgUrl: url });
  }

  computeFrontlineFromBases(match: MatchState): number {
    const ratioA = match.baseA.currentHp / Math.max(1, match.baseA.maxHp);
    const ratioB = match.baseB.currentHp / Math.max(1, match.baseB.maxHp);
    return Math.max(-100, Math.min(100, (ratioA - ratioB) * 100));
  }

  private createIdle(): MatchState {
    return {
      id: 'idle',
      bracketNodeId: null,
      nationA: this.emptyNation(''),
      nationB: this.emptyNation(''),
      baseA: { nationId: '', maxHp: this.defaults.baseMaxHp, currentHp: this.defaults.baseMaxHp },
      baseB: { nationId: '', maxHp: this.defaults.baseMaxHp, currentHp: this.defaults.baseMaxHp },
      frontline: 0,
      startedAt: null,
      endsAt: null,
      status: 'idle',
      winnerNationId: null,
      endReason: null,
      defaultNationId: '',
      defaultUnitTypeId: this.defaults.defaultUnitTypeId,
      giftMappings: [],
      giftUnitTypeMappings: [],
      durationMinutes: this.defaults.durationMinutes,
      intermissionSeconds: this.defaults.intermissionSeconds,
      nextMatchAt: null,
      championNationId: null,
      baseMaxHp: this.defaults.baseMaxHp,
      stageBgUrl: this.defaults.stageBgUrl,
      battlefieldBgUrl: this.defaults.battlefieldBgUrl,
      baseAttackRange: this.defaults.baseAttackRange,
      baseAttackDamage: this.defaults.baseAttackDamage,
      baseAttackSpeed: this.defaults.baseAttackSpeed,
      zones: [],
    };
  }

  private emptyNation(nationId: string): MatchNationState {
    return {
      nationId,
      score: 0,
      units: [],
      leadTakenAt: null,
      scoreReachedAt: null,
    };
  }

  private emptyBase(nationId: string, maxHp: number): Base {
    return { nationId, maxHp, currentHp: maxHp };
  }

  async startMatch(dto: StartMatchDto): Promise<MatchState> {
    if (this.match?.status === 'active') {
      throw new BadRequestException('A match is already active');
    }

    this.timer.clearAll();
    this.combat.stop();

    await this.nations.findOne(dto.nationAId);
    await this.nations.findOne(dto.nationBId);
    const unitType = await this.unitTypes.findOne(dto.defaultUnitTypeId);
    this.unitTypeCache.set(unitType.id, unitType);

    if (dto.nationAId === dto.nationBId) {
      throw new BadRequestException('Nations must be different');
    }
    if (
      dto.defaultNationId !== dto.nationAId &&
      dto.defaultNationId !== dto.nationBId
    ) {
      throw new BadRequestException(
        'defaultNationId must be one of the two match nations',
      );
    }

    let bracketNodeId = dto.bracketNodeId ?? null;
    if (bracketNodeId) {
      const matchup = await this.brackets.getMatchupNations(bracketNodeId);
      if (
        !(
          (matchup.nationAId === dto.nationAId &&
            matchup.nationBId === dto.nationBId) ||
          (matchup.nationAId === dto.nationBId &&
            matchup.nationBId === dto.nationAId)
        )
      ) {
        throw new BadRequestException(
          'Nation pair does not match the bracket node children',
        );
      }
    }

    // Warm unit type cache for mappings
    for (const m of dto.giftUnitTypeMappings ?? []) {
      const t = await this.unitTypes.findOne(m.unitTypeId);
      this.unitTypeCache.set(t.id, t);
    }

    const intermission =
      dto.intermissionSeconds ?? this.defaults.intermissionSeconds;
    const baseMaxHp = dto.baseMaxHp ?? this.defaults.baseMaxHp;

    this.defaults.intermissionSeconds = intermission;
    this.defaults.baseMaxHp = baseMaxHp;
    if (dto.baseAttackRange != null && dto.baseAttackRange >= 0) {
      this.defaults.baseAttackRange = dto.baseAttackRange;
    }
    if (dto.baseAttackDamage != null && dto.baseAttackDamage >= 0) {
      this.defaults.baseAttackDamage = dto.baseAttackDamage;
    }
    if (dto.baseAttackSpeed != null && dto.baseAttackSpeed >= 0) {
      this.defaults.baseAttackSpeed = dto.baseAttackSpeed;
    }
    this.defaults.giftMappings = dto.giftMappings ?? [];
    this.defaults.giftUnitTypeMappings = dto.giftUnitTypeMappings ?? [];
    this.defaults.defaultUnitTypeId = dto.defaultUnitTypeId;

    const startedAt = new Date();
    const matchId = randomUUID();

    this.match = {
      id: matchId,
      bracketNodeId,
      nationA: this.emptyNation(dto.nationAId),
      nationB: this.emptyNation(dto.nationBId),
      baseA: this.emptyBase(dto.nationAId, baseMaxHp),
      baseB: this.emptyBase(dto.nationBId, baseMaxHp),
      frontline: 0,
      startedAt: startedAt.toISOString(),
      endsAt: null,
      status: 'active',
      winnerNationId: null,
      endReason: null,
      defaultNationId: dto.defaultNationId,
      defaultUnitTypeId: dto.defaultUnitTypeId,
      giftMappings: this.defaults.giftMappings,
      giftUnitTypeMappings: this.defaults.giftUnitTypeMappings,
      durationMinutes: 0,
      intermissionSeconds: intermission,
      nextMatchAt: null,
      championNationId: null,
      baseMaxHp,
      stageBgUrl: this.defaults.stageBgUrl,
      battlefieldBgUrl: this.defaults.battlefieldBgUrl,
      baseAttackRange: this.defaults.baseAttackRange,
      baseAttackDamage: this.defaults.baseAttackDamage,
      baseAttackSpeed: this.defaults.baseAttackSpeed,
      zones: [],
    };

    if (bracketNodeId) {
      await this.brackets.linkMatch(bracketNodeId, matchId);
    }

    this.combat.start();
    this.gateway.emitMatchStarted({
      matchId,
      nationA: dto.nationAId,
      nationB: dto.nationBId,
    });
    this.gateway.emitMatchInit(this.match);
    this.logger.log(`Match ${matchId} started (combat on)`);
    return this.match;
  }

  async startNextBracketMatch(): Promise<MatchState | null> {
    const next = await this.brackets.findNextPlayableNode();
    if (!next) return null;
    return this.startMatch({
      bracketNodeId: next.nodeId,
      nationAId: next.nationAId,
      nationBId: next.nationBId,
      defaultNationId: next.nationAId,
      defaultUnitTypeId: this.defaults.defaultUnitTypeId,
      durationMinutes: this.defaults.durationMinutes,
      intermissionSeconds: this.defaults.intermissionSeconds,
      baseMaxHp: this.defaults.baseMaxHp,
      giftMappings: this.defaults.giftMappings,
      giftUnitTypeMappings: this.defaults.giftUnitTypeMappings,
    });
  }

  async processGift(gift: ProcessedGift): Promise<void> {
    if (!this.match || this.match.status !== 'active') return;

    const mapping = this.match.giftMappings.find((m) => m.giftId === gift.giftId);
    const nationId =
      gift.forcedNationId ?? mapping?.nationId ?? this.match.defaultNationId;
    const side = this.getSide(nationId);
    if (!side) {
      this.logger.warn(`Gift nation ${nationId} not in active match`);
      return;
    }

    const typeMapping = this.match.giftUnitTypeMappings.find(
      (m) => m.giftId === gift.giftId,
    );
    const unitTypeId =
      gift.forcedUnitTypeId ??
      typeMapping?.unitTypeId ??
      this.match.defaultUnitTypeId;

    // Always load fresh stats (scale/HP/…) so Admin edits apply to new spawns
    const unitType = await this.unitTypes.findOne(unitTypeId);
    this.unitTypeCache.set(unitType.id, unitType);

    let moltFormSnapshot: Unit['moltFormSnapshot'] = null;
    if (unitType.canMolt && unitType.moltFormUnitTypeId) {
      try {
        const form2 = await this.unitTypes.findOne(unitType.moltFormUnitTypeId);
        this.unitTypeCache.set(form2.id, form2);
        const s = this.unitTypes.statsFor(form2);
        moltFormSnapshot = {
          unitTypeId: form2.id,
          unitTypeName: form2.name,
          spriteKey: form2.spriteKey,
          maxHp: s.maxHp,
          attackDamage: s.attackDamage,
          attackSpeed: s.attackSpeed,
          moveSpeed: s.moveSpeed,
          attackRange: s.attackRange,
          attackRangeValue: s.attackRangeValue,
          detectionRange: s.detectionRange,
          isSplash: s.isSplash,
          splashRadius: s.splashRadius,
          stunChance: s.stunChance,
          stunDuration: s.stunDuration,
          knockbackForce: s.knockbackForce,
          stunResist: s.stunResist,
          knockbackResist: s.knockbackResist,
          aoeDamage: s.aoeDamage,
          damageTakenMods: s.damageTakenMods,
          lifesteal: s.lifesteal,
          scale: s.scale,
          sfxSpawnVolume: s.sfxSpawnVolume,
          sfxAttackVolume: s.sfxAttackVolume,
          attackSfxFrame: s.attackSfxFrame ?? null,
          attackShotFrame: s.attackShotFrame ?? null,
          maxActivePerNation: s.maxActivePerNation,
          stationary: s.stationary,
          dealsDamage: s.dealsDamage,
          onDeathAoe: s.onDeathAoe,
          auraRadius: s.auraRadius,
          auraInterval: s.auraInterval,
          auraDamagePerTick: s.auraDamagePerTick,
          auraSlowPct: s.auraSlowPct,
          auraStunChance: s.auraStunChance,
          auraStunDuration: s.auraStunDuration,
          trailSlowPct: s.trailSlowPct,
          trailDuration: s.trailDuration,
          trailInterval: s.trailInterval,
        };
      } catch {
        this.logger.warn(
          `Molt form ${unitType.moltFormUnitTypeId} missing for ${unitType.name}`,
        );
      }
    }

    const count = Math.max(1, Math.floor(gift.repeatCount) || 1);
    const valuePerUnit = gift.diamondCount;
    const totalValue = valuePerUnit * count;
    const state = side === 'A' ? this.match.nationA : this.match.nationB;
    const prevA = this.match.nationA.score;
    const prevB = this.match.nationB.score;

    state.score += totalValue;
    state.scoreReachedAt = new Date().toISOString();
    this.updateLeadTimestamps(prevA, prevB);

    // One unit per gift (repeatCount = combo/streak count) — no merge/heal
    const maxActive = unitType.maxActivePerNation ?? 0;
    for (let i = 0; i < count; i++) {
      if (maxActive > 0) {
        const aliveSame = state.units.filter(
          (u) =>
            u.unitTypeId === unitType.id &&
            u.state !== 'dead' &&
            u.hp > 0,
        ).length;
        if (aliveSame >= maxActive) continue;
      }
      const unit = this.createUnit(
        gift,
        nationId,
        unitType,
        valuePerUnit,
        side === 'A',
        moltFormSnapshot,
      );
      state.units.push(unit);
      this.gateway.emitUnitSpawned(nationId, unit);
    }

    this.gateway.emitMatchUpdate(this.match);
  }

  private createUnit(
    gift: ProcessedGift,
    nationId: string,
    type: UnitTypeEntity,
    value: number,
    isA: boolean,
    moltFormSnapshot: Unit['moltFormSnapshot'] = null,
  ): Unit {
    const stats = this.unitTypes.statsFor(type);
    const lane =
      BATTLEFIELD.laneMinY +
      Math.random() * (BATTLEFIELD.laneMaxY - BATTLEFIELD.laneMinY);
    const canMolt =
      !!(stats.canMolt && moltFormSnapshot && (stats.cocoonHp ?? 0) > 0);
    return {
      id: randomUUID(),
      username: gift.username,
      displayName: gift.displayName,
      nationId,
      unitTypeId: type.id,
      unitTypeName: type.name,
      spriteKey: type.spriteKey,
      totalGiftValue: value,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      attackDamage: stats.attackDamage,
      attackSpeed: stats.attackSpeed,
      moveSpeed: stats.moveSpeed,
      attackRange: stats.attackRange,
      attackRangeValue: stats.attackRangeValue,
      detectionRange: stats.detectionRange,
      isSplash: stats.isSplash,
      splashRadius: stats.splashRadius,
      stunChance: stats.stunChance,
      stunDuration: stats.stunDuration,
      knockbackForce: stats.knockbackForce,
      stunResist: stats.stunResist ?? 0,
      knockbackResist: stats.knockbackResist ?? 0,
      aoeDamage: stats.aoeDamage ?? 0,
      damageTakenMods: stats.damageTakenMods ?? {},
      lifesteal: stats.lifesteal ?? 0,
      scale: stats.scale ?? 1,
      sfxSpawnVolume: stats.sfxSpawnVolume ?? 1,
      sfxAttackVolume: stats.sfxAttackVolume ?? 1,
      attackSfxFrame:
        typeof stats.attackSfxFrame === 'number' ? stats.attackSfxFrame : null,
      attackShotFrame:
        typeof stats.attackShotFrame === 'number'
          ? stats.attackShotFrame
          : null,
      maxActivePerNation: stats.maxActivePerNation ?? 0,
      stationary: stats.stationary ?? false,
      dealsDamage: stats.dealsDamage ?? true,
      onDeathAoe: stats.onDeathAoe ?? false,
      auraRadius: stats.auraRadius ?? 0,
      auraInterval: stats.auraInterval ?? 1,
      auraDamagePerTick: stats.auraDamagePerTick ?? 0,
      auraSlowPct: stats.auraSlowPct ?? 0,
      auraStunChance: stats.auraStunChance ?? 0,
      auraStunDuration: stats.auraStunDuration ?? 0,
      trailSlowPct: stats.trailSlowPct ?? 0,
      trailDuration: stats.trailDuration ?? 0,
      trailInterval: stats.trailInterval ?? 0,
      canMolt,
      cocoonHp: stats.cocoonHp ?? 0,
      cocoonDurationSec: stats.cocoonDurationSec ?? 5,
      moltFormUnitTypeId: stats.moltFormUnitTypeId ?? null,
      cocoonSpriteKey: stats.cocoonSpriteKey ?? null,
      moltFormSnapshot: canMolt ? moltFormSnapshot : null,
      hasMoltUsed: false,
      position: {
        x: isA ? BATTLEFIELD.spawnAX : BATTLEFIELD.spawnBX,
        y: lane,
      },
      state: 'advancing',
      targetUnitId: null,
      spawnedAt: new Date().toISOString(),
      attackCooldown: 0,
      attackImpactIn: 0,
      stunRemaining: 0,
      auraCooldown: 0,
      trailCooldown: 0,
      slowFactor: 0,
      slowRemaining: 0,
      cocoonRemaining: 0,
    };
  }

  private getSide(nationId: string): 'A' | 'B' | null {
    if (!this.match) return null;
    if (this.match.nationA.nationId === nationId) return 'A';
    if (this.match.nationB.nationId === nationId) return 'B';
    return null;
  }

  private updateLeadTimestamps(prevA: number, prevB: number): void {
    if (!this.match) return;
    const { nationA, nationB } = this.match;
    const now = new Date().toISOString();
    const aWasAhead = prevA > prevB;
    const bWasAhead = prevB > prevA;
    const aNowAhead = nationA.score > nationB.score;
    const bNowAhead = nationB.score > nationA.score;
    if (aNowAhead && !aWasAhead) {
      nationA.leadTakenAt = now;
      nationB.leadTakenAt = null;
    } else if (bNowAhead && !bWasAhead) {
      nationB.leadTakenAt = now;
      nationA.leadTakenAt = null;
    } else if (nationA.score === nationB.score) {
      nationA.leadTakenAt = null;
      nationB.leadTakenAt = null;
    }
  }

  async endMatch(
    reason: MatchEndReason = 'manual',
    forcedWinnerId?: string | null,
  ): Promise<MatchState | null> {
    if (!this.match || this.match.status !== 'active') {
      return this.match;
    }

    this.combat.stop();
    this.timer.clear();

    // Freeze living units — no more attack anims / chase after match end
    for (const u of [
      ...this.match.nationA.units,
      ...this.match.nationB.units,
    ]) {
      if (u.state === 'dead') continue;
      u.state = 'advancing';
      u.targetUnitId = null;
      u.attackCooldown = 0;
      u.attackImpactIn = 0;
      u.stunRemaining = 0;
    }

    const { nationA, nationB, baseA, baseB } = this.match;
    let winnerNationId: string | null = forcedWinnerId ?? null;

    if (winnerNationId == null) {
      if (reason === 'timeout' || reason === 'manual') {
        if (baseA.currentHp > baseB.currentHp) {
          winnerNationId = nationA.nationId;
        } else if (baseB.currentHp > baseA.currentHp) {
          winnerNationId = nationB.nationId;
        } else if (nationA.score > nationB.score) {
          winnerNationId = nationA.nationId;
        } else if (nationB.score > nationA.score) {
          winnerNationId = nationB.nationId;
        } else if (nationA.score === 0 && nationB.score === 0) {
          winnerNationId = null;
        } else if (nationA.scoreReachedAt && nationB.scoreReachedAt) {
          winnerNationId =
            nationA.scoreReachedAt <= nationB.scoreReachedAt
              ? nationA.nationId
              : nationB.nationId;
        } else {
          winnerNationId = nationA.nationId;
        }
        if (reason === 'manual' && !forcedWinnerId) {
          reason = 'timeout';
        }
      }
    }

    this.match.status = 'ended';
    this.match.winnerNationId = winnerNationId;
    this.match.endReason = reason;
    this.match.frontline = this.computeFrontlineFromBases(this.match);

    await this.history.save(
      this.history.create({
        id: this.match.id,
        bracketNodeId: this.match.bracketNodeId,
        nationAId: nationA.nationId,
        nationBId: nationB.nationId,
        scoreA: nationA.score,
        scoreB: nationB.score,
        winnerNationId,
        generalA: null,
        generalB: null,
        startedAt: new Date(this.match.startedAt!),
        endedAt: new Date(),
      }),
    );

    let championNationId: string | null = null;
    if (winnerNationId && this.match.bracketNodeId) {
      const bracket = await this.brackets.advanceWinner(
        this.match.bracketNodeId,
        winnerNationId,
        this.match.id,
      );
      championNationId = bracket.championNationId;
    }

    const intermissionSeconds = this.match.intermissionSeconds;
    this.gateway.emitMatchEnded({
      winnerNationId,
      generalA: null,
      generalB: null,
      finalScoreA: nationA.score,
      finalScoreB: nationB.score,
      intermissionSeconds,
      championNationId,
      tournamentComplete: Boolean(championNationId),
      reason,
      baseAHpRemaining: baseA.currentHp,
      baseBHpRemaining: baseB.currentHp,
    });
    this.gateway.emitMatchUpdate(this.match);

    this.logger.log(
      `Match ${this.match.id} ended (${reason}). Winner: ${winnerNationId ?? 'none'}`,
    );

    if (championNationId) {
      this.enterTournamentComplete(championNationId, intermissionSeconds);
    } else if (winnerNationId && this.match.bracketNodeId) {
      this.scheduleNextBracketMatch(intermissionSeconds);
    }

    return this.match;
  }

  private enterTournamentComplete(
    championNationId: string,
    intermissionSeconds: number,
  ) {
    if (!this.match) return;
    this.match.status = 'tournament_complete';
    this.match.championNationId = championNationId;
    this.match.nextMatchAt = null;
    this.gateway.emitTournamentComplete({ championNationId });
    this.gateway.emitMatchUpdate(this.match);
    this.timer.scheduleIntermission(intermissionSeconds * 1000, () => {
      if (this.match?.status === 'tournament_complete') {
        this.gateway.emitMatchUpdate(this.match);
      }
    });
  }

  private scheduleNextBracketMatch(intermissionSeconds: number) {
    if (!this.match) return;
    const nextAt = new Date(Date.now() + intermissionSeconds * 1000);
    this.match.status = 'intermission';
    this.match.nextMatchAt = nextAt.toISOString();
    this.gateway.emitMatchUpdate(this.match);
    this.gateway.emitIntermission({
      nextMatchAt: nextAt.toISOString(),
      intermissionSeconds,
    });

    this.timer.scheduleIntermission(intermissionSeconds * 1000, () => {
      void this.startNextBracketMatch()
        .then((started) => {
          if (!started && this.match) {
            this.match.status = 'idle';
            this.match.nextMatchAt = null;
            this.gateway.emitMatchUpdate(this.match);
          }
        })
        .catch((err) => {
          this.logger.error(
            `Failed to auto-start next match: ${err instanceof Error ? err.message : err}`,
          );
        });
    });
  }

  resetToIdle(): MatchState {
    this.timer.clearAll();
    this.combat.stop();
    this.match = this.createIdle();
    this.gateway.emitMatchInit(this.match);
    return this.match;
  }

  /** Match timer removed — matches end only when a base is destroyed. */
  onTimerExpired(): void {
    /* no-op */
  }
}
