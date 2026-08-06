import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Nation } from './nation.entity';
import { CreateNationDto, UpdateNationDto } from './dto/nation.dto';

@Injectable()
export class NationService {
  constructor(
    @InjectRepository(Nation)
    private readonly nations: Repository<Nation>,
  ) {}

  findAll(): Promise<Nation[]> {
    return this.nations.find({ order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<Nation> {
    const nation = await this.nations.findOne({ where: { id } });
    if (!nation) {
      throw new NotFoundException(`Nation ${id} not found`);
    }
    return nation;
  }

  async create(dto: CreateNationDto, flagUrl?: string): Promise<Nation> {
    const existing = await this.nations.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new BadRequestException(`Nation name "${dto.name}" already exists`);
    }
    const url = flagUrl ?? dto.flagUrl;
    if (!url) {
      throw new BadRequestException('flagUrl or flag file is required');
    }
    const nation = this.nations.create({ name: dto.name, flagUrl: url });
    return this.nations.save(nation);
  }

  async update(
    id: string,
    dto: UpdateNationDto,
    flagUrl?: string,
  ): Promise<Nation> {
    const nation = await this.findOne(id);
    if (dto.name && dto.name !== nation.name) {
      const existing = await this.nations.findOne({
        where: { name: dto.name },
      });
      if (existing) {
        throw new BadRequestException(
          `Nation name "${dto.name}" already exists`,
        );
      }
      nation.name = dto.name;
    }
    if (flagUrl) {
      nation.flagUrl = flagUrl;
    } else if (dto.flagUrl) {
      nation.flagUrl = dto.flagUrl;
    }
    return this.nations.save(nation);
  }

  async remove(id: string): Promise<void> {
    const nation = await this.findOne(id);
    await this.nations.remove(nation);
  }
}
