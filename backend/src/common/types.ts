export type UnitState =
  | 'advancing'
  | 'engaging'
  | 'attacking_base'
  | 'dead';

export interface Unit {
  id: string;
  username: string;
  displayName: string;
  nationId: string;
  unitTypeId: string;
  unitTypeName: string;
  spriteKey: string;
  totalGiftValue: number;
  hp: number;
  maxHp: number;
  attackDamage: number;
  attackSpeed: number;
  moveSpeed: number;
  attackRange: 'melee' | 'ranged';
  attackRangeValue: number;
  detectionRange: number;
  isSplash: boolean;
  splashRadius: number | null;
  /** 0–1 chance to stun on hit */
  stunChance: number;
  /** Stun duration in seconds when stun procs */
  stunDuration: number;
  /** Instant knockback distance (px) when > 0 */
  knockbackForce: number;
  /** 0–1 resist vs incoming stun */
  stunResist: number;
  /** 0–1 resist vs incoming knockback */
  knockbackResist: number;
  /** Flat AoE/splash damage to secondary targets */
  aoeDamage: number;
  /** 0–1: reduce incoming ranged damage */
  blocking: number;
  /** Display size multiplier on overlay (default 1) */
  scale: number;
  position: { x: number; y: number };
  state: UnitState;
  targetUnitId: string | null;
  spawnedAt: string;
  /** Server-only attack cooldown remaining (seconds); stripped or kept for debug */
  attackCooldown?: number;
  /**
   * Server-only: seconds until the current swing deals damage.
   * Starts with the attack anim; lands on the last frame (matches overlay).
   */
  attackImpactIn?: number;
  /** Server-only: seconds remaining stunned (cannot move/attack) */
  stunRemaining?: number;
}

export interface Base {
  nationId: string;
  maxHp: number;
  currentHp: number;
  /** Server-only attack cooldown remaining (seconds) */
  attackCooldown?: number;
}

export interface MatchNationState {
  nationId: string;
  score: number;
  units: Unit[];
  leadTakenAt: string | null;
  scoreReachedAt: string | null;
}

export type MatchStatus =
  | 'idle'
  | 'active'
  | 'ended'
  | 'intermission'
  | 'tournament_complete';

export type MatchEndReason = 'base_destroyed' | 'timeout' | 'manual';

export interface MatchState {
  id: string;
  bracketNodeId: string | null;
  nationA: MatchNationState;
  nationB: MatchNationState;
  baseA: Base;
  baseB: Base;
  frontline: number;
  startedAt: string | null;
  endsAt: string | null;
  status: MatchStatus;
  winnerNationId: string | null;
  endReason: MatchEndReason | null;
  defaultNationId: string;
  defaultUnitTypeId: string;
  giftMappings: GiftNationMapping[];
  giftUnitTypeMappings: GiftUnitTypeMapping[];
  durationMinutes: number;
  intermissionSeconds: number;
  nextMatchAt: string | null;
  championNationId: string | null;
  baseMaxHp: number;
  /** Full-canvas stage backdrop (HUD sits on top). null = solid white */
  stageBgUrl: string | null;
  /** Arena band only (y≈200–880). null = default blue/red tint */
  battlefieldBgUrl: string | null;
  /** HQ auto-defense: range / damage / attacks-per-second */
  baseAttackRange: number;
  baseAttackDamage: number;
  baseAttackSpeed: number;
}

export interface GiftNationMapping {
  giftId: number;
  giftName: string;
  nationId: string;
}

export interface GiftUnitTypeMapping {
  giftId: number;
  giftName: string;
  unitTypeId: string;
}

export interface BracketNodeDto {
  id: string;
  round: number;
  nationId: string | null;
  leftChildId: string | null;
  rightChildId: string | null;
  matchId: string | null;
  isBye: boolean;
}

export interface BracketDto {
  id: string;
  rootNodeId: string;
  nodes: BracketNodeDto[];
  championNationId: string | null;
  createdAt: string;
  status: 'active' | 'completed';
}

export interface ProcessedGift {
  giftId: number;
  giftName: string;
  diamondCount: number;
  repeatCount: number;
  username: string;
  displayName: string;
  forcedNationId?: string;
  forcedUnitTypeId?: string;
}

/** Battlefield geometry (matches overlay 1920x1080 map band) */
export const BATTLEFIELD = {
  width: 1920,
  height: 1080,
  baseAX: 80,
  baseBX: 1840,
  spawnAX: 160,
  spawnBX: 1760,
  laneMinY: 260,
  laneMaxY: 820,
  baseReachDist: 50,
} as const;

export const COMBAT_TICK_HZ = 10;
