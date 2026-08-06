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
  'sfxSpawnVolume',
  'sfxAttackVolume',
  'attackSfxFrame',
  'attackShotFrame',
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
        await this.ensureCicadaMoltLink();
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
      // Form 2 first so ensureCicadaMoltLink can find it after insert
      {
        name: 'Cicada Form 2',
        spriteKey: 'cicada_form2',
        baseHp: 55,
        baseAttackDamage: 14,
        attackSpeed: 1.2,
        moveSpeed: 65,
        attackRange: 'melee',
        attackRangeValue: 42,
        detectionRange: 130,
        isSplash: false,
        splashRadius: null,
        scale: 0.95,
        canMolt: false,
      },
      {
        name: 'Cicada',
        spriteKey: 'cicada',
        baseHp: 140,
        baseAttackDamage: 16,
        attackSpeed: 0.9,
        moveSpeed: 42,
        attackRange: 'melee',
        attackRangeValue: 44,
        detectionRange: 140,
        isSplash: false,
        splashRadius: null,
        scale: 1.1,
        canMolt: true,
        cocoonHp: 80,
        cocoonDurationSec: 5,
        cocoonSpriteKey: 'cicada_cocoon',
        // moltFormUnitTypeId set in ensureCicadaMoltLink after Form 2 exists
      },
      {
        name: 'Bomb Carrier',
        // Folder typo kept on disk: bomb_carrior
        spriteKey: 'bomb_carrior',
        baseHp: 70,
        baseAttackDamage: 6,
        attackSpeed: 0.7,
        moveSpeed: 40,
        attackRange: 'melee',
        attackRangeValue: 40,
        detectionRange: 110,
        isSplash: false,
        splashRadius: 110,
        aoeDamage: 45,
        onDeathAoe: true,
        stunChance: 0.35,
        stunDuration: 1.0,
        scale: 1.05,
      },
      {
        name: 'Plague Rat',
        spriteKey: 'rat',
        baseHp: 85,
        baseAttackDamage: 8,
        attackSpeed: 1.0,
        moveSpeed: 48,
        attackRange: 'melee',
        attackRangeValue: 40,
        detectionRange: 120,
        isSplash: false,
        splashRadius: null,
        auraRadius: 95,
        auraInterval: 0.45,
        auraDamagePerTick: 5,
        scale: 1.15,
      },
      {
        name: 'Crossbower',
        spriteKey: 'crossbower',
        baseHp: 75,
        baseAttackDamage: 16,
        attackSpeed: 0.85,
        moveSpeed: 48,
        attackRange: 'ranged',
        attackRangeValue: 175,
        detectionRange: 210,
        isSplash: false,
        splashRadius: null,
        scale: 1,
      },
      {
        name: 'Cannon',
        spriteKey: 'cannon',
        baseHp: 120,
        baseAttackDamage: 28,
        attackSpeed: 0.45,
        moveSpeed: 28,
        attackRange: 'ranged',
        attackRangeValue: 240,
        detectionRange: 280,
        isSplash: true,
        splashRadius: 100,
        aoeDamage: 18,
        scale: 1.25,
      },
      {
        name: 'Bell Ringer',
        spriteKey: 'bell_ringer',
        baseHp: 160,
        baseAttackDamage: 0,
        attackSpeed: 0.55,
        moveSpeed: 0,
        attackRange: 'melee',
        attackRangeValue: 40,
        detectionRange: 160,
        isSplash: false,
        splashRadius: null,
        stationary: true,
        dealsDamage: false,
        maxActivePerNation: 1,
        auraRadius: 150,
        auraInterval: 2.2,
        auraDamagePerTick: 0,
        auraStunChance: 1,
        auraStunDuration: 1.2,
        scale: 1.2,
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
    await this.ensureCicadaMoltLink();
  }

  /** Wire Cicada → Cicada Form 2 + cocoon sprite key */
  private async ensureCicadaMoltLink() {
    const form2 = await this.repo.findOne({ where: { name: 'Cicada Form 2' } });
    const form1 = await this.repo.findOne({ where: { name: 'Cicada' } });
    if (!form1 || !form2) return;
    let dirty = false;
    if (form1.moltFormUnitTypeId !== form2.id) {
      form1.moltFormUnitTypeId = form2.id;
      dirty = true;
    }
    if (!form1.canMolt) {
      form1.canMolt = true;
      dirty = true;
    }
    if (!form1.cocoonSpriteKey) {
      form1.cocoonSpriteKey = 'cicada_cocoon';
      dirty = true;
    }
    if (!(form1.cocoonHp > 0)) {
      form1.cocoonHp = 80;
      dirty = true;
    }
    if (!(form1.cocoonDurationSec > 0)) {
      form1.cocoonDurationSec = 5;
      dirty = true;
    }
    if (dirty) await this.repo.save(form1);
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
      sfxSpawnVolume: dto.sfxSpawnVolume ?? 1,
      sfxAttackVolume: dto.sfxAttackVolume ?? 1,
      attackSfxFrame: dto.attackSfxFrame ?? null,
      attackShotFrame: dto.attackShotFrame ?? null,
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
      sfxSpawnVolume: type.sfxSpawnVolume ?? 1,
      sfxAttackVolume: type.sfxAttackVolume ?? 1,
      attackSfxFrame:
        typeof type.attackSfxFrame === 'number' ? type.attackSfxFrame : null,
      attackShotFrame:
        typeof type.attackShotFrame === 'number' ? type.attackShotFrame : null,
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
