import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitTypeEntity } from './unit-type.entity';
import { UnitTypeService } from './unit-type.service';
import { UnitTypeController } from './unit-type.controller';
import { AdminAuthGuard } from '../common/admin-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([UnitTypeEntity])],
  controllers: [UnitTypeController],
  providers: [UnitTypeService, AdminAuthGuard],
  exports: [UnitTypeService],
})
export class UnitTypeModule {}
