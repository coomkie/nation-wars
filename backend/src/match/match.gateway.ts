import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchEndReason, MatchState, Unit } from '../common/types';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/battle',
})
export class MatchGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private latest: MatchState | null = null;
  private tiktokStatus: 'connected' | 'disconnected' | 'reconnecting' =
    'disconnected';

  handleConnection(client: Socket) {
    if (this.latest) {
      client.emit('match:init', this.latest);
    }
    client.emit('tiktok:status', { status: this.tiktokStatus });
  }

  emitMatchInit(match: MatchState) {
    this.latest = match;
    this.server?.emit('match:init', match);
  }

  emitMatchUpdate(match: MatchState) {
    this.latest = match;
    this.server?.emit('match:update', match);
  }

  emitUnitSpawned(nationId: string, unit: Unit) {
    this.server?.emit('unit:spawned', { nationId, unit });
  }

  emitUnitsMoved(
    updates: Array<{ unitId: string; position: { x: number; y: number } }>,
  ) {
    this.server?.emit('unit:moved', { updates });
  }

  emitUnitEngaged(unitId: string, targetUnitId: string) {
    this.server?.emit('unit:engaged', { unitId, targetUnitId });
  }

  /** One swing start — overlay plays attack anim; damage lands on last frame */
  emitUnitAttack(unitId: string) {
    this.server?.emit('unit:attack', { unitId });
  }

  emitUnitDamaged(unitId: string, hp: number, maxHp: number) {
    this.server?.emit('unit:damaged', { unitId, hp, maxHp });
  }

  emitUnitDied(payload: {
    unitId: string;
    nationId: string;
    victimUsername: string;
    victimDisplayName: string;
    killerUnitId: string;
    killerUsername: string;
    killerDisplayName: string;
    killerNationId: string;
  }) {
    this.server?.emit('unit:died', payload);
  }

  emitUnitState(payload: {
    unitId: string;
    state: string;
    targetUnitId: string | null;
  }) {
    this.server?.emit('unit:state', payload);
  }

  emitProjectile(payload: {
    id: string;
    kind: 'arrow' | 'base';
    from: { x: number; y: number };
    to: { x: number; y: number };
    durationMs: number;
  }) {
    this.server?.emit('fx:projectile', payload);
  }

  emitExplosion(payload: {
    x: number;
    y: number;
    radius: number;
  }) {
    this.server?.emit('fx:explosion', payload);
  }

  emitBaseDamaged(nationId: string, currentHp: number, maxHp: number) {
    this.server?.emit('base:damaged', { nationId, currentHp, maxHp });
  }

  emitBaseDestroyed(nationId: string) {
    this.server?.emit('base:destroyed', { nationId });
  }

  emitMatchStarted(payload: {
    matchId: string;
    nationA: string;
    nationB: string;
    endsAt: string;
  }) {
    this.server?.emit('match:started', payload);
  }

  emitMatchEnded(payload: {
    winnerNationId: string | null;
    generalA: string | null;
    generalB: string | null;
    finalScoreA: number;
    finalScoreB: number;
    intermissionSeconds: number;
    championNationId: string | null;
    tournamentComplete: boolean;
    reason: MatchEndReason;
    baseAHpRemaining: number;
    baseBHpRemaining: number;
  }) {
    this.server?.emit('match:ended', payload);
  }

  emitIntermission(payload: {
    nextMatchAt: string;
    intermissionSeconds: number;
  }) {
    this.server?.emit('match:intermission', payload);
  }

  emitTournamentComplete(payload: { championNationId: string }) {
    this.server?.emit('tournament:complete', payload);
  }

  emitTiktokStatus(status: 'connected' | 'disconnected' | 'reconnecting') {
    this.tiktokStatus = status;
    this.server?.emit('tiktok:status', { status });
  }
}
