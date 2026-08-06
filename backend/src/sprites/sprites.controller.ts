import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SpritesService } from './sprites.service';
import { AdminAuthGuard } from '../common/admin-auth.guard';

@Controller('sprites')
export class SpritesController {
  constructor(private readonly sprites: SpritesService) {}

  @Get('catalog')
  catalog() {
    return this.sprites.getCatalog();
  }

  @Post('rebuild')
  @UseGuards(AdminAuthGuard)
  rebuild() {
    return this.sprites.rebuild();
  }
}
