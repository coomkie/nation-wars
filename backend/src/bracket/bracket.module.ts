import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bracket } from './bracket.entity';
import { BracketNode } from './bracket-node.entity';
import { BracketService } from './bracket.service';
import { BracketController } from './bracket.controller';
import { BracketGateway } from './bracket.gateway';
import { AdminAuthGuard } from '../common/admin-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Bracket, BracketNode])],
  controllers: [BracketController],
  providers: [BracketService, BracketGateway, AdminAuthGuard],
  exports: [BracketService, BracketGateway],
})
export class BracketModule {}
