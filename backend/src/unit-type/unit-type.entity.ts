import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('unit_types')
export class UnitTypeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  /** Maps to sprites/<spriteKey>/ folder */
  @Column({ default: 'infantry' })
  spriteKey: string;

  /** Optional static sprite override (frame anims preferred via spriteKey) */
  @Column({ type: 'varchar', nullable: true })
  spriteUrl: string | null;

  @Column({ type: 'varchar', nullable: true, default: 'idle' })
  animIdleKey: string | null;

  @Column({ type: 'varchar', nullable: true, default: 'walk' })
  animWalkKey: string | null;

  @Column({ type: 'varchar', nullable: true, default: 'attack' })
  animAttackKey: string | null;

  @Column({ type: 'varchar', nullable: true, default: 'death' })
  animDeathKey: string | null;

  @Column({ type: 'float', default: 100 })
  baseHp: number;

  @Column({ type: 'float', default: 10 })
  baseAttackDamage: number;

  @Column({ type: 'float', default: 1 })
  attackSpeed: number;

  @Column({ type: 'float', default: 40 })
  moveSpeed: number;

  @Column({ type: 'varchar', default: 'melee' })
  attackRange: 'melee' | 'ranged';

  @Column({ type: 'float', default: 40 })
  attackRangeValue: number;

  @Column({ type: 'float', default: 80 })
  detectionRange: number;

  @Column({ default: false })
  isSplash: boolean;

  @Column({ type: 'float', nullable: true })
  splashRadius: number | null;

  /** 0–1 chance each hit applies stun */
  @Column({ type: 'float', default: 0 })
  stunChance: number;

  /** Seconds of stun when proc */
  @Column({ type: 'float', default: 0 })
  stunDuration: number;

  /** Knockback distance in battlefield px (0 = none) */
  @Column({ type: 'float', default: 0 })
  knockbackForce: number;

  /** 0–1: reduce incoming stun chance & duration */
  @Column({ type: 'float', default: 0 })
  stunResist: number;

  /** 0–1: reduce incoming knockback distance */
  @Column({ type: 'float', default: 0 })
  knockbackResist: number;

  /** Flat damage to splash/AoE secondary targets (0 = 55% of baseAttackDamage) */
  @Column({ type: 'float', default: 0 })
  aoeDamage: number;

  /**
   * unitTypeId → damage-taken modifier.
   * +0.4 = take 140% from that attacker type; -0.2 = take 80%.
   */
  @Column({ type: 'simple-json', default: {} })
  damageTakenMods: Record<string, number>;

  /** Fraction of damage dealt healed (1 = 100%; may exceed 1) */
  @Column({ type: 'float', default: 0 })
  lifesteal: number;

  /** Display size multiplier on battle overlay (1 = default UNIT_SIZE) */
  @Column({ type: 'float', default: 1 })
  scale: number;

  /** 0 = unlimited; 1 = support spawn cap per nation */
  @Column({ type: 'int', default: 0 })
  maxActivePerNation: number;

  /** Stay near own spawn; do not march to enemy base */
  @Column({ default: false })
  stationary: boolean;

  /** false = aura/support only (no attack HP damage) */
  @Column({ default: true })
  dealsDamage: boolean;

  /** On death: AoE using splashRadius + aoeDamage (+ stun fields) */
  @Column({ default: false })
  onDeathAoe: boolean;

  @Column({ type: 'float', default: 0 })
  auraRadius: number;

  /** Seconds between aura pulses */
  @Column({ type: 'float', default: 1 })
  auraInterval: number;

  @Column({ type: 'float', default: 0 })
  auraDamagePerTick: number;

  /** Slow factor applied to enemies in aura (0.3 = 30% slower) */
  @Column({ type: 'float', default: 0 })
  auraSlowPct: number;

  @Column({ type: 'float', default: 0 })
  auraStunChance: number;

  @Column({ type: 'float', default: 0 })
  auraStunDuration: number;

  /** Slime trail slow factor (0 = off) */
  @Column({ type: 'float', default: 0 })
  trailSlowPct: number;

  /** How long each trail zone lasts (seconds) */
  @Column({ type: 'float', default: 0 })
  trailDuration: number;

  /** Seconds between dropping trail zones while moving */
  @Column({ type: 'float', default: 0 })
  trailInterval: number;

  /** Molting Cicada: first lethal hit → cocoon instead of death */
  @Column({ default: false })
  canMolt: boolean;

  /** Fixed HP while in cocoon */
  @Column({ type: 'float', default: 0 })
  cocoonHp: number;

  /** Seconds immobile in cocoon before emerging as form 2 */
  @Column({ type: 'float', default: 5 })
  cocoonDurationSec: number;

  /** UnitType id for post-molt form (null = molt disabled at runtime) */
  @Column({ type: 'varchar', nullable: true })
  moltFormUnitTypeId: string | null;

  /** Optional spriteKey while cocooning (null = keep form-1 idle) */
  @Column({ type: 'varchar', nullable: true })
  cocoonSpriteKey: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
