import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchHistory } from './match-history.entity';
import { MatchService } from './match.service';
import { MatchTimerService } from './match-timer.service';
import { CombatTickService } from './combat-tick.service';
import { MatchGateway } from './match.gateway';
import { MatchController } from './match.controller';
import { BracketModule } from '../bracket/bracket.module';
import { NationModule } from '../nation/nation.module';
import { UnitTypeModule } from '../unit-type/unit-type.module';
import { AdminAuthGuard } from '../common/admin-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([MatchHistory]),
    forwardRef(() => BracketModule),
    NationModule,
    UnitTypeModule,
  ],
  controllers: [MatchController],
  providers: [
    MatchService,
    MatchTimerService,
    CombatTickService,
    MatchGateway,
    AdminAuthGuard,
  ],
  exports: [MatchService, MatchGateway],
})
export class MatchModule {}
