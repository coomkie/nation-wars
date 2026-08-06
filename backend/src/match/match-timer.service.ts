import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { MatchService } from './match.service';

@Injectable()
export class MatchTimerService {
  private readonly logger = new Logger(MatchTimerService.name);
  private timeout: NodeJS.Timeout | null = null;
  private intermissionTimeout: NodeJS.Timeout | null = null;

  constructor(
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService,
  ) {}

  start(endsAt: Date): void {
    this.clear();
    const ms = endsAt.getTime() - Date.now();
    if (ms <= 0) {
      this.matchService.onTimerExpired();
      return;
    }
    this.timeout = setTimeout(() => {
      this.logger.log('Match timer expired');
      this.matchService.onTimerExpired();
    }, ms);
  }

  scheduleIntermission(ms: number, onDone: () => void): void {
    this.clearIntermission();
    this.intermissionTimeout = setTimeout(() => {
      this.intermissionTimeout = null;
      onDone();
    }, Math.max(0, ms));
  }

  clear(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  clearIntermission(): void {
    if (this.intermissionTimeout) {
      clearTimeout(this.intermissionTimeout);
      this.intermissionTimeout = null;
    }
  }

  clearAll(): void {
    this.clear();
    this.clearIntermission();
  }
}
