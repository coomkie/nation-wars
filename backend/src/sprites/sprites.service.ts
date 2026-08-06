import { Injectable, OnModuleInit } from '@nestjs/common';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export type DirKey = 'east' | 'west' | 'north' | 'south';

export type ClipMap = Partial<Record<DirKey, string[]>>;

export interface SpriteClips {
  idle: ClipMap;
  running: ClipMap;
  attack: ClipMap;
  dead: ClipMap;
  crash?: ClipMap;
  damaging?: ClipMap;
}

export interface SpriteCatalog {
  /** logical spriteKey → on-disk folder name */
  folders: Record<string, string>;
  clips: Record<string, SpriteClips>;
  /** Flat VFX folders e.g. mage_explosion → frame URLs */
  effects: Record<string, string[]>;
}

const DIR_ALIASES: Record<string, DirKey> = {
  east: 'east',
  west: 'west',
  north: 'north',
  south: 'south',
};

/** Folder typos / aliases → logical key (others map 1:1 by folder name) */
const FOLDER_TO_KEY: Record<string, string> = {
  calvary: 'cavalry',
  cavalry: 'cavalry',
};

/** Flat effect folders (frame_*.png at root of folder) */
const EFFECT_FOLDERS = new Set(['mage_explosion']);

@Injectable()
export class SpritesService implements OnModuleInit {
  private readonly root = join(process.cwd(), '..', 'sprites');
  private catalog: SpriteCatalog = { folders: {}, clips: {}, effects: {} };

  onModuleInit() {
    this.rebuild();
  }

  getRoot() {
    return this.root;
  }

  getCatalog(): SpriteCatalog {
    return this.catalog;
  }

  rebuild(): SpriteCatalog {
    const folders: Record<string, string> = {};
    const clips: Record<string, SpriteClips> = {};
    const effects: Record<string, string[]> = {};

    if (!existsSync(this.root)) {
      this.catalog = { folders, clips, effects };
      return this.catalog;
    }

    for (const entry of readdirSync(this.root)) {
      const abs = join(this.root, entry);
      if (!statSync(abs).isDirectory()) continue;
      if (entry === 'battlefield') continue;

      const lower = entry.toLowerCase();
      if (EFFECT_FOLDERS.has(lower)) {
        const frames = this.scanFlatFrames(entry);
        if (frames.length) effects[lower] = frames;
        continue;
      }

      const key = FOLDER_TO_KEY[lower] ?? lower;
      folders[key] = entry;
      clips[key] = this.scanUnitOrCastle(entry);
    }

    this.catalog = { folders, clips, effects };
    return this.catalog;
  }

  private scanFlatFrames(folder: string): string[] {
    const dir = join(this.root, folder);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => /^frame_\d+\.(png|webp|jpe?g)$/i.test(f))
      .sort((a, b) => this.frameIndex(a) - this.frameIndex(b))
      .map((f) => this.publicUrl(folder, f));
  }

  private scanUnitOrCastle(folder: string): SpriteClips {
    const out: SpriteClips = {
      idle: {},
      running: {},
      attack: {},
      dead: {},
      crash: {},
      damaging: {},
    };

    const idleRot = join(this.root, folder, 'Idle', 'rotations');
    if (existsSync(idleRot)) {
      for (const f of readdirSync(idleRot)) {
        const dir = this.parseDirFromName(f);
        if (!dir) continue;
        if (!/\.(png|webp|jpe?g)$/i.test(f)) continue;
        out.idle[dir] = [this.publicUrl(folder, 'Idle', 'rotations', f)];
      }
    }

    const animRoot = join(this.root, folder, 'Idle', 'animations');
    if (!existsSync(animRoot)) return out;

    for (const animName of readdirSync(animRoot)) {
      const animPath = join(animRoot, animName);
      if (!statSync(animPath).isDirectory()) continue;
      const clipKey = this.animToClip(animName);
      if (!clipKey) continue;

      for (const dirName of readdirSync(animPath)) {
        const dirPath = join(animPath, dirName);
        if (!statSync(dirPath).isDirectory()) continue;
        const dir = DIR_ALIASES[dirName.toLowerCase()];
        if (!dir) continue;
        const frames = readdirSync(dirPath)
          .filter((f) => /^frame_\d+\.(png|webp|jpe?g)$/i.test(f))
          .sort((a, b) => this.frameIndex(a) - this.frameIndex(b))
          .map((f) =>
            this.publicUrl(folder, 'Idle', 'animations', animName, dirName, f),
          );
        if (frames.length) {
          (out[clipKey] as ClipMap)[dir] = frames;
        }
      }
    }

    return out;
  }

  private animToClip(
    name: string,
  ): keyof SpriteClips | null {
    const n = name.toLowerCase();
    if (n === 'running') return 'running';
    if (n === 'attack') return 'attack';
    if (n === 'dead') return 'dead';
    if (n === 'crash') return 'crash';
    if (n === 'damaging') return 'damaging';
    return null;
  }

  private parseDirFromName(filename: string): DirKey | null {
    const base = filename.replace(/\.(png|webp|jpe?g)$/i, '').toLowerCase();
    return DIR_ALIASES[base] ?? null;
  }

  private frameIndex(name: string): number {
    const m = name.match(/frame_(\d+)/i);
    return m ? Number(m[1]) : 0;
  }

  private publicUrl(...parts: string[]): string {
    // Encode each segment for spaces / odd casing paths
    const rel = parts.map((p) => encodeURIComponent(p)).join('/');
    return `/sprites/${rel}`;
  }

  /** Resolve on-disk path for static middleware (decodeURI) */
  resolveDiskPath(urlPath: string): string | null {
    const cleaned = urlPath.replace(/^\/?sprites\/?/, '');
    const disk = join(this.root, ...cleaned.split('/').map(decodeURIComponent));
    const rootResolved = this.root;
    if (!disk.startsWith(rootResolved)) return null;
    return existsSync(disk) ? disk : null;
  }
}
