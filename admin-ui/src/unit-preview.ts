/** Lightweight Attack/Idle/Run/Dead clip preview for admin Test Unit tab. */

export type DirKey = 'east' | 'west' | 'north' | 'south';
export type ClipName =
  | 'idle'
  | 'running'
  | 'attack'
  | 'dead'
  | 'cocooning'
  | 'revive';

type ClipMap = Partial<Record<DirKey, string[]>>;

export interface SpriteClips {
  idle: ClipMap;
  running: ClipMap;
  attack: ClipMap;
  dead: ClipMap;
  cocooning?: ClipMap;
  revive?: ClipMap;
}

export interface SpriteCatalogDto {
  folders: Record<string, string>;
  clips: Record<string, SpriteClips>;
}

const FPS = 10;

export function resolveClipUrls(
  catalog: SpriteCatalogDto | null,
  spriteKey: string,
  clip: ClipName,
  dir: DirKey,
): string[] {
  if (!catalog || !spriteKey) return [];
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

function absoluteUrl(apiUrl: string, url: string): string {
  if (url.startsWith('http')) return url;
  return `${apiUrl.replace(/\/$/, '')}${url}`;
}

async function loadImages(
  apiUrl: string,
  urls: string[],
): Promise<HTMLImageElement[]> {
  const loaded = await Promise.all(
    urls.map(
      (url) =>
        new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = absoluteUrl(apiUrl, url);
        }),
    ),
  );
  return loaded.filter((i): i is HTMLImageElement => !!i);
}

export type PreviewMarkers = {
  sfxFrame: number | null;
  shotFrame: number | null;
};

export class UnitAnimPreview {
  private catalog: SpriteCatalogDto | null = null;
  private images: HTMLImageElement[] = [];
  private frame = 0;
  private acc = 0;
  private playing = true;
  private loop = false;
  private raf = 0;
  private lastTs = 0;
  private clip: ClipName = 'attack';
  private markers: PreviewMarkers = { sfxFrame: null, shotFrame: null };
  private scale = 1;
  private spriteKey = '';
  private sfxVolume = 1;
  private sfxEnabled = true;
  private sfxFired = false;
  private readonly audioCache = new Map<string, HTMLAudioElement>();
  private readonly missingSfx = new Set<string>();
  private onFrame: ((info: { index: number; total: number }) => void) | null =
    null;
  private readonly canvas: HTMLCanvasElement;
  private readonly apiUrl: string;

  constructor(canvas: HTMLCanvasElement, apiUrl: string) {
    this.canvas = canvas;
    this.apiUrl = apiUrl;
    this.canvas.width = 280;
    this.canvas.height = 280;
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  setCatalog(catalog: SpriteCatalogDto | null) {
    this.catalog = catalog;
  }

  setOnFrame(cb: ((info: { index: number; total: number }) => void) | null) {
    this.onFrame = cb;
  }

  setPlaying(v: boolean) {
    this.playing = v;
  }

  setLoop(v: boolean) {
    this.loop = v;
    if (v && this.images.length > 1) this.playing = true;
  }

  isLoop() {
    return this.loop;
  }

  setSfxEnabled(v: boolean) {
    this.sfxEnabled = v;
  }

  setSfxSource(spriteKey: string, volume: number) {
    this.spriteKey = (spriteKey || '').trim();
    this.sfxVolume = Number.isFinite(volume)
      ? Math.max(0, Math.min(2, volume))
      : 1;
  }

  setMarkers(m: PreviewMarkers) {
    this.markers = m;
    this.draw();
  }

  setDisplayScale(scale: number) {
    this.scale = Math.max(0.2, Math.min(3, scale || 1));
    this.draw();
  }

  step(delta: number) {
    if (!this.images.length) return;
    this.playing = false;
    const prev = this.frame;
    this.frame =
      (this.frame + delta + this.images.length * 10) % this.images.length;
    if (this.frame !== prev) this.onFrameIndexChanged(prev);
    this.draw();
    this.emitFrame();
  }

  restart() {
    const prev = this.frame;
    this.frame = 0;
    this.acc = 0;
    this.sfxFired = false;
    this.playing = true;
    if (prev !== 0) this.onFrameIndexChanged(prev);
    else this.maybePlaySfx();
    this.draw();
    this.emitFrame();
  }

  async load(
    spriteKey: string,
    clip: ClipName,
    dir: DirKey,
    opts?: { loop?: boolean },
  ): Promise<{ ok: boolean; frames: number; message?: string }> {
    this.clip = clip;
    this.spriteKey = (spriteKey || '').trim();
    this.sfxFired = false;
    if (typeof opts?.loop === 'boolean') this.loop = opts.loop;
    const urls = resolveClipUrls(this.catalog, spriteKey, clip, dir);
    if (!urls.length) {
      this.images = [];
      this.frame = 0;
      this.draw();
      this.emitFrame();
      return {
        ok: false,
        frames: 0,
        message: `No ${clip}/${dir} frames for "${spriteKey}"`,
      };
    }
    this.images = await loadImages(this.apiUrl, urls);
    this.frame = 0;
    this.acc = 0;
    this.playing = true;
    this.draw();
    this.emitFrame();
    this.maybePlaySfx();
    // Warm attack/die audio
    if (clip === 'attack') void this.preloadUnitSfx('attack');
    if (clip === 'dead') void this.preloadUnitSfx('die');
    return { ok: this.images.length > 0, frames: this.images.length };
  }

  frameCount() {
    return this.images.length;
  }

  private emitFrame() {
    this.onFrame?.({ index: this.frame, total: this.images.length });
  }

  private onFrameIndexChanged(prev: number) {
    if (this.loop && prev > 0 && this.frame === 0) {
      this.sfxFired = false;
    }
    // Stepped backward past SFX frame → allow replay
    const target = this.resolveSfxTargetFrame();
    if (target != null && this.frame < target && prev >= target) {
      this.sfxFired = false;
    }
    this.maybePlaySfx();
  }

  private resolveSfxTargetFrame(): number | null {
    const n = this.images.length;
    if (!n) return null;
    const last = n - 1;
    if (this.clip === 'attack') {
      if (this.markers.sfxFrame == null) return last;
      return Math.min(last, Math.max(0, Math.floor(this.markers.sfxFrame)));
    }
    if (this.clip === 'dead') return last;
    return null;
  }

  private maybePlaySfx() {
    if (!this.sfxEnabled || !this.spriteKey) return;
    const target = this.resolveSfxTargetFrame();
    if (target == null) return;
    if (this.frame !== target) return;
    if (this.sfxFired) return;
    this.sfxFired = true;
    if (this.clip === 'attack') void this.playUnitSfx('attack');
    else if (this.clip === 'dead') void this.playUnitSfx('die');
  }

  private unitSfxUrl(action: 'attack' | 'die' | 'spawn'): string {
    const slug = this.spriteKey.toLowerCase();
    return `${this.apiUrl.replace(/\/$/, '')}/audio/sfx/units/${slug}_${action}.mp3`;
  }

  private preloadUnitSfx(action: 'attack' | 'die' | 'spawn') {
    const slug = this.spriteKey.toLowerCase();
    if (!slug) return;
    const key = `${slug}_${action}`;
    if (this.audioCache.has(key) || this.missingSfx.has(key)) return;
    const audio = new Audio(this.unitSfxUrl(action));
    audio.preload = 'auto';
    audio.addEventListener('error', () => this.missingSfx.add(key), {
      once: true,
    });
    this.audioCache.set(key, audio);
  }

  private async playUnitSfx(action: 'attack' | 'die' | 'spawn') {
    const slug = this.spriteKey.toLowerCase();
    if (!slug) return;
    const key = `${slug}_${action}`;
    if (this.missingSfx.has(key)) return;
    let audio = this.audioCache.get(key);
    if (!audio) {
      audio = new Audio(this.unitSfxUrl(action));
      audio.preload = 'auto';
      audio.addEventListener('error', () => this.missingSfx.add(key), {
        once: true,
      });
      this.audioCache.set(key, audio);
    }
    try {
      audio.pause();
      audio.currentTime = 0;
      // HTMLAudio volume is 0–1; map overlay 0–2 scale into that range
      audio.volume = Math.max(0, Math.min(1, this.sfxVolume));
      await audio.play();
    } catch {
      // Autoplay blocked until a click (Play / checkbox)
    }
  }

  private tick(ts: number) {
    this.raf = requestAnimationFrame(this.tick);
    if (!this.lastTs) this.lastTs = ts;
    const dt = ts - this.lastTs;
    this.lastTs = ts;
    if (this.playing && this.images.length > 1) {
      this.acc += dt;
      const frameMs = 1000 / FPS;
      while (this.acc >= frameMs) {
        this.acc -= frameMs;
        const prev = this.frame;
        if (this.frame < this.images.length - 1) {
          this.frame++;
        } else if (this.loop) {
          this.frame = 0;
        } else {
          this.playing = false;
          break;
        }
        if (this.frame !== prev) this.onFrameIndexChanged(prev);
        this.emitFrame();
      }
    } else if (this.playing && this.images.length === 1) {
      // Still allow SFX on single-frame attack
      this.maybePlaySfx();
    }
    this.draw();
  }

  private draw() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Checker / stage
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#132033';
    for (let y = 0; y < h; y += 16) {
      for (let x = 0; x < w; x += 16) {
        if (((x / 16) | 0) + ((y / 16) | 0) & 1) ctx.fillRect(x, y, 16, 16);
      }
    }

    const img = this.images[this.frame];
    if (img) {
      const max = Math.min(w, h) * 0.82 * this.scale;
      const ratio = Math.min(max / img.width, max / img.height);
      const dw = img.width * ratio;
      const dh = img.height * ratio;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2 - 8, dw, dh);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No frames', w / 2, h / 2);
    }

    this.drawTimeline(ctx, w, h);
  }

  private drawTimeline(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const n = this.images.length;
    if (n <= 0) return;
    const barY = h - 28;
    const pad = 12;
    const barW = w - pad * 2;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(pad, barY, barW, 10);
    const slot = barW / n;
    for (let i = 0; i < n; i++) {
      const x = pad + i * slot;
      if (i === this.frame) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(x, barY - 2, Math.max(2, slot - 1), 14);
      }
    }

    if (this.clip === 'attack') {
      const last = n - 1;
      const sfx =
        this.markers.sfxFrame == null
          ? last
          : Math.min(last, Math.max(0, Math.floor(this.markers.sfxFrame)));
      const shot =
        this.markers.shotFrame == null
          ? last
          : Math.min(last, Math.max(0, Math.floor(this.markers.shotFrame)));
      const mark = (idx: number, color: string, label: string) => {
        const x = pad + idx * slot + slot * 0.5;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, barY - 6);
        ctx.lineTo(x - 5, barY - 14);
        ctx.lineTo(x + 5, barY - 14);
        ctx.fill();
        ctx.font = '10px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, barY - 16);
      };
      mark(sfx, '#4ade80', 'SFX');
      mark(shot, '#fbbf24', 'SHOT');
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `frame ${this.frame}/${Math.max(0, n - 1)}  (${n} total @ ${FPS}fps)`,
      pad,
      h - 6,
    );
  }
}

export async function fetchSpriteCatalog(
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
