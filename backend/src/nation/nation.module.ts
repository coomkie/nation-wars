import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Nation } from './nation.entity';
import { NationService } from './nation.service';
import { NationController } from './nation.controller';
import { AdminAuthGuard } from '../common/admin-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Nation])],
  controllers: [NationController],
  providers: [NationService, AdminAuthGuard],
  exports: [NationService],
})
export class NationModule {}
