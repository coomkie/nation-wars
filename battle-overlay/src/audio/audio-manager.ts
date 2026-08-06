import { Howl, Howler } from 'howler';

export type AudioCueId =
  | 'battle_start'
  | 'battle_loop'
  | 'victory'
  | 'unit_spawn'
  | 'unit_attack'
  | 'unit_attack_melee'
  | 'unit_attack_ranged'
  | 'unit_die'
  | 'base_attack'
  | 'base_hit'
  | 'base_destroy';

type SoundKey = AudioCueId | string;

/** mp3 first — Vite SPA returns HTML 200 for missing .ogg, which Howler would pick. */
function audioSrc(base: string): string[] {
  return [`${base}.mp3`, `${base}.ogg`];
}

const AUDIO_MANIFEST: Record<
  AudioCueId,
  { src: string[]; loop?: boolean; category: 'music' | 'sfx' }
> = {
  battle_start: {
    src: audioSrc('/audio/music/battle_start'),
    category: 'music',
  },
  battle_loop: {
    src: audioSrc('/audio/music/battle_loop'),
    loop: true,
    category: 'music',
  },
  victory: {
    src: audioSrc('/audio/music/victory'),
    category: 'music',
  },
  unit_spawn: {
    src: audioSrc('/audio/sfx/unit_spawn'),
    category: 'sfx',
  },
  unit_attack: {
    src: audioSrc('/audio/sfx/unit_attack'),
    category: 'sfx',
  },
  unit_attack_melee: {
    src: audioSrc('/audio/sfx/unit_attack_melee'),
    category: 'sfx',
  },
  unit_attack_ranged: {
    src: audioSrc('/audio/sfx/unit_attack_ranged'),
    category: 'sfx',
  },
  unit_die: {
    src: audioSrc('/audio/sfx/unit_die'),
    category: 'sfx',
  },
  base_attack: {
    src: audioSrc('/audio/sfx/base_attack'),
    category: 'sfx',
  },
  base_hit: {
    src: audioSrc('/audio/sfx/base_hit'),
    category: 'sfx',
  },
  base_destroy: {
    src: audioSrc('/audio/sfx/base_destroy'),
    category: 'sfx',
  },
};

const DEFAULT_MUSIC_VOL = 0.35;
const DEFAULT_SFX_VOL = 0.7;

/** Normalize spriteKey → folder/file slug (cavalry stays cavalry). */
function unitSlug(spriteKey: string | undefined | null): string {
  return String(spriteKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

/** Drop SPA HTML fallbacks (Vite returns 200 text/html for missing public files). */
async function resolveExistingSrc(candidates: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (r.ok && !ct.includes('text/html') && !ct.startsWith('text/')) {
        out.push(url);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

export class AudioManager {
  private sounds = new Map<SoundKey, Howl>();
  private ready = new Set<SoundKey>();
  private failed = new Set<SoundKey>();
  private loading = new Map<SoundKey, Promise<boolean>>();
  private unlocked = false;
  private musicVol = DEFAULT_MUSIC_VOL;
  private sfxVol = DEFAULT_SFX_VOL;
  private currentMusic: AudioCueId | null = null;
  private throttleUntil = new Map<string, number>();
  private initPromise: Promise<void> | null = null;

  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.loadManifest();
    return this.initPromise;
  }

  private loadManifest(): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const [id, meta] of Object.entries(AUDIO_MANIFEST) as Array<
      [AudioCueId, (typeof AUDIO_MANIFEST)[AudioCueId]]
    >) {
      jobs.push(
        this.loadHowl(id, meta.src, !!meta.loop, meta.category).then(
          () => undefined,
        ),
      );
    }
    return Promise.all(jobs).then(() => undefined);
  }

  private loadHowl(
    id: SoundKey,
    src: string[],
    loop: boolean,
    category: 'music' | 'sfx',
  ): Promise<boolean> {
    if (this.ready.has(id)) return Promise.resolve(true);
    if (this.failed.has(id)) return Promise.resolve(false);
    const pending = this.loading.get(id);
    if (pending) return pending;

    const job = (async () => {
      const existing = await resolveExistingSrc(src);
      if (!existing.length) {
        console.warn(`[audio] skip ${id}: no file`);
        this.failed.add(id);
        this.loading.delete(id);
        return false;
      }

      return await new Promise<boolean>((resolve) => {
        const howl = new Howl({
          src: existing,
          loop,
          volume: category === 'music' ? this.musicVol : this.sfxVol,
          preload: true,
          html5: category === 'music',
          onload: () => {
            this.ready.add(id);
            this.loading.delete(id);
            resolve(true);
          },
          onloaderror: (_sid, err) => {
            console.warn(`[audio] skip ${id}:`, err);
            this.failed.add(id);
            this.loading.delete(id);
            resolve(false);
          },
        });
        this.sounds.set(id, howl);
      });
    })();

    this.loading.set(id, job);
    return job;
  }

  /** Per-unit: /audio/sfx/units/{spriteKey}_attack.mp3 */
  private unitAttackKey(slug: string): SoundKey {
    return `unit:${slug}:attack`;
  }

  /** Per-unit: /audio/sfx/units/{spriteKey}_die.mp3 */
  private unitDieKey(slug: string): SoundKey {
    return `unit:${slug}:die`;
  }

  /** Per-unit: /audio/sfx/units/{spriteKey}_spawn.mp3 */
  private unitSpawnKey(slug: string): SoundKey {
    return `unit:${slug}:spawn`;
  }

  private ensureUnitSfx(
    slug: string,
    action: 'attack' | 'die' | 'spawn',
  ): Promise<boolean> {
    if (!slug) return Promise.resolve(false);
    const id =
      action === 'attack'
        ? this.unitAttackKey(slug)
        : action === 'die'
          ? this.unitDieKey(slug)
          : this.unitSpawnKey(slug);
    if (this.ready.has(id)) return Promise.resolve(true);
    if (this.failed.has(id)) return Promise.resolve(false);
    const base = `/audio/sfx/units/${slug}_${action}`;
    return this.loadHowl(id, audioSrc(base), false, 'sfx');
  }

  /** Call after a user gesture (or OBS source activation) to unlock autoplay. */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;

    const resume = Howler.ctx?.resume?.();
    if (resume && typeof (resume as Promise<void>).then === 'function') {
      void (resume as Promise<void>).catch(() => undefined);
    }

    for (const id of this.ready) {
      const s = this.sounds.get(id);
      if (!s) continue;
      const prev = s.volume();
      s.volume(0);
      const sid = s.play();
      s.once('play', () => {
        s.stop(sid);
        s.volume(prev);
      });
      break;
    }

    document.getElementById('audio-unlock-hint')?.remove();
  }

  isUnlocked() {
    return this.unlocked;
  }

  setMusicVolume(v: number) {
    this.musicVol = Math.max(0, Math.min(1, v));
    for (const [id, meta] of Object.entries(AUDIO_MANIFEST) as Array<
      [AudioCueId, (typeof AUDIO_MANIFEST)[AudioCueId]]
    >) {
      if (meta.category !== 'music') continue;
      this.sounds.get(id)?.volume(this.musicVol);
    }
  }

  setSfxVolume(v: number) {
    this.sfxVol = Math.max(0, Math.min(1, v));
    for (const [key, howl] of this.sounds) {
      if (key in AUDIO_MANIFEST) {
        const meta = AUDIO_MANIFEST[key as AudioCueId];
        if (meta?.category === 'music') continue;
      }
      if (typeof key === 'string' && key.startsWith('unit:')) {
        howl.volume(this.sfxVol);
        continue;
      }
      if (key in AUDIO_MANIFEST) howl.volume(this.sfxVol);
    }
  }

  play(id: SoundKey, throttleMs = 0) {
    if (!this.ready.has(id)) return;
    if (throttleMs > 0) {
      const now = performance.now();
      const until = this.throttleUntil.get(id) ?? 0;
      if (now < until) return;
      this.throttleUntil.set(id, now + throttleMs);
    }
    const s = this.sounds.get(id);
    if (!s) return;
    try {
      void Howler.ctx?.resume?.();
      s.play();
    } catch (e) {
      console.warn(`[audio] play ${id} failed`, e);
    }
  }

  /**
   * Attack SFX priority:
   * 1) sfx/units/{spriteKey}_attack.mp3
   * 2) unit_attack_melee / unit_attack_ranged
   * 3) unit_attack
   */
  playAttack(
    kind: 'melee' | 'ranged' | 'unknown' = 'unknown',
    spriteKey?: string,
  ) {
    const slug = unitSlug(spriteKey);
    const throttleKey = slug ? `atk:${slug}` : `atk:${kind}`;
    const now = performance.now();
    const until = this.throttleUntil.get(throttleKey) ?? 0;
    if (now < until) return;
    this.throttleUntil.set(throttleKey, now + 60);

    const fallback = () => {
      const primary: AudioCueId =
        kind === 'melee'
          ? 'unit_attack_melee'
          : kind === 'ranged'
            ? 'unit_attack_ranged'
            : 'unit_attack';
      if (this.ready.has(primary)) {
        this.play(primary);
        return;
      }
      this.play('unit_attack');
    };

    if (!slug) {
      fallback();
      return;
    }

    void this.ensureUnitSfx(slug, 'attack').then((ok) => {
      if (ok) this.play(this.unitAttackKey(slug));
      else fallback();
    });
  }

  /**
   * Spawn SFX priority:
   * 1) sfx/units/{spriteKey}_spawn.mp3
   * 2) unit_spawn
   */
  playUnitSpawn(spriteKey?: string) {
    const slug = unitSlug(spriteKey);
    const throttleKey = slug ? `spawn:${slug}` : 'spawn:generic';
    const now = performance.now();
    const until = this.throttleUntil.get(throttleKey) ?? 0;
    if (now < until) return;
    this.throttleUntil.set(throttleKey, now + 50);

    if (!slug) {
      this.play('unit_spawn');
      return;
    }

    void this.ensureUnitSfx(slug, 'spawn').then((ok) => {
      if (ok) this.play(this.unitSpawnKey(slug));
      else this.play('unit_spawn');
    });
  }

  /**
   * Death SFX priority:
   * 1) sfx/units/{spriteKey}_die.mp3
   * 2) unit_die
   */
  playUnitDie(spriteKey?: string) {
    const slug = unitSlug(spriteKey);
    const throttleKey = slug ? `die:${slug}` : 'die:generic';
    const now = performance.now();
    const until = this.throttleUntil.get(throttleKey) ?? 0;
    if (now < until) return;
    this.throttleUntil.set(throttleKey, now + 50);

    if (!slug) {
      this.play('unit_die');
      return;
    }

    void this.ensureUnitSfx(slug, 'die').then((ok) => {
      if (ok) this.play(this.unitDieKey(slug));
      else this.play('unit_die');
    });
  }

  playMusic(id: AudioCueId) {
    if (!this.ready.has(id)) return;
    if (this.currentMusic === id) {
      const cur = this.sounds.get(id);
      if (cur && !cur.playing()) cur.play();
      return;
    }
    this.stopMusic();
    const s = this.sounds.get(id);
    if (!s) return;
    try {
      void Howler.ctx?.resume?.();
      s.volume(this.musicVol);
      s.play();
      this.currentMusic = id;
    } catch (e) {
      console.warn(`[audio] music ${id} failed`, e);
    }
  }

  stopMusic(fadeMs = 400) {
    if (!this.currentMusic) return;
    const id = this.currentMusic;
    this.currentMusic = null;
    const s = this.sounds.get(id);
    if (!s || !s.playing()) return;
    if (fadeMs <= 0) {
      s.stop();
      return;
    }
    s.fade(s.volume(), 0, fadeMs);
    s.once('fade', () => {
      s.stop();
      s.volume(this.musicVol);
    });
  }

  onBattleStart() {
    this.unlock();
    this.play('battle_start');
    this.playMusic('battle_loop');
  }

  onBattleEnd(playVictory = true) {
    this.stopMusic(300);
    if (playVictory) this.play('victory');
  }

  onIntermission() {
    this.stopMusic(500);
  }
}
