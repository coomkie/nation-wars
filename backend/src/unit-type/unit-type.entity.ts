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

  /** 0–1: reduce incoming ranged (archer/mage) damage */
  @Column({ type: 'float', default: 0 })
  blocking: number;

  /** Display size multiplier on battle overlay (1 = default UNIT_SIZE) */
  @Column({ type: 'float', default: 1 })
  scale: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
