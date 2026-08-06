import { Assets, Texture } from 'pixi.js';

export type DirKey = 'east' | 'west' | 'north' | 'south';

export type UnitClipName =
  | 'idle'
  | 'running'
  | 'attack'
  | 'dead'
  | 'cocooning'
  | 'revive';
export type CastleClipName = 'idle' | 'crash' | 'damaging';

type ClipMap = Partial<Record<DirKey, string[]>>;

export interface SpriteClips {
  idle: ClipMap;
  running: ClipMap;
  attack: ClipMap;
  dead: ClipMap;
  cocooning?: ClipMap;
  revive?: ClipMap;
  crash?: ClipMap;
  damaging?: ClipMap;
}

export interface SpriteCatalogDto {
  folders: Record<string, string>;
  clips: Record<string, SpriteClips>;
  effects?: Record<string, string[]>;
  projectiles?: Record<string, string>;
}

const textureCache = new Map<string, Texture>();

export async function loadCatalog(
  apiUrl: string,
): Promise<SpriteCatalogDto | null> {
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/sprites/catalog`);
    if (!res.ok) return null;
    return (await res.json()) as SpriteCatalogDto;
  } catch {
    return null;
  }
}

export function resolveClipUrls(
  catalog: SpriteCatalogDto | null,
  spriteKey: string,
  clip: UnitClipName | CastleClipName,
  dir: DirKey,
): string[] {
  if (!catalog) return [];
  const key =
    catalog.clips[spriteKey] != null
      ? spriteKey
      : spriteKey === 'cavalry' && catalog.clips.cavalry
        ? 'cavalry'
        : spriteKey;
  const clips = catalog.clips[key];
  if (!clips) return [];
  const map = (clips as unknown as Record<string, ClipMap | undefined>)[clip];
  if (!map) return [];
  return (
    map[dir] ??
    map.east ??
    map.west ??
    map.south ??
    map.north ??
    []
  );
}

export async function loadTextures(
  apiUrl: string,
  urls: string[],
): Promise<Texture[]> {
  const out: Texture[] = [];
  for (const url of urls) {
    const full = url.startsWith('http') ? url : `${apiUrl.replace(/\/$/, '')}${url}`;
    let tex = textureCache.get(full);
    if (!tex) {
      try {
        tex = (await Assets.load(full)) as Texture;
        textureCache.set(full, tex);
      } catch {
        continue;
      }
    }
    out.push(tex);
  }
  return out;
}

/** Pick east/west only (diagonal march uses left/right run sheets) */
export function pickDir(
  facing: 1 | -1,
  vx: number,
  _vy = 0,
): DirKey {
  if (Math.abs(vx) > 0.2) return vx > 0 ? 'east' : 'west';
  return facing > 0 ? 'east' : 'west';
}

export function clipForUnitState(state: string, moving: boolean): UnitClipName {
  if (state === 'dead') return 'dead';
  if (state === 'cocooning') return 'cocooning';
  // Combat stance holds idle between swings; attack clip is one-shot per unit:attack
  if (state === 'engaging' || state === 'attacking_base') return 'idle';
  if (moving || state === 'advancing') return 'running';
  return 'idle';
}
