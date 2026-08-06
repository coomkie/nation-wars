import { Module } from '@nestjs/common';
import { SpritesController } from './sprites.controller';
import { SpritesService } from './sprites.service';
import { AdminAuthGuard } from '../common/admin-auth.guard';

@Module({
  controllers: [SpritesController],
  providers: [SpritesService, AdminAuthGuard],
  exports: [SpritesService],
})
export class SpritesModule {}
