import { Application } from 'pixi.js';
import { io, Socket } from 'socket.io-client';
import { BattleScene } from './scenes/battle-scene';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function bootstrap() {
  const app = new Application();
  await app.init({
    width: 1920,
    height: 1080,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  const host = document.getElementById('app');
  if (!host) return;
  host.appendChild(app.canvas);

  const scene = new BattleScene(app, API_URL);
  app.stage.addChild(scene.container);

  void scene.audio.init();

  const unlockAudio = () => {
    scene.audio.unlock();
    if (scene.audio.isUnlocked()) {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    }
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  document.getElementById('audio-unlock-hint')?.addEventListener('click', unlockAudio);

  const socket: Socket = io(`${API_URL}/battle`, {
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => scene.setConnectionStatus('socket-ok'));
  socket.on('disconnect', () => scene.setConnectionStatus('socket-lost'));
  socket.on('match:init', (match) => scene.onMatchInit(match));
  socket.on('match:update', (match) => scene.onMatchUpdate(match));
  socket.on('match:started', (payload) => scene.onMatchStarted(payload));
  socket.on('match:ended', (payload) => scene.onMatchEnded(payload));
  socket.on('match:intermission', (payload) => scene.onIntermission(payload));
  socket.on('tournament:complete', (payload) =>
    scene.onTournamentComplete(payload),
  );
  socket.on('unit:spawned', (payload) => scene.onUnitSpawned(payload));
  socket.on('unit:moved', (payload) => scene.onUnitsMoved(payload));
  socket.on('unit:engaged', (payload) => scene.onUnitEngaged(payload));
  socket.on('unit:attack', (payload) => scene.onUnitAttack(payload));
  socket.on('unit:damaged', (payload) => scene.onUnitDamaged(payload));
  socket.on('unit:died', (payload) => scene.onUnitDied(payload));
  socket.on('unit:state', (payload) => scene.onUnitState(payload));
  socket.on('fx:projectile', (payload) => scene.onProjectile(payload));
  socket.on('fx:explosion', (payload) => scene.onExplosion(payload));
  socket.on('base:damaged', (payload) => scene.onBaseDamaged(payload));
  socket.on('base:destroyed', (payload) => scene.onBaseDestroyed(payload));
  socket.on('tiktok:status', (payload) => scene.setTiktokStatus(payload.status));

  app.ticker.add(() => scene.tick(app.ticker.deltaMS));
}

bootstrap().catch(console.error);
