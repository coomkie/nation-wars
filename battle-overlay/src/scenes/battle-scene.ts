import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  Sprite,
  Assets,
  Texture,
} from 'pixi.js';
import {
  clipForUnitState,
  loadCatalog,
  loadTextures,
  pickDir,
  resolveClipUrls,
} from '../sprites/sprite-runtime';
import type {
  DirKey,
  SpriteCatalogDto,
  UnitClipName,
} from '../sprites/sprite-runtime';
import { AudioManager } from '../audio/audio-manager';

export interface UnitDto {
  id: string;
  username: string;
  displayName: string;
  nationId: string;
  unitTypeId: string;
  unitTypeName: string;
  spriteKey: string;
  totalGiftValue: number;
  hp: number;
  maxHp: number;
  position: { x: number; y: number };
  state: string;
  targetUnitId: string | null;
  spawnedAt: string;
  /** Display size multiplier (default 1) */
  scale?: number;
  attackRange?: 'melee' | 'ranged';
  /** Attacks per second — drives one-shot attack anim duration */
  attackSpeed?: number;
}

export interface BaseDto {
  nationId: string;
  maxHp: number;
  currentHp: number;
}

export interface MatchState {
  id: string;
  nationA: {
    nationId: string;
    units: UnitDto[];
  };
  nationB: {
    nationId: string;
    units: UnitDto[];
  };
  baseA: BaseDto;
  baseB: BaseDto;
  frontline: number;
  startedAt: string | null;
  endsAt: string | null;
  status: string;
  winnerNationId: string | null;
  nextMatchAt?: string | null;
  championNationId?: string | null;
  intermissionSeconds?: number;
  stageBgUrl?: string | null;
  battlefieldBgUrl?: string | null;
  baseAttackRange?: number;
  baseAttackDamage?: number;
  baseAttackSpeed?: number;
}

interface NationMeta {
  id: string;
  name: string;
  flagUrl: string;
}

interface UnitTypeMeta {
  id: string;
  name: string;
  spriteKey: string;
  spriteUrl: string | null;
  scale?: number;
  attackRange?: 'melee' | 'ranged';
  attackSpeed?: number;
}

const COLOR_A = 0x3b82f6;
const COLOR_B = 0xef4444;
/** Display size for unit sprites / placeholders (no tier scaling) */
const UNIT_SIZE = 64;
const BASE_SPRITE_W = 140;
const BASE_SPRITE_H = 180;

type UnitView = {
  root: Container;
  /** Holds body + sprite; scale.x only used for placeholder flip */
  visual: Container;
  body: Graphics;
  sprite: Sprite | null;
  hpBg: Graphics;
  hpFg: Graphics;
  label: Text;
  target: { x: number; y: number };
  data: UnitDto;
  dying: boolean;
  dieMs: number;
  facing: 1 | -1;
  usesDirectional: boolean;
  animClip: UnitClipName | null;
  animDir: DirKey;
  animTextures: Texture[];
  animIndex: number;
  animAcc: number;
  animFps: number;
  animLoop: boolean;
  lastX: number;
  lastY: number;
  /** Mage: explosion already fired for current attack cycle */
  mageBoomFired: boolean;
  /** Attack SFX already fired for current attack anim cycle (impact = last frame) */
  attackSfxFired: boolean;
  /** True while a one-shot attack clip is playing */
  attackPlaying: boolean;
  /** On-death AoE VFX (e.g. bomb_carrior) — fire near end of Dead clip */
  deathBoom: {
    effect: string;
    x: number;
    y: number;
    radius: number;
    fired: boolean;
  } | null;
};

type BaseView = {
  side: 'A' | 'B';
  root: Container;
  sprite: Sprite;
  placeholder: Graphics;
  flag: Sprite;
  hpBg: Graphics;
  hpFg: Graphics;
  dir: DirKey;
  clip: 'idle' | 'crash' | 'damaging';
  textures: Texture[];
  animIndex: number;
  animAcc: number;
  animFps: number;
  animLoop: boolean;
  crashing: boolean;
  /** True while a one-shot damaging clip is still playing */
  damagingBusy: boolean;
};

type ProjectileFx = {
  gfx: Graphics;
  from: { x: number; y: number };
  to: { x: number; y: number };
  age: number;
  duration: number;
  kind: string;
};

type ExplosionFx = {
  sprite: Sprite | null;
  gfx: Graphics | null;
  textures: Texture[];
  animIndex: number;
  animAcc: number;
  animFps: number;
  x: number;
  y: number;
  radius: number;
  age: number;
  duration: number;
};

export class BattleScene {
  readonly container = new Container();
  readonly audio = new AudioManager();
  private readonly apiUrl: string;
  private match: MatchState | null = null;
  private nations = new Map<string, NationMeta>();
  private flagTextures = new Map<string, Texture>();
  private unitTypes = new Map<string, UnitTypeMeta>();
  private unitViews = new Map<string, UnitView>();
  private hud = new Container();
  private mapLayer = new Container();
  private unitsLayer = new Container();
  private effectsLayer = new Container();
  private frontlineGfx = new Graphics();
  private territoryA = new Graphics();
  private territoryB = new Graphics();
  private baseAView: BaseView | null = null;
  private baseBView: BaseView | null = null;
  private spriteCatalog: SpriteCatalogDto | null = null;
  private projectiles: ProjectileFx[] = [];
  private explosions: ExplosionFx[] = [];
  private timerText: Text;
  private nameAText: Text;
  private nameBText: Text;
  private baseAText: Text;
  private baseBText: Text;
  private statusText: Text;
  private killFeedRoot = new Container();
  private killFeedBg = new Graphics();
  private killFeedMask = new Graphics();
  private killFeedLines = new Container();
  private killFeedEntries: Container[] = [];
  private victoryBanner: Text | null = null;
  private confetti: Graphics[] = [];
  private celebrationMs = 0;
  private isTournamentComplete = false;
  private tiktokStatus = 'disconnected';
  private socketStatus = 'connecting';

  private static readonly KILL_FEED_MAX = 40;
  private static readonly KILL_FEED_LINE_H = 24;
  private static readonly KILL_FEED_W = 720;
  private static readonly KILL_FEED_H = 110;
  private static readonly KILL_FEED_PAD = 10;
  private static readonly KILL_FEED_FLAG_W = 20;
  private static readonly KILL_FEED_FLAG_H = 14;
  private static readonly BASE_FLAG_W = 48;
  private static readonly BASE_FLAG_H = 32;

  constructor(_app: Application, apiUrl: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.container.addChild(this.mapLayer);
    this.container.addChild(this.unitsLayer);
    this.container.addChild(this.effectsLayer);
    this.container.addChild(this.hud);

    this.mapLayer.addChild(this.territoryA);
    this.mapLayer.addChild(this.territoryB);
    this.mapLayer.addChild(this.frontlineGfx);
    this.baseAView = this.createBaseView('A');
    this.baseBView = this.createBaseView('B');
    this.mapLayer.addChild(this.baseAView.root, this.baseBView.root);

    const titleStyle = new TextStyle({
      fill: 0xffffff,
      fontSize: 32,
      fontWeight: '700',
      dropShadow: { color: 0x000000, blur: 4, distance: 2 },
    });
    const scoreStyle = new TextStyle({
      fill: 0xffffff,
      fontSize: 40,
      fontWeight: '700',
      dropShadow: { color: 0x000000, blur: 4, distance: 2 },
    });
    const smallStyle = new TextStyle({
      fill: 0xfef3c7,
      fontSize: 18,
      fontWeight: '600',
      dropShadow: { color: 0x000000, blur: 3, distance: 1 },
    });

    this.nameAText = new Text({ text: 'Nation A', style: titleStyle });
    this.nameBText = new Text({ text: 'Nation B', style: titleStyle });
    this.baseAText = new Text({ text: 'Base —', style: smallStyle });
    this.baseBText = new Text({ text: 'Base —', style: smallStyle });
    this.timerText = new Text({ text: '--:--', style: scoreStyle });
    this.statusText = new Text({
      text: '',
      style: new TextStyle({ fill: 0xffffff, fontSize: 16 }),
    });

    this.nameAText.position.set(40, 20);
    this.baseAText.position.set(40, 110);

    this.nameBText.anchor.set(1, 0);
    this.baseBText.anchor.set(1, 0);
    this.nameBText.position.set(1880, 20);
    this.baseBText.position.set(1880, 110);

    this.timerText.anchor.set(0.5, 0);
    this.timerText.position.set(960, 20);
    this.statusText.position.set(40, 1040);

    this.setupKillFeed();

    this.hud.addChild(
      this.nameAText,
      this.nameBText,
      this.baseAText,
      this.baseBText,
      this.timerText,
      this.killFeedRoot,
      this.statusText,
    );

    this.drawMap(0);
    this.drawBases(null);
    this.applyStageAndArenaBg(null);
    this.refreshStatus();
    void this.loadUnitTypes();
    void this.ensureSpriteCatalog();
  }

  private createBaseView(side: 'A' | 'B'): BaseView {
    const root = new Container();
    const placeholder = new Graphics();
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 1);
    sprite.visible = false;
    const flag = new Sprite();
    flag.anchor.set(0.5, 0);
    flag.visible = false;
    flag.width = BattleScene.BASE_FLAG_W;
    flag.height = BattleScene.BASE_FLAG_H;
    // Just below castle footprint (sprite anchored at bottom)
    flag.position.set(0, 10);
    const hpBg = new Graphics();
    const hpFg = new Graphics();
    root.addChild(placeholder, sprite, flag, hpBg, hpFg);
    const x = side === 'A' ? 70 : 1850;
    const y = 580;
    root.position.set(x, y);
    return {
      side,
      root,
      sprite,
      placeholder,
      flag,
      hpBg,
      hpFg,
      dir: side === 'A' ? 'east' : 'west',
      clip: 'idle',
      textures: [],
      animIndex: 0,
      animAcc: 0,
      animFps: 10,
      animLoop: true,
      crashing: false,
      damagingBusy: false,
    };
  }

  private async ensureSpriteCatalog() {
    if (this.spriteCatalog) return;
    this.spriteCatalog = await loadCatalog(this.apiUrl);
    await this.refreshBaseSprites();
  }

  private setupKillFeed() {
    const w = BattleScene.KILL_FEED_W;
    const h = BattleScene.KILL_FEED_H;
    this.killFeedRoot.position.set(960 - w / 2, 72);

    this.killFeedBg
      .roundRect(0, 0, w, h, 8)
      .fill({ color: 0x0f172a, alpha: 0.55 })
      .stroke({ width: 1, color: 0xffffff, alpha: 0.15 });

    this.killFeedMask.rect(0, 0, w, h).fill({ color: 0xffffff });
    // Anchor lines at horizontal center of the panel
    this.killFeedLines.position.set(w / 2, BattleScene.KILL_FEED_PAD);
    this.killFeedLines.mask = this.killFeedMask;

    this.killFeedRoot.addChild(
      this.killFeedBg,
      this.killFeedMask,
      this.killFeedLines,
    );
  }

  private clearKillFeed() {
    for (const row of this.killFeedEntries) row.destroy({ children: true });
    this.killFeedEntries = [];
    this.killFeedLines.removeChildren();
    this.layoutKillFeed();
  }

  private layoutKillFeed() {
    const contentH =
      this.killFeedEntries.length * BattleScene.KILL_FEED_LINE_H;
    const viewH = BattleScene.KILL_FEED_H - BattleScene.KILL_FEED_PAD * 2;
    // Center vertically when short; pin to bottom (newest visible) when overflowing
    if (contentH <= viewH) {
      this.killFeedLines.y =
        BattleScene.KILL_FEED_PAD + (viewH - contentH) / 2;
    } else {
      this.killFeedLines.y =
        BattleScene.KILL_FEED_PAD + (viewH - contentH);
    }
  }

  private makeKillFeedFlag(tex: Texture | null): Container {
    const wrap = new Container();
    const w = BattleScene.KILL_FEED_FLAG_W;
    const h = BattleScene.KILL_FEED_FLAG_H;
    const bg = new Graphics()
      .roundRect(0, 0, w, h, 2)
      .fill({ color: 0x1e293b, alpha: 0.9 })
      .stroke({ width: 1, color: 0xffffff, alpha: 0.25 });
    wrap.addChild(bg);
    if (tex) {
      const spr = new Sprite(tex);
      spr.width = w - 2;
      spr.height = h - 2;
      spr.position.set(1, 1);
      wrap.addChild(spr);
    }
    return wrap;
  }

  /** Shrink text with ellipsis until width <= maxW */
  private fitKillFeedText(label: Text, maxW: number) {
    if (maxW <= 8) {
      label.text = '…';
      return;
    }
    if (label.width <= maxW) return;
    const raw = label.text;
    let lo = 0;
    let hi = raw.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      label.text = `${raw.slice(0, mid)}…`;
      if (label.width <= maxW) lo = mid;
      else hi = mid - 1;
    }
    label.text = lo > 0 ? `${raw.slice(0, lo)}…` : '…';
  }

  private async pushKillFeed(
    killer: string,
    victim: string,
    killerNationId?: string,
    victimNationId?: string,
  ) {
    const [texK, texV] = await Promise.all([
      killerNationId
        ? this.loadFlagTexture(killerNationId)
        : Promise.resolve(null),
      victimNationId
        ? this.loadFlagTexture(victimNationId)
        : Promise.resolve(null),
    ]);

    const style = new TextStyle({
      fill: 0xf8fafc,
      fontSize: 15,
      fontWeight: '600',
      dropShadow: { color: 0x000000, blur: 2, distance: 1 },
    });

    const row = new Container();
    const flagK = this.makeKillFeedFlag(texK);
    const nameK = new Text({ text: killer, style });
    const mid = new Text({ text: ' has slain ', style });
    const flagV = this.makeKillFeedFlag(texV);
    const nameV = new Text({ text: victim, style });

    const gap = 4;
    // Fill almost the full kill-feed frame (pad on each side)
    const maxW = BattleScene.KILL_FEED_W - BattleScene.KILL_FEED_PAD * 2;
    const fixed =
      BattleScene.KILL_FEED_FLAG_W * 2 + gap * 2 + mid.width;
    const nameBudget = Math.max(24, maxW - fixed);
    const half = nameBudget / 2;
    this.fitKillFeedText(nameK, half);
    this.fitKillFeedText(nameV, half);
    // Give unused budget from a short name to the longer one
    const leftoverK = half - nameK.width;
    const leftoverV = half - nameV.width;
    if (leftoverK > 2) {
      nameV.text = victim;
      this.fitKillFeedText(nameV, half + leftoverK);
    } else if (leftoverV > 2) {
      nameK.text = killer;
      this.fitKillFeedText(nameK, half + leftoverV);
    }

    const flagY =
      (BattleScene.KILL_FEED_LINE_H - BattleScene.KILL_FEED_FLAG_H) / 2;
    let x = 0;
    flagK.position.set(x, flagY);
    x += BattleScene.KILL_FEED_FLAG_W + gap;
    nameK.position.set(x, 3);
    x += nameK.width;
    mid.position.set(x, 3);
    x += mid.width;
    flagV.position.set(x, flagY);
    x += BattleScene.KILL_FEED_FLAG_W + gap;
    nameV.position.set(x, 3);
    x += nameV.width;

    row.addChild(flagK, nameK, mid, flagV, nameV);
    row.pivot.x = x / 2;
    const idx = this.killFeedEntries.length;
    row.position.set(0, idx * BattleScene.KILL_FEED_LINE_H);
    this.killFeedLines.addChild(row);
    this.killFeedEntries.push(row);

    while (this.killFeedEntries.length > BattleScene.KILL_FEED_MAX) {
      const old = this.killFeedEntries.shift();
      if (old) {
        this.killFeedLines.removeChild(old);
        old.destroy({ children: true });
      }
      for (let i = 0; i < this.killFeedEntries.length; i++) {
        this.killFeedEntries[i].y = i * BattleScene.KILL_FEED_LINE_H;
      }
    }

    this.layoutKillFeed();
  }

  setConnectionStatus(s: string) {
    this.socketStatus = s;
    this.refreshStatus();
  }

  setTiktokStatus(s: string) {
    this.tiktokStatus = s;
    this.refreshStatus();
  }

  private refreshStatus() {
    const reconnecting =
      this.tiktokStatus === 'reconnecting' || this.socketStatus === 'socket-lost';
    this.statusText.text = reconnecting
      ? 'Reconnecting...'
      : `TikTok: ${this.tiktokStatus} | Overlay: ${this.socketStatus}`;
    this.statusText.alpha = reconnecting ? 1 : 0.5;
  }

  private async loadUnitTypes() {
    try {
      const res = await fetch(`${this.apiUrl}/unit-types`);
      if (!res.ok) return;
      const list = await res.json();
      for (const t of list) {
        this.unitTypes.set(t.id, t);
      }
    } catch {
      /* ignore */
    }
  }

  async onMatchInit(match: MatchState) {
    this.match = match;
    await this.ensureNations(match);
    await this.loadUnitTypes();
    await this.ensureSpriteCatalog();
    this.rebuildUnits(match);
    this.renderHud();
    this.applyStageAndArenaBg(match);
    this.drawMap(match.frontline ?? 0);
    this.drawBases(match);
    await this.refreshBaseSprites();
    await this.refreshBaseFlags();
    if (match.status === 'tournament_complete' && match.championNationId) {
      this.startCelebration(match.championNationId, 30_000, true);
    } else if (match.status === 'active') {
      this.audio.unlock();
      this.audio.playMusic('battle_loop');
    } else if (match.status !== 'ended' && match.status !== 'intermission') {
      this.clearCelebration();
    } else if (match.status === 'intermission' || match.status === 'ended') {
      this.audio.stopMusic(200);
    }
  }

  onMatchUpdate(match: MatchState) {
    this.match = match;
    void this.ensureNations(match).then(() => this.refreshBaseFlags());
    void this.loadUnitTypes().then(() => {
      for (const view of this.unitViews.values()) {
        if (view.usesDirectional) this.applyUnitSpriteSize(view);
      }
    });
    this.syncUnits(match);
    this.renderHud();
    this.applyStageAndArenaBg(match);
    this.drawMap(match.frontline ?? 0);
    this.drawBases(match);
  }

  onMatchStarted(_payload: unknown) {
    this.clearCelebration();
    this.isTournamentComplete = false;
    this.clearKillFeed();
    this.audio.onBattleStart();
  }

  onMatchEnded(payload: {
    winnerNationId: string | null;
    intermissionSeconds?: number;
    championNationId?: string | null;
    tournamentComplete?: boolean;
  }) {
    this.freezeCombatUnits();
    const secs = payload.intermissionSeconds ?? 20;
    if (payload.tournamentComplete && payload.championNationId) {
      this.startCelebration(payload.championNationId, secs * 1000, true);
    } else {
      this.startCelebration(payload.winnerNationId, secs * 1000, false);
    }
  }

  /** Stop attack/chase visuals when the match is over. */
  private freezeCombatUnits() {
    if (this.match) this.match.status = 'ended';
    for (const view of this.unitViews.values()) {
      if (view.dying) continue;
      view.attackPlaying = false;
      view.data.state = 'advancing';
      view.data.targetUnitId = null;
      void this.setUnitAnim(view, 'idle', true);
    }
  }

  onTournamentComplete(payload: { championNationId: string }) {
    this.startCelebration(payload.championNationId, 30_000, true);
  }

  onIntermission(payload: { nextMatchAt: string; intermissionSeconds: number }) {
    if (this.match) {
      this.match.status = 'intermission';
      this.match.nextMatchAt = payload.nextMatchAt;
      this.match.intermissionSeconds = payload.intermissionSeconds;
    }
    this.audio.onIntermission();
  }

  onUnitSpawned(payload: { nationId: string; unit: UnitDto }) {
    this.spawnView(payload.unit);
    this.audio.playUnitSpawn(payload.unit.spriteKey);
  }

  onUnitsMoved(payload: {
    updates: Array<{ unitId: string; position: { x: number; y: number } }>;
  }) {
    for (const u of payload.updates) {
      const view = this.unitViews.get(u.unitId);
      if (!view) continue;
      view.target = { ...u.position };
      view.data.position = { ...u.position };
    }
  }

  onUnitEngaged(payload: { unitId: string; targetUnitId: string }) {
    if (!this.isMatchActive()) return;
    const view = this.unitViews.get(payload.unitId);
    if (!view || view.dying) return;
    view.data.targetUnitId = payload.targetUnitId;
    view.data.state = 'engaging';
    // Hold Running frame 0 between swings (same canvas as Attack — not Idle rotations)
    if (!view.attackPlaying) {
      void this.setCombatHoldAnim(view);
    }
  }

  /** One damage swing from server — play a single attack anim lasting 1/attackSpeed. */
  onUnitAttack(payload: { unitId: string }) {
    if (!this.isMatchActive()) return;
    const view = this.unitViews.get(payload.unitId);
    if (!view || view.dying) return;
    void this.setUnitAnim(view, 'attack', false);
  }

  onUnitState(payload: {
    unitId: string;
    state: string;
    targetUnitId: string | null;
  }) {
    const view = this.unitViews.get(payload.unitId);
    if (!view || view.dying) return;
    view.data.state = payload.state;
    view.data.targetUnitId = payload.targetUnitId;
    if (view.attackPlaying && payload.state !== 'dead') return;
    if (payload.state === 'cocooning') {
      // Anim handled by unit:molted (always emitted on cocoon enter)
      return;
    }
    const want = clipForUnitState(payload.state, payload.state === 'advancing');
    void this.setUnitAnim(view, want, want !== 'dead');
  }

  /** Cocoon sprite swap or form-2 emerge — refresh identity + size + idle/run */
  onUnitMolted(payload: { unit: UnitDto }) {
    const u = payload.unit;
    const view = this.unitViews.get(u.id);
    if (!view || view.dying) return;
    const prevKey = view.data.spriteKey;
    const prevState = view.data.state;
    const nextKey = u.spriteKey;

    // Entering cocoon: play form-1 Cocooning, then swap to cocoon sheet (or hold)
    if (u.state === 'cocooning') {
      view.data = {
        ...view.data,
        ...u,
        spriteKey: prevKey, // keep form-1 until Cocooning ends
      };
      this.redrawHp(view);
      const swapTo = nextKey !== prevKey ? nextKey : undefined;
      // Phase-2 SFX: cicada_cocoon_spawn.mp3
      this.audio.playUnitSpawn(swapTo || 'cicada_cocoon');
      void this.playCocoonEnter(view, swapTo);
      return;
    }

    view.data = { ...view.data, ...u };
    this.redrawHp(view);
    this.redrawBody(view);

    // Cocoon → form2: play Revive on old (cocoon) sheet, then bootstrap form2
    if (
      prevState === 'cocooning' &&
      u.state === 'advancing' &&
      prevKey !== nextKey
    ) {
      // Phase-3 SFX: cicada_form2_spawn.mp3
      this.audio.playUnitSpawn(nextKey || 'cicada_form2');
      void this.playReviveThenForm2(view, prevKey);
      return;
    }

    if (prevKey !== nextKey) {
      view.usesDirectional = false;
      view.animClip = null;
      view.animTextures = [];
      if (view.sprite) {
        view.sprite.destroy();
        view.sprite = null;
      }
      view.body.visible = true;
      void this.bootstrapUnitAnim(view);
    } else {
      const want = clipForUnitState(u.state, u.state === 'advancing');
      void this.setUnitAnim(view, want, want !== 'dead');
    }
  }

  private async playCocoonEnter(view: UnitView, swapToKey?: string) {
    await this.ensureSpriteCatalog();
    const dir = pickDir(view.facing, 0, 0);
    const key = view.data.spriteKey || 'cicada';
    let urls = resolveClipUrls(this.spriteCatalog, key, 'cocooning', dir);
    let textures = await loadTextures(this.apiUrl, urls);
    if (!textures.length) {
      urls = resolveClipUrls(this.spriteCatalog, key, 'idle', dir);
      textures = await loadTextures(this.apiUrl, urls);
      if (textures.length) {
        this.applyUnitTextures(view, 'idle', dir, textures, 1, true);
      }
      if (swapToKey) this.swapSpriteKey(view, swapToKey, 'idle');
      return;
    }
    this.applyUnitTextures(view, 'cocooning', dir, textures, 10, false);
    const durationMs = (textures.length / 10) * 1000;
    setTimeout(() => {
      if (view.data.state !== 'cocooning' || view.dying) return;
      if (swapToKey) {
        this.swapSpriteKey(view, swapToKey, 'dead');
        return;
      }
      // Same sheet: hold Dead if present, else idle
      void this.holdCocoonPose(view, key, dir);
    }, durationMs);
  }

  private async holdCocoonPose(view: UnitView, key: string, dir: DirKey) {
    const holdDead = resolveClipUrls(this.spriteCatalog, key, 'dead', dir);
    const holdIdle = resolveClipUrls(this.spriteCatalog, key, 'idle', dir);
    const holdUrls = holdDead.length ? holdDead : holdIdle;
    const holdTex = await loadTextures(this.apiUrl, holdUrls);
    if (!holdTex.length || view.data.state !== 'cocooning') return;
    // Static last frame — looping Dead makes the shell look like it scales/pulses
    const still = [holdTex[holdTex.length - 1]];
    this.applyUnitTextures(
      view,
      holdDead.length ? 'dead' : 'idle',
      dir,
      still,
      1,
      true,
    );
  }

  private swapSpriteKey(
    view: UnitView,
    newKey: string,
    preferClip: UnitClipName,
  ) {
    view.data.spriteKey = newKey;
    view.usesDirectional = false;
    view.animClip = null;
    view.animTextures = [];
    if (view.sprite) {
      view.sprite.destroy();
      view.sprite = null;
    }
    view.body.visible = true;
    void (async () => {
      await this.ensureSpriteCatalog();
      const dir = pickDir(view.facing, 0, 0);
      let urls = resolveClipUrls(this.spriteCatalog, newKey, preferClip, dir);
      if (!urls.length) {
        urls = resolveClipUrls(this.spriteCatalog, newKey, 'idle', dir);
      }
      const textures = await loadTextures(this.apiUrl, urls);
      if (textures.length) {
        const still = [textures[textures.length - 1]];
        this.applyUnitTextures(
          view,
          preferClip === 'dead' && urls.length ? 'dead' : 'idle',
          dir,
          still,
          1,
          true,
        );
      } else {
        void this.bootstrapUnitAnim(view);
      }
    })();
  }

  private async playReviveThenForm2(view: UnitView, cocoonKey: string) {
    await this.ensureSpriteCatalog();
    const dir = pickDir(view.facing, 0, 0);
    const urls = resolveClipUrls(this.spriteCatalog, cocoonKey, 'revive', dir);
    const textures = await loadTextures(this.apiUrl, urls);
    if (!textures.length) {
      void this.bootstrapUnitAnim(view);
      return;
    }
    // Temporarily show cocoon key for revive frames
    const form2Key = view.data.spriteKey;
    view.data.spriteKey = cocoonKey;
    view.usesDirectional = false;
    if (view.sprite) {
      view.sprite.destroy();
      view.sprite = null;
    }
    this.applyUnitTextures(view, 'revive', dir, textures, 10, false);
    const durationMs = (textures.length / 10) * 1000;
    setTimeout(() => {
      if (view.dying) return;
      view.data.spriteKey = form2Key;
      view.usesDirectional = false;
      view.animClip = null;
      view.animTextures = [];
      if (view.sprite) {
        view.sprite.destroy();
        view.sprite = null;
      }
      view.body.visible = true;
      void this.bootstrapUnitAnim(view);
    }, durationMs);
  }

  onUnitDamaged(payload: { unitId: string; hp: number; maxHp: number }) {
    const view = this.unitViews.get(payload.unitId);
    if (!view) return;
    view.data.hp = payload.hp;
    view.data.maxHp = payload.maxHp;
    this.redrawHp(view);
  }

  onUnitDied(payload: {
    unitId: string;
    nationId: string;
    victimUsername?: string;
    victimDisplayName?: string;
    killerUnitId?: string;
    killerUsername?: string;
    killerDisplayName?: string;
    killerNationId?: string;
    spriteKey?: string;
    onDeathAoe?: boolean;
  }) {
    const view = this.unitViews.get(payload.unitId);
    if (view) {
      view.data.state = 'dead';
      view.dying = true;
      const frames = view.animTextures.length || 6;
      view.dieMs = Math.max(700, (frames / 10) * 1000 + 200);
      void this.setUnitAnim(view, 'dead', false);
      // Fallback if fx:explosion is delayed/missing
      if (payload.onDeathAoe && !view.deathBoom) {
        const key = payload.spriteKey || view.data.spriteKey;
        if (key) {
          view.deathBoom = {
            effect: `${key}_explosion`,
            x: view.root.x,
            y: view.root.y,
            radius: UNIT_SIZE,
            fired: false,
          };
        }
      }
    }
    this.audio.playUnitDie(view?.data.spriteKey ?? payload.spriteKey);

    // Stop attackers that were fighting this victim (attack loop bug)
    for (const other of this.unitViews.values()) {
      if (other.dying) continue;
      const isKiller = payload.killerUnitId && other.data.id === payload.killerUnitId;
      const wasTargeting = other.data.targetUnitId === payload.unitId;
      if (isKiller || wasTargeting) {
        other.data.targetUnitId = null;
        if (other.data.state === 'engaging') {
          other.data.state = 'advancing';
          void this.setUnitAnim(other, 'running', true);
        }
      }
    }

    const killer =
      payload.killerDisplayName ||
      payload.killerUsername ||
      this.unitViews.get(payload.killerUnitId ?? '')?.data.displayName;
    const victim =
      payload.victimDisplayName ||
      payload.victimUsername ||
      view?.data.displayName;
    if (killer && victim) {
      void this.pushKillFeed(
        killer,
        victim,
        payload.killerNationId,
        payload.nationId,
      );
    }
  }

  onBaseDamaged(payload: {
    nationId: string;
    currentHp: number;
    maxHp: number;
  }) {
    if (!this.match) return;
    if (this.match.baseA.nationId === payload.nationId) {
      this.match.baseA.currentHp = payload.currentHp;
      this.match.baseA.maxHp = payload.maxHp;
      void this.triggerBaseDamaging(this.baseAView);
    } else {
      this.match.baseB.currentHp = payload.currentHp;
      this.match.baseB.maxHp = payload.maxHp;
      void this.triggerBaseDamaging(this.baseBView);
    }
    this.renderHud();
    this.drawBases(this.match);
    this.drawMap(this.match.frontline ?? 0);
    this.audio.play('base_hit', 120);
  }

  onProjectile(payload: {
    id: string;
    kind: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    durationMs: number;
  }) {
    if (payload.kind === 'base') {
      this.audio.play('base_attack', 80);
    }
    const gfx = new Graphics();
    this.effectsLayer.addChild(gfx);
    this.projectiles.push({
      gfx,
      from: { ...payload.from },
      to: { ...payload.to },
      age: 0,
      duration: Math.max(80, payload.durationMs || 280),
      kind: payload.kind,
    });
  }

  onExplosion(payload: {
    x: number;
    y: number;
    radius: number;
    effect?: string;
  }) {
    const effect = payload.effect?.trim() || '';
    if (!effect) return;

    // Attach to nearest dying unit so VFX syncs with Dead anim (~70%).
    let best: UnitView | null = null;
    let bestDist = 48;
    for (const view of this.unitViews.values()) {
      if (!view.dying) continue;
      const d = Math.hypot(view.root.x - payload.x, view.root.y - payload.y);
      if (d < bestDist) {
        bestDist = d;
        best = view;
      }
    }
    if (best) {
      best.deathBoom = {
        effect,
        x: payload.x,
        y: payload.y,
        radius: payload.radius,
        fired: best.deathBoom?.fired ?? false,
      };
      return;
    }
    // No dying unit nearby (edge case) — play immediately
    this.audio.playEffectSfx(effect);
    void this.spawnCatalogExplosion(
      payload.x,
      payload.y,
      payload.radius,
      effect,
    );
  }

  onBaseDestroyed(payload: { nationId: string }) {
    if (!this.match) return;
    const view =
      this.match.baseA.nationId === payload.nationId
        ? this.baseAView
        : this.baseBView;
    void this.playBaseClip(view, 'crash', false);
    this.audio.play('base_destroy');
    const winner =
      this.match.nationA.nationId === payload.nationId
        ? this.match.nationB.nationId
        : this.match.nationA.nationId;
    this.startCelebration(winner, 20_000, false);
  }

  tick(deltaMs: number) {
    this.updateTimer();
    const t = Math.min(1, deltaMs / 80);
    for (const [id, view] of this.unitViews) {
      const prevX = view.root.x;
      const prevY = view.root.y;

      if (view.dying) {
        this.advanceUnitAnim(view, deltaMs);
        view.dieMs -= deltaMs;
        if (view.animClip !== 'dead' || view.animTextures.length === 0) {
          view.root.alpha = Math.max(0, view.dieMs / 600);
        }
        if (view.dieMs <= 0) {
          // Ensure death boom still plays if Dead clip was short/missing
          if (view.deathBoom && !view.deathBoom.fired) {
            view.deathBoom.fired = true;
            this.audio.playEffectSfx(view.deathBoom.effect);
            void this.spawnCatalogExplosion(
              view.deathBoom.x,
              view.deathBoom.y,
              view.deathBoom.radius,
              view.deathBoom.effect,
            );
          }
          view.root.destroy();
          this.unitViews.delete(id);
        }
        continue;
      }

      view.root.x += (view.target.x - view.root.x) * t;
      view.root.y += (view.target.y - view.root.y) * t;
      const vx = view.root.x - prevX;
      const vy = view.root.y - prevY;
      view.lastX = view.root.x;
      view.lastY = view.root.y;
      this.applyFacing(view, vx, vy);
      const moving = Math.hypot(vx, vy) > 0.15;
      const matchActive = this.isMatchActive();
      if (!view.attackPlaying) {
        const want = matchActive
          ? clipForUnitState(view.data.state, moving)
          : 'idle';
        const combatHold =
          matchActive &&
          !moving &&
          (view.data.state === 'engaging' ||
            view.data.state === 'attacking_base');
        if (combatHold) {
          // Keep a single Running frame — Idle/rotations often use a larger
          // canvas with more padding, which looks like a sudden scale-down.
          const dir = pickDir(view.facing, vx, vy);
          if (
            view.animClip !== 'running' ||
            view.animTextures.length !== 1 ||
            dir !== view.animDir
          ) {
            void this.setCombatHoldAnim(view, dir);
          }
        } else if (want !== view.animClip) {
          void this.setUnitAnim(view, want, want !== 'dead');
        } else if (view.usesDirectional && matchActive) {
          const dir = pickDir(view.facing, vx, vy);
          if (dir !== view.animDir) void this.setUnitAnim(view, want, true, dir);
        }
      }
      this.advanceUnitAnim(view, deltaMs);
    }

    this.tickBaseView(this.baseAView, deltaMs);
    this.tickBaseView(this.baseBView, deltaMs);
    this.tickProjectiles(deltaMs);
    this.tickExplosions(deltaMs);

    if (this.celebrationMs > 0) {
      this.celebrationMs -= deltaMs;
      for (const c of this.confetti) {
        c.y += (c as any)._vy * (deltaMs / 16);
        c.rotation += 0.05;
        if (c.y > 1100) c.y = -20;
      }
      if (this.celebrationMs <= 0 && !this.isTournamentComplete) {
        this.clearCelebration();
      }
    }
  }

  private updateTimer() {
    if (this.match?.status === 'intermission' && this.match.nextMatchAt) {
      const remaining = Math.max(
        0,
        new Date(this.match.nextMatchAt).getTime() - Date.now(),
      );
      this.timerText.text = `NEXT ${String(Math.ceil(remaining / 1000)).padStart(2, '0')}s`;
      return;
    }
    if (this.match?.status === 'tournament_complete') {
      this.timerText.text = 'CHAMPION';
      return;
    }
    if (!this.match?.endsAt || this.match.status !== 'active') {
      if (this.match?.status === 'idle') this.timerText.text = 'WAITING';
      if (this.match?.status === 'ended') this.timerText.text = 'ENDED';
      return;
    }
    const remaining = Math.max(
      0,
      new Date(this.match.endsAt).getTime() - Date.now(),
    );
    const sec = Math.floor(remaining / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    this.timerText.text = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  private async ensureNations(match: MatchState) {
    for (const id of [match.nationA.nationId, match.nationB.nationId].filter(
      Boolean,
    )) {
      if (this.nations.has(id)) continue;
      try {
        const res = await fetch(`${this.apiUrl}/nations/${id}`);
        if (res.ok) {
          const n = await res.json();
          this.nations.set(id, {
            id: n.id,
            name: n.name,
            flagUrl: n.flagUrl?.startsWith('http')
              ? n.flagUrl
              : `${this.apiUrl}${n.flagUrl}`,
          });
        }
      } catch {
        this.nations.set(id, { id, name: id.slice(0, 8), flagUrl: '' });
      }
    }
  }

  private async loadFlagTexture(nationId: string): Promise<Texture | null> {
    if (!nationId) return null;
    const cached = this.flagTextures.get(nationId);
    if (cached) return cached;
    const meta = this.nations.get(nationId);
    if (!meta?.flagUrl) {
      // Nation meta may not be loaded yet
      try {
        const res = await fetch(`${this.apiUrl}/nations/${nationId}`);
        if (res.ok) {
          const n = await res.json();
          this.nations.set(nationId, {
            id: n.id,
            name: n.name,
            flagUrl: n.flagUrl?.startsWith('http')
              ? n.flagUrl
              : `${this.apiUrl}${n.flagUrl}`,
          });
        }
      } catch {
        return null;
      }
    }
    const url = this.nations.get(nationId)?.flagUrl;
    if (!url) return null;
    try {
      const tex = (await Assets.load(url)) as Texture;
      this.flagTextures.set(nationId, tex);
      return tex;
    } catch {
      return null;
    }
  }

  private async refreshBaseFlags() {
    if (!this.match) {
      for (const view of [this.baseAView, this.baseBView]) {
        if (view) view.flag.visible = false;
      }
      return;
    }
    const pairs: Array<{ view: BaseView | null; nationId: string }> = [
      { view: this.baseAView, nationId: this.match.baseA?.nationId },
      { view: this.baseBView, nationId: this.match.baseB?.nationId },
    ];
    for (const { view, nationId } of pairs) {
      if (!view) continue;
      if (!nationId) {
        view.flag.visible = false;
        continue;
      }
      const tex = await this.loadFlagTexture(nationId);
      if (!tex) {
        view.flag.visible = false;
        continue;
      }
      view.flag.texture = tex;
      view.flag.width = BattleScene.BASE_FLAG_W;
      view.flag.height = BattleScene.BASE_FLAG_H;
      view.flag.visible = true;
    }
  }

  private renderHud() {
    if (!this.match) return;
    const a = this.nations.get(this.match.nationA.nationId);
    const b = this.nations.get(this.match.nationB.nationId);
    this.nameAText.text = a?.name ?? 'Nation A';
    this.nameBText.text = b?.name ?? 'Nation B';
    if (this.match.baseA) {
      this.baseAText.text = `Base ${Math.ceil(this.match.baseA.currentHp)}/${this.match.baseA.maxHp}`;
    }
    if (this.match.baseB) {
      this.baseBText.text = `Base ${Math.ceil(this.match.baseB.currentHp)}/${this.match.baseB.maxHp}`;
    }
  }

  private drawMap(frontline: number) {
    const mid = 960 + (frontline / 100) * 700;
    this.territoryA.clear();
    this.territoryB.clear();
    this.frontlineGfx.clear();
    // Default blue/red when no arena image; soft tint when arena photo is set
    const tintAlpha = this.match?.battlefieldBgUrl ? 0.12 : 0.28;
    this.territoryA
      .rect(0, 200, mid, 680)
      .fill({ color: COLOR_A, alpha: tintAlpha });
    this.territoryB
      .rect(mid, 200, 1920 - mid, 680)
      .fill({ color: COLOR_B, alpha: tintAlpha });
    this.frontlineGfx
      .moveTo(mid, 200)
      .lineTo(mid, 880)
      .stroke({ width: 5, color: 0xffffff, alpha: 0.85 });

    this.frontlineGfx
      .rect(260, 920, 1400, 22)
      .fill({ color: 0x111827, alpha: 0.65 });
    const barMid = 260 + ((frontline + 100) / 200) * 1400;
    this.frontlineGfx
      .rect(260, 920, barMid - 260, 22)
      .fill({ color: COLOR_A, alpha: 0.9 });
    this.frontlineGfx
      .rect(barMid, 920, 260 + 1400 - barMid, 22)
      .fill({ color: COLOR_B, alpha: 0.9 });
  }

  private applyStageAndArenaBg(match: MatchState | null | undefined) {
    const stageUrl = match?.stageBgUrl;
    const arenaUrl = match?.battlefieldBgUrl;

    const stageImg = document.getElementById(
      'stage-bg-img',
    ) as HTMLImageElement | null;
    if (stageImg) {
      if (!stageUrl) {
        stageImg.removeAttribute('src');
        stageImg.style.display = 'none';
      } else {
        const full = stageUrl.startsWith('http')
          ? stageUrl
          : `${this.apiUrl}${stageUrl}`;
        if (stageImg.getAttribute('src') !== full) stageImg.src = full;
        stageImg.style.display = 'block';
      }
    }

    const arenaImg = document.getElementById(
      'arena-bg',
    ) as HTMLImageElement | null;
    if (arenaImg) {
      if (!arenaUrl) {
        arenaImg.removeAttribute('src');
        arenaImg.style.display = 'none';
      } else {
        const full = arenaUrl.startsWith('http')
          ? arenaUrl
          : `${this.apiUrl}${arenaUrl}`;
        if (arenaImg.getAttribute('src') !== full) arenaImg.src = full;
        arenaImg.style.display = 'block';
      }
    }
  }

  private drawBases(match: MatchState | null) {
    for (const view of [this.baseAView, this.baseBView]) {
      if (!view) continue;
      const base =
        view.side === 'A' ? match?.baseA : match?.baseB;
      const color = view.side === 'A' ? COLOR_A : COLOR_B;
      view.placeholder.clear();
      if (!view.sprite.visible) {
        view.placeholder
          .roundRect(-50, -160, 100, 160, 10)
          .fill({ color, alpha: 0.85 });
      }
      view.hpBg.clear();
      view.hpFg.clear();
      if (base && base.maxHp > 0) {
        const pct = Math.max(0, base.currentHp / base.maxHp);
        view.hpBg.rect(-40, -180, 80, 10).fill({ color: 0x111827 });
        view.hpFg.rect(-40, -180, 80 * pct, 10).fill({ color: 0x4ade80 });
      }
    }
  }

  private async refreshBaseSprites() {
    await this.playBaseClip(this.baseAView, 'idle', true);
    await this.playBaseClip(this.baseBView, 'idle', true);
    this.drawBases(this.match);
  }

  private async triggerBaseDamaging(view: BaseView | null) {
    if (!view || view.crashing) return;
    // Don't restart mid-clip — prevents stutter when many units hit the base
    if (view.damagingBusy || view.clip === 'damaging') return;
    await this.playBaseClip(view, 'damaging', false);
  }

  private async playBaseClip(
    view: BaseView | null,
    clip: 'idle' | 'crash' | 'damaging',
    loop: boolean,
  ) {
    if (!view) return;
    if (view.crashing && clip !== 'crash') return;
    const urls = resolveClipUrls(
      this.spriteCatalog,
      'castle',
      clip,
      view.dir,
    );
    const textures = await loadTextures(this.apiUrl, urls);
    if (!textures.length) {
      if (clip === 'idle') {
        view.sprite.visible = false;
        view.placeholder.visible = true;
      }
      view.damagingBusy = false;
      return;
    }
    // Race: a newer crash should win; ignore stale idle after crash started
    if (view.crashing && clip !== 'crash') return;

    view.clip = clip;
    view.textures = textures;
    view.animIndex = 0;
    view.animAcc = 0;
    view.animFps = clip === 'crash' ? 12 : clip === 'damaging' ? 14 : 1;
    view.animLoop = loop;
    view.crashing = clip === 'crash';
    view.damagingBusy = clip === 'damaging';
    view.sprite.texture = textures[0];
    view.sprite.width = BASE_SPRITE_W;
    view.sprite.height = BASE_SPRITE_H;
    view.sprite.visible = true;
    view.placeholder.visible = false;
  }

  private tickBaseView(view: BaseView | null, deltaMs: number) {
    if (!view || view.textures.length === 0) return;
    if (view.textures.length === 1) {
      view.sprite.texture = view.textures[0];
      if (view.clip === 'damaging' && view.damagingBusy && !view.animLoop) {
        // Single-frame damaging still needs a short hold then return idle
        view.animAcc += deltaMs;
        if (view.animAcc >= 180) {
          view.damagingBusy = false;
          void this.playBaseClip(view, 'idle', true);
        }
      }
      return;
    }
    view.animAcc += deltaMs;
    const frameMs = 1000 / Math.max(1, view.animFps);
    while (view.animAcc >= frameMs) {
      view.animAcc -= frameMs;
      if (view.animIndex < view.textures.length - 1) {
        view.animIndex++;
        view.sprite.texture = view.textures[view.animIndex];
      } else if (view.animLoop) {
        view.animIndex = 0;
        view.sprite.texture = view.textures[0];
      } else if (view.clip === 'damaging' && !view.crashing) {
        view.damagingBusy = false;
        void this.playBaseClip(view, 'idle', true);
        return;
      } else {
        break;
      }
    }
  }

  private tickProjectiles(deltaMs: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += deltaMs;
      const t = Math.min(1, p.age / p.duration);
      const x = p.from.x + (p.to.x - p.from.x) * t;
      const y = p.from.y + (p.to.y - p.from.y) * t;
      const ang = Math.atan2(p.to.y - p.from.y, p.to.x - p.from.x);
      p.gfx.clear();
      const color = p.kind === 'base' ? 0xfbbf24 : 0xe2e8f0;
      p.gfx
        .moveTo(-10, 0)
        .lineTo(10, 0)
        .stroke({ width: 3, color, alpha: 0.95 });
      p.gfx.position.set(x, y);
      p.gfx.rotation = ang;
      if (t >= 1) {
        p.gfx.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private tickExplosions(deltaMs: number) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.age += deltaMs;

      if (e.sprite && e.textures.length) {
        e.animAcc += deltaMs;
        const frameMs = 1000 / Math.max(1, e.animFps);
        while (e.animAcc >= frameMs) {
          e.animAcc -= frameMs;
          if (e.animIndex < e.textures.length - 1) {
            e.animIndex++;
            e.sprite.texture = e.textures[e.animIndex];
          } else {
            e.sprite.destroy();
            this.explosions.splice(i, 1);
            break;
          }
        }
        continue;
      }

      if (e.gfx) {
        // Legacy procedural rings no longer spawned; clean up any leftover
        e.gfx.destroy();
        this.explosions.splice(i, 1);
      }
    }
  }

  private rebuildUnits(match: MatchState) {
    for (const v of this.unitViews.values()) v.root.destroy();
    this.unitViews.clear();
    this.unitsLayer.removeChildren();
    for (const u of match.nationA?.units ?? []) this.spawnView(u);
    for (const u of match.nationB?.units ?? []) this.spawnView(u);
  }

  private syncUnits(match: MatchState) {
    const all = [...(match.nationA?.units ?? []), ...(match.nationB?.units ?? [])];
    const ids = new Set(all.map((u) => u.id));
    for (const u of all) {
      const existing = this.unitViews.get(u.id);
      if (!existing) this.spawnView(u);
      else {
        const prevState = existing.data.state;
        const prevScale = existing.data.scale;
        existing.data = u;
        existing.target = { ...u.position };
        this.redrawHp(existing);
        if (
          existing.usesDirectional &&
          (prevScale !== u.scale || u.scale == null)
        ) {
          this.applyUnitSpriteSize(existing);
        }
        if (!existing.usesDirectional) this.redrawBody(existing);
        else if (prevState !== u.state) {
          if (existing.attackPlaying && u.state !== 'dead') {
            /* keep one-shot attack */
          } else {
            void this.setUnitAnim(
              existing,
              clipForUnitState(u.state, true),
              u.state !== 'dead',
            );
          }
        }
      }
    }
    for (const [id, view] of this.unitViews) {
      if (!ids.has(id) && !view.dying) {
        view.dying = true;
        view.dieMs = 400;
        void this.setUnitAnim(view, 'dead', false);
      }
    }
  }

  private spawnView(unit: UnitDto) {
    if (this.unitViews.has(unit.id)) return;
    const root = new Container();
    const visual = new Container();
    const body = new Graphics();
    const hpBg = new Graphics();
    const hpFg = new Graphics();
    const label = new Text({
      text: `${unit.unitTypeName?.[0] ?? '?'}:${unit.displayName}`,
      style: new TextStyle({
        fill: 0xffffff,
        fontSize: 11,
        fontWeight: '600',
      }),
    });
    label.anchor.set(0.5, 0);
    visual.addChild(body);
    root.addChild(visual, hpBg, hpFg, label);
    root.position.set(unit.position.x, unit.position.y);

    const view: UnitView = {
      root,
      visual,
      body,
      sprite: null,
      hpBg,
      hpFg,
      label,
      target: { ...unit.position },
      data: unit,
      dying: false,
      dieMs: 0,
      facing: this.isNationA(unit.nationId) ? 1 : -1,
      usesDirectional: false,
      animClip: null,
      animDir: this.isNationA(unit.nationId) ? 'east' : 'west',
      animTextures: [],
      animIndex: 0,
      animAcc: 0,
      animFps: 10,
      animLoop: true,
      lastX: unit.position.x,
      lastY: unit.position.y,
      mageBoomFired: false,
      attackSfxFired: false,
      attackPlaying: false,
      deathBoom: null,
    };
    this.redrawBody(view);
    this.redrawHp(view);
    this.applyFacing(view, 0, 0);
    this.unitsLayer.addChild(root);
    this.unitViews.set(unit.id, view);

    void this.bootstrapUnitAnim(view);
  }

  private isNationA(nationId: string): boolean {
    return (
      this.match?.nationA.nationId === nationId ||
      this.match?.baseA?.nationId === nationId
    );
  }

  private applyFacing(view: UnitView, vx = 0, vy = 0) {
    let facing: 1 | -1 = this.isNationA(view.data.nationId) ? 1 : -1;

    if (view.data.targetUnitId) {
      const other = this.unitViews.get(view.data.targetUnitId);
      if (other) {
        const dx = other.root.x - view.root.x;
        if (Math.abs(dx) > 4) facing = dx > 0 ? 1 : -1;
      }
    } else if (Math.abs(vx) > 0.2) {
      facing = vx > 0 ? 1 : -1;
    } else {
      const dx = view.target.x - view.root.x;
      if (Math.abs(dx) > 8) facing = dx > 0 ? 1 : -1;
    }

    view.facing = facing;
    // Directional sheets already have east/west — do not mirror
    view.visual.scale.x = view.usesDirectional ? 1 : facing;
    void vy;
  }

  private unitDisplaySize(view: UnitView): number {
    // Prefer live unit-type scale from Admin (refreshed), then baked unit.scale
    const fromType = this.unitTypes.get(view.data.unitTypeId)?.scale;
    const fromUnit = view.data.scale;
    const scale = Number(fromType ?? fromUnit ?? 1);
    const safe = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return Math.round(UNIT_SIZE * safe);
  }

  private attackKindFor(view: UnitView): 'melee' | 'ranged' | 'unknown' {
    const fromUnit = view.data.attackRange;
    const fromType = this.unitTypes.get(view.data.unitTypeId)?.attackRange;
    const range = fromUnit ?? fromType;
    if (range === 'melee' || range === 'ranged') return range;
    const key = (view.data.spriteKey || '').toLowerCase();
    if (key === 'archer' || key === 'mage') return 'ranged';
    if (key) return 'melee';
    return 'unknown';
  }

  private applyUnitSpriteSize(view: UnitView) {
    if (!view.sprite) return;
    const size = this.unitDisplaySize(view);
    view.sprite.width = size;
    view.sprite.height = size;
    view.label.position.set(0, size * 0.25 + 4);
    this.redrawHp(view);
  }

  private async bootstrapUnitAnim(view: UnitView) {
    await this.ensureSpriteCatalog();
    const key = view.data.spriteKey || 'infantry';
    const has =
      !!this.spriteCatalog?.clips[key] ||
      (key === 'cavalry' && !!this.spriteCatalog?.clips.cavalry);
    if (has) {
      view.usesDirectional = true;
      await this.setUnitAnim(
        view,
        clipForUnitState(view.data.state, true),
        true,
      );
      return;
    }
    await this.tryAttachSprite(view);
  }

  private async setUnitAnim(
    view: UnitView,
    clip: UnitClipName,
    loop: boolean,
    dirOverride?: DirKey,
  ) {
    if (!view.usesDirectional && clip !== 'dead') return;
    const dir =
      dirOverride ??
      pickDir(view.facing, view.target.x - view.root.x, 0);
    const urls = resolveClipUrls(
      this.spriteCatalog,
      view.data.spriteKey || 'infantry',
      clip,
      dir,
    );
    const textures = await loadTextures(this.apiUrl, urls);
    if (!textures.length) {
      if (clip === 'cocooning' || clip === 'revive' || clip === 'running') {
        const idleUrls = resolveClipUrls(
          this.spriteCatalog,
          view.data.spriteKey || 'infantry',
          'idle',
          dir,
        );
        const idleTex = await loadTextures(this.apiUrl, idleUrls);
        if (idleTex.length) {
          this.applyUnitTextures(view, 'idle', dir, idleTex, 1, true);
        }
      }
      return;
    }
    const fps =
      clip === 'attack'
        ? this.attackAnimFps(textures.length, this.resolveAttackSpeed(view))
        : clip === 'dead' || clip === 'cocooning' || clip === 'revive'
          ? 10
          : clip === 'running'
            ? 10
            : 1;
    this.applyUnitTextures(view, clip, dir, textures, fps, loop);
  }

  private isMatchActive() {
    return this.match?.status === 'active';
  }

  private resolveAttackSpeed(view: UnitView): number {
    const fromUnit = view.data.attackSpeed;
    if (typeof fromUnit === 'number' && fromUnit > 0) return fromUnit;
    const fromType = this.unitTypes.get(view.data.unitTypeId)?.attackSpeed;
    if (typeof fromType === 'number' && fromType > 0) return fromType;
    return 1;
  }

  /** One full attack clip lasts exactly 1/attackSpeed seconds. */
  private attackAnimFps(frameCount: number, attackSpeed: number): number {
    const n = Math.max(1, frameCount);
    const as = Math.max(0.05, attackSpeed);
    return Math.min(60, Math.max(2, n * as));
  }

  private applyUnitTextures(
    view: UnitView,
    clip: UnitClipName,
    dir: DirKey,
    textures: Texture[],
    fps: number,
    loop: boolean,
  ) {
    view.animClip = clip;
    view.animDir = dir;
    view.animTextures = textures;
    view.animIndex = 0;
    view.animAcc = 0;
    view.animFps = fps;
    view.animLoop = loop;
    view.usesDirectional = true;
    view.visual.scale.x = 1;
    if (clip === 'attack') {
      view.mageBoomFired = false;
      view.attackSfxFired = false;
      view.attackPlaying = true;
    } else {
      view.attackPlaying = false;
    }

    if (!view.sprite) {
      const spr = new Sprite(textures[0]);
      spr.anchor.set(0.5, 0.85);
      view.visual.addChildAt(spr, 0);
      view.sprite = spr;
    } else {
      view.sprite.texture = textures[0];
    }
    view.sprite.visible = true;
    view.body.visible = false;
    this.applyUnitSpriteSize(view);
  }

  private advanceUnitAnim(view: UnitView, deltaMs: number) {
    if (!view.sprite || view.animTextures.length === 0) return;
    if (view.animTextures.length === 1) {
      view.sprite.texture = view.animTextures[0];
      this.applyUnitSpriteSize(view);
      if (view.animClip === 'attack' && view.attackPlaying) {
        this.maybePlayAttackSfx(view);
        // Single-frame: hold for full attack interval then return to idle
        view.animAcc += deltaMs;
        const holdMs = 1000 / Math.max(0.05, this.resolveAttackSpeed(view));
        if (view.animAcc >= holdMs) {
          this.finishAttackAnim(view);
        }
      }
      return;
    }
    view.animAcc += deltaMs;
    const frameMs = 1000 / Math.max(1, view.animFps);
    while (view.animAcc >= frameMs) {
      view.animAcc -= frameMs;
      if (view.animIndex < view.animTextures.length - 1) {
        view.animIndex++;
      } else if (view.animLoop) {
        view.animIndex = 0;
        if (view.animClip === 'attack') {
          view.attackSfxFired = false;
          if (view.data.spriteKey === 'mage') view.mageBoomFired = false;
        }
      } else {
        if (view.animClip === 'attack' && view.attackPlaying) {
          this.finishAttackAnim(view);
        }
        break;
      }
      view.sprite.texture = view.animTextures[view.animIndex];
      this.applyUnitSpriteSize(view);
      this.maybePlayAttackSfx(view);
      this.maybeFireMageExplosion(view);
      this.maybeFireDeathExplosion(view);
    }
  }

  private finishAttackAnim(view: UnitView) {
    view.attackPlaying = false;
    if (view.dying) return;
    if (!this.isMatchActive()) {
      void this.setUnitAnim(view, 'idle', true);
      return;
    }
    if (
      view.data.state === 'engaging' ||
      view.data.state === 'attacking_base'
    ) {
      void this.setCombatHoldAnim(view);
      return;
    }
    const want = clipForUnitState(view.data.state, false);
    void this.setUnitAnim(view, want, want !== 'dead');
  }

  /**
   * Static combat pose: first Running frame (matches Attack canvas size).
   * Avoids Idle/rotations which are often larger + more padded.
   */
  private async setCombatHoldAnim(view: UnitView, dirOverride?: DirKey) {
    await this.ensureSpriteCatalog();
    const dir =
      dirOverride ??
      pickDir(view.facing, view.target.x - view.root.x, 0);
    const key = view.data.spriteKey || 'infantry';
    let urls = resolveClipUrls(this.spriteCatalog, key, 'running', dir);
    let textures = await loadTextures(this.apiUrl, urls);
    if (!textures.length) {
      urls = resolveClipUrls(this.spriteCatalog, key, 'attack', dir);
      textures = await loadTextures(this.apiUrl, urls);
    }
    if (!textures.length) {
      void this.setUnitAnim(view, 'idle', true, dir);
      return;
    }
    this.applyUnitTextures(view, 'running', dir, [textures[0]], 1, true);
  }

  /** Play unit attack SFX on the last frame of each attack anim cycle. */
  private maybePlayAttackSfx(view: UnitView) {
    if (view.animClip !== 'attack' || view.attackSfxFired) return;
    const n = view.animTextures.length;
    if (n === 0) return;
    const impactFrame = n - 1;
    if (view.animIndex < impactFrame) return;
    view.attackSfxFired = true;
    this.audio.playAttack(this.attackKindFor(view), view.data.spriteKey);
  }

  private maybeFireMageExplosion(view: UnitView) {
    if (view.data.spriteKey !== 'mage' || view.animClip !== 'attack') return;
    if (view.mageBoomFired || view.animTextures.length === 0) return;
    const last = view.animTextures.length - 1;
    if (view.animIndex < last) return;
    view.mageBoomFired = true;
    void this.spawnMageExplosion(view);
  }

  /** Fire on-death catalog explosion near end of Dead clip (~70%). */
  private maybeFireDeathExplosion(view: UnitView) {
    const boom = view.deathBoom;
    if (!boom || boom.fired) return;
    if (view.animClip !== 'dead') return;
    const n = view.animTextures.length;
    if (n === 0) {
      boom.fired = true;
      this.audio.playEffectSfx(boom.effect);
      void this.spawnCatalogExplosion(boom.x, boom.y, boom.radius, boom.effect);
      return;
    }
    const fireAt = Math.max(0, Math.floor((n - 1) * 0.7));
    if (view.animIndex < fireAt) return;
    boom.fired = true;
    this.audio.playEffectSfx(boom.effect);
    void this.spawnCatalogExplosion(boom.x, boom.y, boom.radius, boom.effect);
  }

  private async spawnMageExplosion(caster: UnitView) {
    let x = caster.root.x;
    let y = caster.root.y;
    if (caster.data.targetUnitId) {
      const tgt = this.unitViews.get(caster.data.targetUnitId);
      if (tgt) {
        x = tgt.root.x;
        y = tgt.root.y;
      }
    } else if (caster.data.state === 'attacking_base' && this.match) {
      const isA = this.isNationA(caster.data.nationId);
      x = isA ? 1840 : 80;
      y = caster.root.y;
    }
    await this.spawnCatalogExplosion(x, y, UNIT_SIZE * 0.8, 'mage_explosion');
  }

  private async spawnCatalogExplosion(
    x: number,
    y: number,
    radius: number,
    effectKey: string,
  ) {
    await this.ensureSpriteCatalog();
    const urls = this.spriteCatalog?.effects?.[effectKey] ?? [];
    const textures = await loadTextures(this.apiUrl, urls);
    const size = Math.max(96, (radius > 0 ? radius * 2 : UNIT_SIZE * 1.6));
    if (textures.length) {
      const spr = new Sprite(textures[0]);
      spr.anchor.set(0.5);
      spr.width = size;
      spr.height = size;
      spr.position.set(x, y);
      this.effectsLayer.addChild(spr);
      this.explosions.push({
        sprite: spr,
        gfx: null,
        textures,
        animIndex: 0,
        animAcc: 0,
        animFps: 14,
        x,
        y,
        radius: size / 2,
        age: 0,
        duration: (textures.length / 14) * 1000,
      });
      return;
    }
    // Fallback ring if effect frames missing
    const gfx = new Graphics();
    this.effectsLayer.addChild(gfx);
    this.explosions.push({
      sprite: null,
      gfx,
      textures: [],
      animIndex: 0,
      animAcc: 0,
      animFps: 12,
      x,
      y,
      radius: size / 2,
      age: 0,
      duration: 420,
    });
  }

  private async tryAttachSprite(view: UnitView) {
    const type = this.unitTypes.get(view.data.unitTypeId);
    if (!type?.spriteUrl) return;
    const full = type.spriteUrl.startsWith('http')
      ? type.spriteUrl
      : `${this.apiUrl}${type.spriteUrl}`;
    try {
      const tex = await Assets.load(full);
      if (view.sprite) {
        view.sprite.destroy();
        view.sprite = null;
      }
      const spr = new Sprite(tex);
      spr.anchor.set(0.5);
      const size = this.unitDisplaySize(view);
      spr.width = size;
      spr.height = size;
      view.body.visible = false;
      view.visual.addChildAt(spr, 0);
      view.sprite = spr;
      this.applyFacing(view, 0, 0);
    } catch {
      /* keep placeholder */
    }
  }

  private redrawBody(view: UnitView) {
    if (view.usesDirectional && view.sprite?.visible) {
      view.label.text = `${view.data.unitTypeName?.[0] ?? '?'}:${view.data.displayName}`;
      return;
    }
    const isA = this.isNationA(view.data.nationId);
    const color = isA ? COLOR_A : COLOR_B;
    const size = Math.round(this.unitDisplaySize(view) * 0.5);
    view.body.clear();

    if (view.data.spriteKey === 'archer' || view.data.spriteKey === 'mage') {
      view.body.star(0, 0, 5, size / 2, size / 4).fill({ color });
    } else if (view.data.spriteKey === 'cavalry') {
      view.body
        .poly([-size / 2, size / 3, size / 2, 0, -size / 2, -size / 3])
        .fill({ color });
    } else {
      view.body.circle(0, 0, size / 2).fill({ color });
    }
    const tip = size / 2 + 6;
    view.body
      .poly([tip - 10, -6, tip, 0, tip - 10, 6])
      .fill({ color: 0xffffff, alpha: 0.9 });

    if (view.data.state === 'engaging') {
      view.body.circle(0, 0, size / 2 + 4).stroke({ width: 2, color: 0xfbbf24 });
    }
    view.label.position.set(0, size / 2 + 4);
    view.label.text = `${view.data.unitTypeName?.[0] ?? '?'}:${view.data.displayName}`;
    this.applyFacing(view, 0, 0);
  }

  private redrawHp(view: UnitView) {
    const size = view.usesDirectional
      ? this.unitDisplaySize(view)
      : Math.round(this.unitDisplaySize(view) * 0.5);
    const w = size + 10;
    const pct = view.data.maxHp > 0 ? view.data.hp / view.data.maxHp : 0;
    const y = view.usesDirectional ? -size * 0.85 - 8 : -size / 2 - 10;
    view.hpBg.clear();
    view.hpFg.clear();
    view.hpBg.rect(-w / 2, y, w, 5).fill({ color: 0x111827 });
    view.hpFg
      .rect(-w / 2, y, w * Math.max(0, pct), 5)
      .fill({ color: pct > 0.35 ? 0x4ade80 : 0xf87171 });
  }

  private startCelebration(
    winnerNationId: string | null,
    durationMs = 20_000,
    tournamentComplete = false,
  ) {
    this.clearCelebration();
    this.audio.onBattleEnd(true);
    this.celebrationMs = durationMs;
    this.isTournamentComplete = tournamentComplete;
    const name =
      (winnerNationId && this.nations.get(winnerNationId)?.name) || 'DRAW';
    this.victoryBanner = new Text({
      text: tournamentComplete
        ? `CHAMPION: ${name}`
        : winnerNationId
          ? `${name} Wins!`
          : 'Draw!',
      style: new TextStyle({
        fill: 0xfbbf24,
        fontSize: tournamentComplete ? 64 : 72,
        fontWeight: '800',
        dropShadow: { color: 0x000000, blur: 8, distance: 3 },
      }),
    });
    this.victoryBanner.anchor.set(0.5);
    this.victoryBanner.position.set(960, 540);
    this.effectsLayer.addChild(this.victoryBanner);
    for (let i = 0; i < 60; i++) {
      const conf = new Graphics();
      const color = [0xfbbf24, 0x3b82f6, 0xef4444, 0x22c55e][i % 4];
      conf.rect(-6, -6, 12, 12).fill({ color });
      conf.position.set(Math.random() * 1920, Math.random() * 1080);
      (conf as any)._vy = 2 + Math.random() * 4;
      this.effectsLayer.addChild(conf);
      this.confetti.push(conf);
    }
  }

  private clearCelebration() {
    this.celebrationMs = 0;
    this.isTournamentComplete = false;
    if (this.victoryBanner) {
      this.victoryBanner.destroy();
      this.victoryBanner = null;
    }
    for (const c of this.confetti) c.destroy();
    this.confetti = [];
  }
}
