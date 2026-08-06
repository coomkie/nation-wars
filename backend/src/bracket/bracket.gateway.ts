import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { BracketDto } from '../common/types';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/bracket',
})
export class BracketGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private latest: BracketDto | null = null;

  handleConnection(client: Socket) {
    if (this.latest) {
      client.emit('bracket:init', this.latest);
    }
  }

  setLatest(bracket: BracketDto | null) {
    this.latest = bracket;
  }

  emitBracketInit(bracket: BracketDto) {
    this.latest = bracket;
    this.server?.emit('bracket:init', bracket);
  }

  emitBracketUpdate(bracket: BracketDto) {
    this.latest = bracket;
    this.server?.emit('bracket:update', bracket);
  }

  emitChampion(championNationId: string) {
    this.server?.emit('bracket:champion', { championNationId });
  }
}
