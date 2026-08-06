import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
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
  @IsNumber()
  @Min(0)
  @Max(1)
  blocking?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  scale?: number;
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
  @IsNumber()
  @Min(0)
  @Max(1)
  blocking?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  scale?: number;
}
