import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { NationService } from './nation.service';
import { CreateNationDto, UpdateNationDto } from './dto/nation.dto';
import { AdminAuthGuard } from '../common/admin-auth.guard';

const flagsDir = join(process.cwd(), 'uploads', 'flags');
if (!existsSync(flagsDir)) {
  mkdirSync(flagsDir, { recursive: true });
}

@Controller('nations')
export class NationController {
  constructor(private readonly nationService: NationService) {}

  @Get()
  findAll() {
    return this.nationService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nationService.findOne(id);
  }

  @Post()
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(
    FileInterceptor('flag', {
      storage: diskStorage({
        destination: flagsDir,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname) || '.png'}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  create(
    @Body() dto: CreateNationDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const flagUrl = file ? `/uploads/flags/${file.filename}` : undefined;
    return this.nationService.create(dto, flagUrl);
  }

  @Patch(':id')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(
    FileInterceptor('flag', {
      storage: diskStorage({
        destination: flagsDir,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname) || '.png'}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNationDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const flagUrl = file ? `/uploads/flags/${file.filename}` : undefined;
    return this.nationService.update(id, dto, flagUrl);
  }

  @Delete(':id')
  @UseGuards(AdminAuthGuard)
  remove(@Param('id') id: string) {
    return this.nationService.remove(id);
  }
}
