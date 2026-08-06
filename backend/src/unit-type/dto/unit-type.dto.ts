import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateUnitTypeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  spriteKey?: string;

  @IsOptional()
  @IsString()
  spriteUrl?: string;

  @IsOptional()
  @IsString()
  animIdleKey?: string;

  @IsOptional()
  @IsString()
  animWalkKey?: string;

  @IsOptional()
  @IsString()
  animAttackKey?: string;

  @IsOptional()
  @IsString()
  animDeathKey?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  baseHp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseAttackDamage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  attackSpeed?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  moveSpeed?: number;

  @IsOptional()
  @IsIn(['melee', 'ranged'])
  attackRange?: 'melee' | 'ranged';

  @IsOptional()
  @IsNumber()
  @Min(1)
  attackRangeValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  detectionRange?: number;

  @IsOptional()
  @IsBoolean()
  isSplash?: boolean;

  @IsOptional()
  @IsNumber()
  splashRadius?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stunChance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stunDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  knockbackForce?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  stunResist?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  knockbackResist?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  aoeDamage?: number;

  @IsOptional()
  @IsObject()
  damageTakenMods?: Record<string, number>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lifesteal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  scale?: number;

  /** 0–2 multiplier for spawn SFX (1 = default) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  sfxSpawnVolume?: number;

  /** 0–2 multiplier for attack SFX (1 = default) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  sfxAttackVolume?: number;

  /** 0-based Attack frame for SFX; null/omit = last frame */
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsInt()
  @Min(0)
  @Max(64)
  attackSfxFrame?: number | null;

  /** 0-based Attack frame for ranged shot; null/omit = last frame */
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsInt()
  @Min(0)
  @Max(64)
  attackShotFrame?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxActivePerNation?: number;

  @IsOptional()
  @IsBoolean()
  stationary?: boolean;

  @IsOptional()
  @IsBoolean()
  dealsDamage?: boolean;

  @IsOptional()
  @IsBoolean()
  onDeathAoe?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  auraRadius?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.05)
  auraInterval?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  auraDamagePerTick?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  auraSlowPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  auraStunChance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  auraStunDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  trailSlowPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  trailDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  trailInterval?: number;

  @IsOptional()
  @IsBoolean()
  canMolt?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cocoonHp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cocoonDurationSec?: number;

  @IsOptional()
  @IsString()
  moltFormUnitTypeId?: string | null;

  @IsOptional()
  @IsString()
  cocoonSpriteKey?: string | null;
}

export class UpdateUnitTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  spriteKey?: string;

  @IsOptional()
  @IsString()
  spriteUrl?: string;

  @IsOptional()
  @IsString()
  animIdleKey?: string;

  @IsOptional()
  @IsString()
  animWalkKey?: string;

  @IsOptional()
  @IsString()
  animAttackKey?: string;

  @IsOptional()
  @IsString()
  animDeathKey?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  baseHp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseAttackDamage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  attackSpeed?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  moveSpeed?: number;

  @IsOptional()
  @IsIn(['melee', 'ranged'])
  attackRange?: 'melee' | 'ranged';

  @IsOptional()
  @IsNumber()
  @Min(1)
  attackRangeValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  detectionRange?: number;

  @IsOptional()
  @IsBoolean()
  isSplash?: boolean;

  @IsOptional()
  @IsNumber()
  splashRadius?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stunChance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stunDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  knockbackForce?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  stunResist?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  knockbackResist?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  aoeDamage?: number;

  @IsOptional()
  @IsObject()
  damageTakenMods?: Record<string, number>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lifesteal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  scale?: number;

  /** 0–2 multiplier for spawn SFX (1 = default) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  sfxSpawnVolume?: number;

  /** 0–2 multiplier for attack SFX (1 = default) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  sfxAttackVolume?: number;

  /** 0-based Attack frame for SFX; null/omit = last frame */
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsInt()
  @Min(0)
  @Max(64)
  attackSfxFrame?: number | null;

  /** 0-based Attack frame for ranged shot; null/omit = last frame */
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsInt()
  @Min(0)
  @Max(64)
  attackShotFrame?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxActivePerNation?: number;

  @IsOptional()
  @IsBoolean()
  stationary?: boolean;

  @IsOptional()
  @IsBoolean()
  dealsDamage?: boolean;

  @IsOptional()
  @IsBoolean()
  onDeathAoe?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  auraRadius?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.05)
  auraInterval?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  auraDamagePerTick?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  auraSlowPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  auraStunChance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  auraStunDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  trailSlowPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  trailDuration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  trailInterval?: number;

  @IsOptional()
  @IsBoolean()
  canMolt?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cocoonHp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cocoonDurationSec?: number;

  @IsOptional()
  @IsString()
  moltFormUnitTypeId?: string | null;

  @IsOptional()
  @IsString()
  cocoonSpriteKey?: string | null;
}
