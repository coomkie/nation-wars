import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitTypeEntity } from './unit-type.entity';
import { CreateUnitTypeDto, UpdateUnitTypeDto } from './dto/unit-type.dto';

const BEHAVIOR_KEYS: (keyof UpdateUnitTypeDto)[] = [
  'spriteKey',
  'spriteUrl',
  'animIdleKey',
  'animWalkKey',
  'animAttackKey',
  'animDeathKey',
  'baseHp',
  'baseAttackDamage',
  'attackSpeed',
  'moveSpeed',
  'attackRange',
  'attackRangeValue',
  'detectionRange',
  'isSplash',
  'splashRadius',
  'stunChance',
  'stunDuration',
  'knockbackForce',
  'stunResist',
  'knockbackResist',
  'aoeDamage',
  'damageTakenMods',
  'lifesteal',
  'scale',
  'maxActivePerNation',
  'stationary',
  'dealsDamage',
  'onDeathAoe',
  'auraRadius',
  'auraInterval',
  'auraDamagePerTick',
  'auraSlowPct',
  'auraStunChance',
  'auraStunDuration',
  'trailSlowPct',
  'trailDuration',
  'trailInterval',
  'canMolt',
  'cocoonHp',
  'cocoonDurationSec',
  'moltFormUnitTypeId',
  'cocoonSpriteKey',
];

@Injectable()
export class UnitTypeService implements OnModuleInit {
  constructor(
    @InjectRepository(UnitTypeEntity)
    private readonly repo: Repository<UnitTypeEntity>,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.repo.count();
      if (count === 0) {
        await this.seedDefaults();
      } else {
        await this.repo
          .createQueryBuilder()
          .update()
          .set({ detectionRange: 120, attackRangeValue: 42 })
          .where('name = :name AND detectionRange < :min', {
            name: 'Infantry',
            min: 100,
          })
          .execute();
        await this.repo
          .createQueryBuilder()
          .update()
          .set({ detectionRange: 130, attackRangeValue: 44 })
          .where('name = :name AND detectionRange < :min', {
            name: 'Cavalry',
            min: 100,
          })
          .execute();
        await this.repo
          .createQueryBuilder()
          .update()
          .set({
            isSplash: true,
            splashRadius: 90,
            stunChance: 0.15,
            stunDuration: 0.8,
            knockbackForce: 24,
          })
          .where('name = :name AND isSplash = :splash', {
            name: 'Mage',
            splash: false,
          })
          .execute();
        await this.ensureExtraUnitTypes();
      }
    } catch (err: any) {
      console.warn(
        `[UnitTypeService] seed/migrate skipped: ${err?.message ?? err}`,
      );
    }
  }

  private async seedDefaults() {
    const defaults: Partial<UnitTypeEntity>[] = [
      {
        name: 'Infantry',
        spriteKey: 'infantry',
        baseHp: 120,
        baseAttackDamage: 12,
        attackSpeed: 1.0,
        moveSpeed: 45,
        attackRange: 'melee',
        attackRangeValue: 42,
        detectionRange: 120,
        isSplash: false,
        splashRadius: null,
      },
      {
        name: 'Cavalry',
        spriteKey: 'cavalry',
        baseHp: 90,
        baseAttackDamage: 18,
        attackSpeed: 1.1,
        moveSpeed: 75,
        attackRange: 'melee',
        attackRangeValue: 44,
        detectionRange: 130,
        isSplash: false,
        splashRadius: null,
      },
      {
        name: 'Archer',
        spriteKey: 'archer',
        baseHp: 70,
        baseAttackDamage: 14,
        attackSpeed: 0.9,
        moveSpeed: 50,
        attackRange: 'ranged',
        attackRangeValue: 160,
        detectionRange: 200,
        isSplash: false,
        splashRadius: null,
      },
      {
        name: 'Mage',
        spriteKey: 'mage',
        baseHp: 55,
        baseAttackDamage: 22,
        attackSpeed: 0.65,
        moveSpeed: 40,
        attackRange: 'ranged',
        attackRangeValue: 180,
        detectionRange: 220,
        isSplash: true,
        splashRadius: 90,
        stunChance: 0.15,
        stunDuration: 0.8,
        knockbackForce: 24,
        aoeDamage: 12,
      },
      ...this.extraUnitTypeDefs(),
    ];
    await this.repo.save(defaults.map((d) => this.repo.create(d)));
  }

  private extraUnitTypeDefs(): Partial<UnitTypeEntity>[] {
    return [
      {
        name: 'Bull',
        spriteKey: 'bull',
        baseHp: 200,
        baseAttackDamage: 16,
        attackSpeed: 0.75,
        moveSpeed: 55,
        attackRange: 'melee',
        attackRangeValue: 48,
        detectionRange: 140,
        isSplash: false,
        splashRadius: null,
        knockbackForce: 36,
        stunResist: 0.25,
        knockbackResist: 0.35,
        scale: 1,
      },
      {
        name: 'Berserker',
        spriteKey: 'berserker',
        baseHp: 100,
        baseAttackDamage: 26,
        attackSpeed: 1.25,
        moveSpeed: 60,
        attackRange: 'melee',
        attackRangeValue: 44,
        detectionRange: 150,
        isSplash: false,
        splashRadius: null,
        stunChance: 0.1,
        stunDuration: 0.5,
        scale: 1.4,
      },
      {
        name: 'Titan',
        spriteKey: 'titan',
        baseHp: 280,
        baseAttackDamage: 28,
        attackSpeed: 0.6,
        moveSpeed: 35,
        attackRange: 'melee',
        attackRangeValue: 56,
        detectionRange: 160,
        isSplash: false,
        splashRadius: null,
        knockbackForce: 48,
        stunResist: 0.5,
        knockbackResist: 0.6,
        scale: 1.5,
      },
      {
        name: 'Knight',
        spriteKey: 'knight',
        baseHp: 160,
        baseAttackDamage: 18,
        attackSpeed: 0.95,
        moveSpeed: 48,
        attackRange: 'melee',
        attackRangeValue: 46,
        detectionRange: 140,
        isSplash: false,
        splashRadius: null,
        stunResist: 0.2,
        knockbackResist: 0.3,
        scale: 1,
      },
    ];
  }

  private async ensureExtraUnitTypes() {
    for (const def of this.extraUnitTypeDefs()) {
      const existing = await this.repo.findOne({ where: { name: def.name! } });
      if (!existing) {
        await this.repo.save(this.repo.create(def));
      }
    }
  }

  findAll(): Promise<UnitTypeEntity[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<UnitTypeEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Unit type ${id} not found`);
    return row;
  }

  async findByName(name: string): Promise<UnitTypeEntity | null> {
    return this.repo.findOne({ where: { name } });
  }

  async create(dto: CreateUnitTypeDto): Promise<UnitTypeEntity> {
    const existing = await this.repo.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new BadRequestException(`Unit type "${dto.name}" already exists`);
    }
    const row = this.repo.create({
      name: dto.name,
      spriteKey: dto.spriteKey ?? dto.name.toLowerCase().replace(/\s+/g, '_'),
      spriteUrl: dto.spriteUrl ?? null,
      animIdleKey: dto.animIdleKey ?? 'idle',
      animWalkKey: dto.animWalkKey ?? 'walk',
      animAttackKey: dto.animAttackKey ?? 'attack',
      animDeathKey: dto.animDeathKey ?? 'death',
      baseHp: dto.baseHp ?? 100,
      baseAttackDamage: dto.baseAttackDamage ?? 10,
      attackSpeed: dto.attackSpeed ?? 1,
      moveSpeed: dto.moveSpeed ?? 40,
      attackRange: dto.attackRange ?? 'melee',
      attackRangeValue: dto.attackRangeValue ?? 40,
      detectionRange: dto.detectionRange ?? 80,
      isSplash: dto.isSplash ?? false,
      splashRadius: dto.splashRadius ?? null,
      stunChance: dto.stunChance ?? 0,
      stunDuration: dto.stunDuration ?? 0,
      knockbackForce: dto.knockbackForce ?? 0,
      stunResist: dto.stunResist ?? 0,
      knockbackResist: dto.knockbackResist ?? 0,
      aoeDamage: dto.aoeDamage ?? 0,
      damageTakenMods: dto.damageTakenMods ?? {},
      lifesteal: dto.lifesteal ?? 0,
      scale: dto.scale ?? 1,
      maxActivePerNation: dto.maxActivePerNation ?? 0,
      stationary: dto.stationary ?? false,
      dealsDamage: dto.dealsDamage ?? true,
      onDeathAoe: dto.onDeathAoe ?? false,
      auraRadius: dto.auraRadius ?? 0,
      auraInterval: dto.auraInterval ?? 1,
      auraDamagePerTick: dto.auraDamagePerTick ?? 0,
      auraSlowPct: dto.auraSlowPct ?? 0,
      auraStunChance: dto.auraStunChance ?? 0,
      auraStunDuration: dto.auraStunDuration ?? 0,
      trailSlowPct: dto.trailSlowPct ?? 0,
      trailDuration: dto.trailDuration ?? 0,
      trailInterval: dto.trailInterval ?? 0,
      canMolt: dto.canMolt ?? false,
      cocoonHp: dto.cocoonHp ?? 0,
      cocoonDurationSec: dto.cocoonDurationSec ?? 5,
      moltFormUnitTypeId: dto.moltFormUnitTypeId ?? null,
      cocoonSpriteKey: dto.cocoonSpriteKey ?? null,
    });
    return this.repo.save(row);
  }

  async update(id: string, dto: UpdateUnitTypeDto): Promise<UnitTypeEntity> {
    const row = await this.findOne(id);
    if (dto.name && dto.name !== row.name) {
      const existing = await this.repo.findOne({ where: { name: dto.name } });
      if (existing) {
        throw new BadRequestException(`Unit type "${dto.name}" already exists`);
      }
      row.name = dto.name;
    }
    for (const key of BEHAVIOR_KEYS) {
      if (dto[key] !== undefined) {
        (row as any)[key] = dto[key];
      }
    }
    return this.repo.save(row);
  }

  async remove(id: string): Promise<void> {
    const row = await this.findOne(id);
    await this.repo.remove(row);
  }

  /** Combat stats from unit type (no tier scaling) */
  statsFor(type: UnitTypeEntity) {
    return {
      maxHp: type.baseHp,
      attackDamage: type.baseAttackDamage,
      attackSpeed: type.attackSpeed,
      moveSpeed: type.moveSpeed,
      attackRange: type.attackRange,
      attackRangeValue: type.attackRangeValue,
      detectionRange: type.detectionRange,
      isSplash: type.isSplash,
      splashRadius: type.splashRadius,
      stunChance: type.stunChance ?? 0,
      stunDuration: type.stunDuration ?? 0,
      knockbackForce: type.knockbackForce ?? 0,
      stunResist: type.stunResist ?? 0,
      knockbackResist: type.knockbackResist ?? 0,
      aoeDamage: type.aoeDamage ?? 0,
      damageTakenMods: { ...(type.damageTakenMods ?? {}) },
      lifesteal: type.lifesteal ?? 0,
      scale: type.scale ?? 1,
      maxActivePerNation: type.maxActivePerNation ?? 0,
      stationary: type.stationary ?? false,
      dealsDamage: type.dealsDamage ?? true,
      onDeathAoe: type.onDeathAoe ?? false,
      auraRadius: type.auraRadius ?? 0,
      auraInterval: type.auraInterval ?? 1,
      auraDamagePerTick: type.auraDamagePerTick ?? 0,
      auraSlowPct: type.auraSlowPct ?? 0,
      auraStunChance: type.auraStunChance ?? 0,
      auraStunDuration: type.auraStunDuration ?? 0,
      trailSlowPct: type.trailSlowPct ?? 0,
      trailDuration: type.trailDuration ?? 0,
      trailInterval: type.trailInterval ?? 0,
      canMolt: type.canMolt ?? false,
      cocoonHp: type.cocoonHp ?? 0,
      cocoonDurationSec: type.cocoonDurationSec ?? 5,
      moltFormUnitTypeId: type.moltFormUnitTypeId ?? null,
      cocoonSpriteKey: type.cocoonSpriteKey ?? null,
    };
  }
}
