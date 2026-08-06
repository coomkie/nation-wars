import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { UnitTypeService } from './unit-type.service';
import { CreateUnitTypeDto, UpdateUnitTypeDto } from './dto/unit-type.dto';
import { AdminAuthGuard } from '../common/admin-auth.guard';

const uploadDir = join(process.cwd(), 'uploads', 'unit-types');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

@Controller('unit-types')
export class UnitTypeController {
  constructor(private readonly service: UnitTypeService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(AdminAuthGuard)
  create(@Body() dto: CreateUnitTypeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(AdminAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdateUnitTypeDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/sprite')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(
    FileInterceptor('sprite', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname) || '.png'}`);
        },
      }),
      limits: { fileSize: 4 * 1024 * 1024 },
    }),
  )
  async uploadSprite(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      return this.service.findOne(id);
    }
    const url = `/uploads/unit-types/${file.filename}`;
    return this.service.update(id, { spriteUrl: url });
  }

  @Delete(':id')
  @UseGuards(AdminAuthGuard)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
