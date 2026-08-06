import { Module } from '@nestjs/common';
import { LiveListenerService } from './live-listener.service';
import { LiveListenerController } from './live-listener.controller';
import { MatchModule } from '../match/match.module';
import { AdminAuthGuard } from '../common/admin-auth.guard';

@Module({
  imports: [MatchModule],
  controllers: [LiveListenerController],
  providers: [LiveListenerService, AdminAuthGuard],
  exports: [LiveListenerService],
})
export class LiveListenerModule {}
