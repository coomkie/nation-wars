import { io } from 'socket.io-client';
import { renderBracketTree } from './tree-renderer';
import type { BracketDto, NationMeta } from './tree-renderer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const svg = document.getElementById('tree') as unknown as SVGSVGElement;
const empty = document.getElementById('empty') as HTMLDivElement;

const nations = new Map<string, NationMeta>();
let current: BracketDto | null = null;

async function loadNations() {
  try {
    const res = await fetch(`${API_URL}/nations`);
    if (!res.ok) return;
    const list = await res.json();
    for (const n of list) {
      nations.set(n.id, {
        id: n.id,
        name: n.name,
        flagUrl: n.flagUrl?.startsWith('http')
          ? n.flagUrl
          : `${API_URL}${n.flagUrl}`,
      });
    }
  } catch {
    /* ignore */
  }
}

function paint() {
  if (!current) {
    empty.style.display = 'flex';
    svg.innerHTML = '';
    return;
  }
  empty.style.display = 'none';
  renderBracketTree(svg, current, nations);
}

async function bootstrap() {
  await loadNations();

  try {
    const res = await fetch(`${API_URL}/brackets/latest`);
    if (res.ok) {
      const data = await res.json();
      if (data) {
        current = data;
        paint();
      }
    }
  } catch {
    /* ignore */
  }

  const socket = io(`${API_URL}/bracket`, {
    transports: ['websocket', 'polling'],
  });

  socket.on('bracket:init', async (bracket: BracketDto) => {
    await loadNations();
    current = bracket;
    paint();
  });
  socket.on('bracket:update', async (bracket: BracketDto) => {
    await loadNations();
    current = bracket;
    paint();
  });
  socket.on('bracket:champion', () => {
    paint();
  });
}

bootstrap();
