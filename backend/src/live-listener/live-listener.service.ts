import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchService } from '../match/match.service';
import { MatchGateway } from '../match/match.gateway';

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

/** Loose typing — tiktok-live-connector v2 ESM types are awkward under Nest CJS builds */
type TikTokConn = {
  connect: () => Promise<{ roomId?: string }>;
  disconnect: () => Promise<void>;
  on: (event: string, handler: (...args: any[]) => void) => void;
};

@Injectable()
export class LiveListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveListenerService.name);
  private connection: TikTokConn | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private username: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly matchService: MatchService,
    private readonly matchGateway: MatchGateway,
  ) {}

  async onModuleInit() {
    const username = this.config.get<string>('TIKTOK_USERNAME')?.trim();
    if (username) {
      this.username = username;
      await this.connect(username);
    } else {
      this.logger.warn(
        'TIKTOK_USERNAME not set — TikTok listener idle. Use admin connect or mock gifts.',
      );
      this.matchGateway.emitTiktokStatus('disconnected');
    }
  }

  onModuleDestroy() {
    this.stopped = true;
    this.clearReconnect();
    void this.disconnect();
  }

  getStatus(): { status: ConnectionStatus; username: string | null } {
    const status = this.connection ? 'connected' : 'disconnected';
    return { status, username: this.username };
  }

  async connect(username: string): Promise<{ ok: boolean; message: string }> {
    this.stopped = false;
    this.username = username.replace(/^@/, '');
    this.clearReconnect();
    await this.disconnect();

    try {
      await this.openConnection(this.username);
      return { ok: true, message: `Connected to @${this.username}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to connect: ${message}`);
      this.scheduleReconnect();
      return { ok: false, message };
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.disconnect();
      } catch {
        /* ignore */
      }
      this.connection = null;
    }
    this.matchGateway.emitTiktokStatus('disconnected');
  }

  private async openConnection(username: string): Promise<void> {
    // Dynamic import for ESM-only package
    const mod = await import('tiktok-live-connector');
    const TikTokLiveConnection = mod.TikTokLiveConnection;
    const SignConfig = mod.SignConfig;

    const apiKey = this.config.get<string>('SIGN_API_KEY');
    if (apiKey) {
      SignConfig.apiKey = apiKey;
    } else {
      this.logger.warn('SIGN_API_KEY not set — signing may fail');
    }

    const conn = new TikTokLiveConnection(username, {
      signApiKey: apiKey,
      enableExtendedGiftInfo: true,
    }) as unknown as TikTokConn;

    conn.on('connected', (state: { roomId?: string }) => {
      this.reconnectAttempt = 0;
      this.logger.log(`Connected to room ${state?.roomId ?? username}`);
      this.matchGateway.emitTiktokStatus('connected');
    });

    conn.on('disconnected', () => {
      this.logger.warn('TikTok disconnected');
      this.connection = null;
      this.matchGateway.emitTiktokStatus('disconnected');
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });

    conn.on('error', (err: Error) => {
      this.logger.error(`TikTok error: ${err?.message ?? err}`);
    });

    conn.on('streamEnd', () => {
      this.logger.log('Stream ended');
      this.connection = null;
      this.matchGateway.emitTiktokStatus('disconnected');
    });

    conn.on('gift', (data: any) => {
      this.handleGift(data);
    });

    await conn.connect();
    this.connection = conn;
  }

  private handleGift(data: any): void {
    const giftType =
      data.giftDetails?.giftType ??
      data.extendedGiftInfo?.gift_type ??
      data.giftType;
    const repeatEnd = Boolean(data.repeatEnd);

    if (giftType === 1 && !repeatEnd) {
      return;
    }

    const diamondCount = Number(
      data.diamondCount ??
        data.giftDetails?.diamondCount ??
        data.extendedGiftInfo?.diamond_count ??
        1,
    );
    const repeatCount = Number(data.repeatCount ?? 1);
    const giftId = Number(data.giftId ?? data.giftDetails?.giftId ?? 0);
    const giftName =
      data.giftName ??
      data.giftDetails?.giftName ??
      data.extendedGiftInfo?.name ??
      'Gift';
    const username = data.user?.uniqueId ?? data.uniqueId ?? 'unknown';
    const displayName = data.user?.nickname ?? data.nickname ?? username;

    this.logger.debug(
      `Gift: ${username} → ${giftName} x${repeatCount} (${diamondCount}💎)`,
    );

    void this.matchService.processGift({
      giftId,
      giftName,
      diamondCount,
      repeatCount,
      username,
      displayName,
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || !this.username) return;
    this.clearReconnect();
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.matchGateway.emitTiktokStatus('reconnecting');
    this.logger.log(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`,
    );
    this.reconnectTimer = setTimeout(() => {
      void this.connect(this.username!).catch(() => undefined);
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
