import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MatchService } from './match.service';
import { AdminAuthGuard } from '../common/admin-auth.guard';
import { GiftNationMapping, GiftUnitTypeMapping } from '../common/types';

const battlefieldUploadDir = join(process.cwd(), 'uploads', 'battlefield');
if (!existsSync(battlefieldUploadDir)) {
  mkdirSync(battlefieldUploadDir, { recursive: true });
}

class GiftMappingDto implements GiftNationMapping {
  @IsInt()
  giftId: number;

  @IsString()
  giftName: string;

  @IsString()
  nationId: string;
}

class GiftUnitTypeMappingDto implements GiftUnitTypeMapping {
  @IsInt()
  giftId: number;

  @IsString()
  giftName: string;

  @IsString()
  unitTypeId: string;
}

class StartMatchBody {
  @IsOptional()
  @IsString()
  bracketNodeId?: string;

  @IsString()
  nationAId: string;

  @IsString()
  nationBId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  intermissionSeconds?: number;

  @IsString()
  defaultNationId: string;

  @IsString()
  defaultUnitTypeId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  baseMaxHp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseAttackRange?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseAttackDamage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseAttackSpeed?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GiftMappingDto)
  giftMappings?: GiftMappingDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GiftUnitTypeMappingDto)
  giftUnitTypeMappings?: GiftUnitTypeMappingDto[];
}

class MockGiftBody {
  @IsInt()
  giftId: number;

  @IsString()
  giftName: string;

  @IsNumber()
  @Min(1)
  diamondCount: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  repeatCount?: number;

  @IsString()
  username: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  nationId?: string;

  @IsOptional()
  @IsString()
  unitTypeId?: string;
}

class SettingsBody {
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  intermissionSeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  baseMaxHp?: number;

  @IsOptional()
  @IsString()
  stageBgUrl?: string | null;

  @IsOptional()
  @IsString()
  battlefieldBgUrl?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseAttackRange?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseAttackDamage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseAttackSpeed?: number;
}

@Controller('matches')
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  @Get('current')
  current() {
    return this.matchService.getState();
  }

  @Get('settings')
  settings() {
    return this.matchService.getSettings();
  }

  @Patch('settings')
  @UseGuards(AdminAuthGuard)
  patchSettings(@Body() body: SettingsBody) {
    return this.matchService.setSettings(body);
  }

  @Post('stage-bg')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: battlefieldUploadDir,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.png';
          cb(null, `stage-${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 12 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /\.(png|jpe?g|webp|gif)$/i.test(file.originalname);
        cb(
          ok ? null : new BadRequestException('Expected png/jpg/webp/gif'),
          ok,
        );
      },
    }),
  )
  uploadStageBg(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    const url = `/uploads/battlefield/${file.filename}`;
    return this.matchService.setStageBgUrl(url);
  }

  @Delete('stage-bg')
  @UseGuards(AdminAuthGuard)
  clearStageBg() {
    return this.matchService.setStageBgUrl(null);
  }

  @Post('battlefield-bg')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: battlefieldUploadDir,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.png';
          cb(null, `arena-${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 12 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /\.(png|jpe?g|webp|gif)$/i.test(file.originalname);
        cb(
          ok ? null : new BadRequestException('Expected png/jpg/webp/gif'),
          ok,
        );
      },
    }),
  )
  uploadBattlefieldBg(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    const url = `/uploads/battlefield/${file.filename}`;
    return this.matchService.setBattlefieldBgUrl(url);
  }

  @Delete('battlefield-bg')
  @UseGuards(AdminAuthGuard)
  clearBattlefieldBg() {
    return this.matchService.setBattlefieldBgUrl(null);
  }

  @Post()
  @UseGuards(AdminAuthGuard)
  start(@Body() body: StartMatchBody) {
    return this.matchService.startMatch(body);
  }

  @Post('next')
  @UseGuards(AdminAuthGuard)
  next() {
    return this.matchService.startNextBracketMatch();
  }

  @Post('end')
  @UseGuards(AdminAuthGuard)
  end() {
    return this.matchService.endMatch('manual');
  }

  @Post('reset')
  @UseGuards(AdminAuthGuard)
  reset() {
    return this.matchService.resetToIdle();
  }

  @Post('mock-gift')
  @UseGuards(AdminAuthGuard)
  async mockGift(@Body() body: MockGiftBody) {
    const state = this.matchService.getState();
    if (state.status !== 'active') {
      throw new BadRequestException('No active match');
    }
    if (body.nationId) {
      const ok =
        body.nationId === state.nationA.nationId ||
        body.nationId === state.nationB.nationId;
      if (!ok) {
        throw new BadRequestException(
          'nationId must be Nation A or Nation B of the active match',
        );
      }
    }
    await this.matchService.processGift({
      giftId: body.giftId,
      giftName: body.giftName,
      diamondCount: body.diamondCount,
      repeatCount: body.repeatCount ?? 1,
      username: body.username,
      displayName: body.displayName ?? body.username,
      forcedNationId: body.nationId,
      forcedUnitTypeId: body.unitTypeId,
    });
    return this.matchService.getState();
  }
}
