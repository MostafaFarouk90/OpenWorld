// G4 Cinderlands (plan 3.3 to 3.5): one Rift Walk from the arch to the payout. Headless: everything outside goes
// through `RunPorts`, so the run loop is tested without a scene. The plugin wires the ports to the game.
import type { ClassId } from '../actors/classes';
import { BIOMES } from './biomes';
import { FULL_MODE_RADIUS, RIFT_WALK_RADIUS, type RiftTerrainParams } from './domain';
import { heatMultiplier, modifiersAt, runLevel, type HeatModifierId } from './heat';
import { GREED_PER_RANK, masteryEmberBonus, parSecondsFor, runScore, type CinderMeta, type RunOutcome } from './meta';
import { buildManifest, type Poi, type PoiType, type RiftManifest } from './poi';
import { formatSeed, runSeedValue, seededRng, type RunSeed } from './seed';
import { CINDER_KINDS, GROUP_SIZE, POOL_PER_KIND, WARDEN_SPAWNER, poolId, type CinderKind } from './spawners';

export const RUN_FLAG = 'cinder.run.active';
/** POIs wake inside this distance and sleep (despawn, uncleared) past the second. */
export const POI_WAKE = 180;
export const POI_SLEEP = 260;
/** A wandering patrol every this many seconds while none is alive. */
export const PATROL_EVERY = 90;
/** Champion Warden over a normal soldier. */
export const WARDEN_HEALTH = 6;
export const WARDEN_DAMAGE = 1.5;
/** Fraction of the run's Embers kept when leaving early or dying (design 12.2 step 6, R3). */
export const EARLY_SHARE = 0.5;

/** Embers per kill by kind (before Heat), per POI cleared and for the objective (taste calls, G4 Cinderlands). */
export const EMBERS = {
  kill: { 'ash-wraith': 2, 'ember-hound': 2, 'blighted-soldier': 3, blightbloom: 2 } as Record<CinderKind, number>,
  warden: 40,
  poi: 12,
  cache: 25,
  objective: 80,
  /** Heat adds this fraction per step above 1 to every payout. */
  perHeat: 0.1,
} as const;

/** What each POI type wakes, as (kind, count) groups; counts grow by one every four Heat. */
export const RECIPES: Readonly<Record<Exclude<PoiType, 'warden'>, ReadonlyArray<{ kind: CinderKind; count: number }>>> = {
  'ember-camp': [{ kind: 'blighted-soldier', count: 2 }, { kind: 'ember-hound', count: 2 }],
  'ruined-hamlet': [{ kind: 'ash-wraith', count: 3 }, { kind: 'blighted-soldier', count: 1 }],
  'blightbloom-grove': [{ kind: 'blightbloom', count: 3 }, { kind: 'ash-wraith', count: 2 }],
  'mystery-rift': [{ kind: 'ember-hound', count: 3 }, { kind: 'ash-wraith', count: 1 }],
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RunPorts {
  playerLevel(): number;
  classId(): ClassId;
  playerFeet(): Vec3;
  groundAt(x: number, z: number): number;
  setFlag(key: string, on: boolean): void;
  /** Safe teleport; resolves ok false when the ground never became ready. */
  teleport(feet: Vec3, yaw: number): Promise<{ ok: boolean }>;
  saveNow(): Promise<unknown>;
  /** Defers saves; returns the release. */
  suspendSaves(): () => void;
  /** Death respawns at the Quenchstone while set. */
  setRespawnHome(on: boolean): void;
  pauseKillXp(): () => void;
  setTerrain(p: RiftTerrainParams | null): void;
  /** Opens the site's land and holds the player inside the radius; returns the undo. */
  openSite(radius: number): () => void;
  spawnGroup(spawnerId: string, opts: { at: Vec3; count: number; level: number; healthScale: number; damageScale: number; speedScale?: number; aggro?: boolean }): string[];
  resetGroup(spawnerId: string): void;
  /** Where the player goes home to (the Quenchstone pad). */
  home(): { feet: Vec3; yaw: number };
  /** Run-time modifiers on run actors (Burning, Armoured, Phoenix); returns the undo. */
  applyModifiers(mods: readonly HeatModifierId[], isRunActor: (actorId: string) => boolean): () => void;
  /** A max-health bonus while the run lasts (Hearth vigour); returns the undo. */
  healthBonus(fraction: number): () => void;
  /** A damage bonus for the player's hits on run actors (Mastery); returns the undo. */
  damageBonus(fraction: number, isRunActor: (actorId: string) => boolean): () => void;
  toast(key: string, params?: Record<string, string | number>): void;
  now(): number;
  warn(m: string): void;
}

export interface RunStartOptions {
  seed: RunSeed;
  fullMode: boolean;
}

export interface RunSummary {
  outcome: RunOutcome;
  code: string;
  heat: number;
  embers: number;
  kept: number;
  score: number;
  seconds: number;
  place: number;
  heatUnlocked: boolean;
  masteryRanks: number;
}

interface LivePoi {
  poi: Poi;
  state: 'asleep' | 'awake' | 'cleared';
  groups: string[];
  actors: Set<string>;
}

type Phase = 'idle' | 'entering' | 'active' | 'leaving';

export class RiftRun {
  phase: Phase = 'idle';
  seed: RunSeed | null = null;
  code = '';
  manifest: RiftManifest | null = null;
  params: RiftTerrainParams | null = null;
  heat = 1;
  level = 1;
  fullMode = false;
  embers = 0;
  kills = 0;
  mercies = 0;
  damageTaken = 0;
  wardenDown = false;
  startedAt = 0;
  readonly pois = new Map<string, LivePoi>();
  private readonly actorPoi = new Map<string, LivePoi | 'patrol' | 'warden'>();
  private readonly freeGroups = new Map<CinderKind, string[]>();
  private patrolActors = new Set<string>();
  private patrolGroups: string[] = [];
  private patrolTimer = 0;
  private undo: Array<() => void> = [];
  private rng = seededRng(1);
  last: RunSummary | null = null;

  constructor(
    private readonly ports: RunPorts,
    private readonly meta: CinderMeta,
  ) {}

  get active(): boolean {
    return this.phase === 'active';
  }

  isRunActor = (actorId: string): boolean => this.actorPoi.has(actorId);

  /** Starts a run: save at home, hold saves, raise the rift, teleport to the entry. False when one is running or the teleport fails. */
  async start(opts: RunStartOptions): Promise<boolean> {
    if (this.phase !== 'idle') return false;
    this.phase = 'entering';
    const { seed, fullMode } = opts;
    const biome = BIOMES[seed.biome];
    const lv = runLevel(this.ports.playerLevel(), biome.offset, seed.heat);
    this.seed = seed;
    this.code = formatSeed(seed);
    this.fullMode = fullMode;
    this.heat = lv.heat;
    this.level = lv.level;
    this.params = { seed: runSeedValue(seed), biome: seed.biome, radius: fullMode ? FULL_MODE_RADIUS : RIFT_WALK_RADIUS };
    this.manifest = buildManifest(this.params);
    this.rng = seededRng(this.params.seed, 'encounters');
    this.embers = 0;
    this.kills = 0;
    this.mercies = 0;
    this.damageTaken = 0;
    this.wardenDown = false;
    this.pois.clear();
    this.actorPoi.clear();
    this.patrolActors = new Set();
    this.patrolGroups = [];
    this.patrolTimer = PATROL_EVERY;
    for (const k of CINDER_KINDS) this.freeGroups.set(k, Array.from({ length: POOL_PER_KIND }, (_, n) => poolId(k, n)));
    for (const p of this.manifest.pois) this.pois.set(p.id, { poi: p, state: 'asleep', groups: [], actors: new Set() });

    // Save at home first (the run itself is never saved), then hold saves until the run ends.
    await this.ports.saveNow();
    this.undo.push(this.ports.suspendSaves());
    this.ports.setTerrain(this.params);
    this.undo.push(this.ports.openSite(this.params.radius));
    this.ports.setFlag(RUN_FLAG, true);
    this.ports.setRespawnHome(true);
    // D2 (a): no kill XP and no gold during a run; Embers only.
    this.undo.push(this.ports.pauseKillXp());
    this.undo.push(this.ports.applyModifiers(modifiersAt(this.heat), this.isRunActor));
    const vigour = this.meta.rank('vigour');
    if (vigour > 0) this.undo.push(this.ports.healthBonus(0.05 * vigour));
    const rank = this.meta.masteryRank(this.ports.classId());
    if (fullMode && rank > 0) this.undo.push(this.ports.damageBonus(0.01 * rank, this.isRunActor));

    const e = this.manifest.entry;
    const res = await this.ports.teleport({ x: e.x, y: this.ports.groundAt(e.x, e.z), z: e.z }, e.yaw);
    if (!res.ok) {
      this.ports.warn('the rift entry never became solid; the run is called off');
      this.teardown();
      this.phase = 'idle';
      this.ports.toast('cinder.toast.failed');
      return false;
    }
    this.startedAt = this.ports.now();
    this.phase = 'active';
    this.ports.toast('cinder.toast.entered', { code: this.code, heat: this.heat });
    return true;
  }

  /** Per fixed tick while active: wake and sleep POIs round the player, send patrols. */
  tick(dt: number): void {
    if (this.phase !== 'active' || !this.manifest) return;
    const p = this.ports.playerFeet();
    for (const lp of this.pois.values()) {
      if (lp.state === 'cleared') continue;
      const d = Math.hypot(lp.poi.x - p.x, lp.poi.z - p.z);
      if (lp.state === 'asleep' && d < POI_WAKE) this.wake(lp);
      else if (lp.state === 'awake' && d > POI_SLEEP && lp.poi.type !== 'warden') this.sleep(lp);
    }
    if (this.patrolActors.size === 0) {
      this.patrolTimer -= dt;
      if (this.patrolTimer <= 0) {
        this.patrolTimer = PATROL_EVERY;
        this.sendPatrol(p);
      }
    }
  }

  private scale(): { level: number; healthScale: number; damageScale: number; speedScale?: number } {
    const m = heatMultiplier(this.heat);
    const swift = modifiersAt(this.heat).includes('swift');
    return { level: this.level, healthScale: m, damageScale: m, ...(swift ? { speedScale: 1.2 } : {}) };
  }

  private extra(): number {
    return Math.floor((this.heat - 1) / 4);
  }

  private take(kind: CinderKind): string | null {
    const free = this.freeGroups.get(kind);
    const id = free?.shift();
    if (!id) {
      this.ports.warn(`no free ${kind} group; an encounter is smaller`);
      return null;
    }
    this.ports.resetGroup(id);
    return id;
  }

  private give(kind: CinderKind, id: string): void {
    this.ports.resetGroup(id);
    this.freeGroups.get(kind)?.push(id);
  }

  private kindOf(groupId: string): CinderKind | null {
    return CINDER_KINDS.find((k) => groupId.startsWith(`cinder.enc.${k}.`)) ?? null;
  }

  private wake(lp: LivePoi): void {
    lp.state = 'awake';
    const at = { x: lp.poi.x, y: this.ports.groundAt(lp.poi.x, lp.poi.z), z: lp.poi.z };
    if (lp.poi.type === 'warden') {
      this.ports.resetGroup(WARDEN_SPAWNER);
      const s = this.scale();
      const ids = this.ports.spawnGroup(WARDEN_SPAWNER, { at, count: 1, ...s, healthScale: s.healthScale * WARDEN_HEALTH, damageScale: s.damageScale * WARDEN_DAMAGE });
      for (const id of ids) {
        lp.actors.add(id);
        this.actorPoi.set(id, 'warden');
      }
      lp.groups.push(WARDEN_SPAWNER);
      // The Warden's guard comes too.
      this.spawnRecipe(lp, at, [{ kind: 'blighted-soldier', count: 2 }, { kind: 'ash-wraith', count: 2 }]);
      this.ports.toast('cinder.toast.warden');
      return;
    }
    if (lp.poi.type === 'mystery-rift' && this.rng.next() < 0.5) {
      // A cache, not an ambush.
      this.pay(EMBERS.cache);
      lp.state = 'cleared';
      this.ports.toast('cinder.toast.cache', { embers: this.payout(EMBERS.cache) });
      return;
    }
    this.spawnRecipe(lp, at, RECIPES[lp.poi.type]);
    if (lp.actors.size === 0) this.clear(lp);
  }

  private spawnRecipe(lp: LivePoi, at: Vec3, recipe: ReadonlyArray<{ kind: CinderKind; count: number }>): void {
    const s = this.scale();
    for (const r of recipe) {
      let left = r.count + this.extra();
      while (left > 0) {
        const g = this.take(r.kind);
        if (!g) break;
        const n = Math.min(GROUP_SIZE, left);
        left -= n;
        lp.groups.push(g);
        for (const id of this.ports.spawnGroup(g, { at, count: n, ...s })) {
          lp.actors.add(id);
          this.actorPoi.set(id, lp);
        }
      }
    }
  }

  private release(groups: string[]): void {
    for (const g of groups) {
      if (g === WARDEN_SPAWNER) this.ports.resetGroup(g);
      else {
        const k = this.kindOf(g);
        if (k) this.give(k, g);
      }
    }
  }

  private sleep(lp: LivePoi): void {
    for (const id of lp.actors) this.actorPoi.delete(id);
    lp.actors.clear();
    this.release(lp.groups);
    lp.groups = [];
    lp.state = 'asleep';
  }

  private sendPatrol(p: Vec3): void {
    const a = this.rng.next() * Math.PI * 2;
    const r = 70;
    const x = p.x + Math.cos(a) * r;
    const z = p.z + Math.sin(a) * r;
    const kind = this.rng.pick(['ash-wraith', 'ember-hound'] as const);
    const g = this.take(kind);
    if (!g) return;
    this.patrolGroups.push(g);
    for (const id of this.ports.spawnGroup(g, { at: { x, y: this.ports.groundAt(x, z), z }, count: 2 + this.extra(), ...this.scale() })) {
      this.patrolActors.add(id);
      this.actorPoi.set(id, 'patrol');
    }
  }

  private payout(base: number): number {
    const heatBonus = 1 + EMBERS.perHeat * (this.heat - 1);
    const greed = 1 + GREED_PER_RANK * this.meta.rank('greed');
    const mastery = this.fullMode ? 1 + masteryEmberBonus(this.meta.masteryRank(this.ports.classId())) : 1;
    return Math.round(base * heatBonus * greed * mastery);
  }

  private pay(base: number): void {
    this.embers += this.payout(base);
  }

  /** A run actor died (`actor.died`); `kind` is the creature kind. */
  onActorDied(actorId: string, kind: string): void {
    this.onActorGone(actorId, kind, 1);
  }

  /** A run actor was spared, calmed or released: half a kill's Embers (design 12.4). */
  onMercy(actorId: string, kind: string): void {
    if (!this.actorPoi.has(actorId)) return;
    this.mercies++;
    this.onActorGone(actorId, kind, 0.5);
  }

  private onActorGone(actorId: string, kind: string, share: number): void {
    if (this.phase !== 'active') return;
    const where = this.actorPoi.get(actorId);
    if (!where) return;
    this.actorPoi.delete(actorId);
    if (share === 1) this.kills++;
    if (where === 'warden') {
      this.pay(EMBERS.warden * share);
      this.wardenDown = true;
      for (const lp of this.pois.values()) lp.actors.delete(actorId);
      this.ports.toast('cinder.toast.quelled');
      const w = this.manifest ? this.pois.get(this.manifest.wardenId) : undefined;
      if (w && w.actors.size === 0) this.clear(w);
      return;
    }
    const base = EMBERS.kill[kind as CinderKind] ?? 2;
    this.pay(base * share);
    if (where === 'patrol') {
      this.patrolActors.delete(actorId);
      if (this.patrolActors.size === 0) {
        this.release(this.patrolGroups);
        this.patrolGroups = [];
      }
      return;
    }
    where.actors.delete(actorId);
    if (where.actors.size === 0 && (where.poi.type !== 'warden' || this.wardenDown)) this.clear(where);
  }

  private clear(lp: LivePoi): void {
    if (lp.state === 'cleared') return;
    lp.state = 'cleared';
    this.release(lp.groups);
    lp.groups = [];
    if (lp.poi.type !== 'warden') {
      this.pay(EMBERS.poi);
      this.ports.toast('cinder.toast.cleared', { embers: this.payout(EMBERS.poi) });
    }
  }

  /** Damage the player took this run (score). */
  onPlayerHurt(amount: number): void {
    if (this.phase === 'active' && Number.isFinite(amount) && amount > 0) this.damageTaken += amount;
  }

  /** The exit gate: open once the Warden is down. */
  get exitOpen(): boolean {
    return this.phase === 'active' && this.wardenDown;
  }

  /** Steps through the exit (full payout) or leaves early (half). Teleports home, then ends. */
  async leave(): Promise<RunSummary | null> {
    if (this.phase !== 'active') return null;
    const outcome: RunOutcome = this.wardenDown ? 'quelled' : 'left';
    this.phase = 'leaving';
    // Shut the site first: while it is open the world reads closed, and the trip home would be clamped into the rift.
    this.ports.setFlag(RUN_FLAG, false);
    const home = this.ports.home();
    const res = await this.ports.teleport(home.feet, home.yaw);
    if (!res.ok) this.ports.warn('the way home was not ready; ending the run in place');
    return this.finish(outcome);
  }

  /** The player died: the run ends with half kept; the respawn takes them home (the checkpoint). */
  onPlayerDied(): RunSummary | null {
    if (this.phase !== 'active') return null;
    this.phase = 'leaving';
    this.pendingDeath = true;
    // The respawn goes home (the checkpoint); the site must not hold it in. The ground stays until it lands.
    this.ports.setFlag(RUN_FLAG, false);
    return null;
  }

  private pendingDeath = false;

  /** The respawn after a death in a run has landed at home: tear the run down now (the ground was needed till then). */
  onPlayerRespawned(): RunSummary | null {
    if (!this.pendingDeath) return null;
    this.pendingDeath = false;
    return this.finish('died');
  }

  /** A load or the game going away: the run vanishes with nothing paid (it was never saved). */
  abandon(): void {
    if (this.phase === 'idle') return;
    this.pendingDeath = false;
    this.teardown();
    this.phase = 'idle';
  }

  private finish(outcome: RunOutcome): RunSummary {
    const seconds = Math.max(0, Math.round((this.ports.now() - this.startedAt) / 1000));
    const quelled = outcome === 'quelled';
    if (quelled) this.pay(EMBERS.objective);
    const kept = quelled ? this.embers : Math.floor(this.embers * EARLY_SHARE);
    const classId = this.ports.classId();
    const score = runScore({
      objective: quelled,
      embers: kept,
      secondsTaken: seconds,
      parSeconds: parSecondsFor(this.params?.radius ?? RIFT_WALK_RADIUS),
      mercies: this.mercies,
      deaths: outcome === 'died' ? 1 : 0,
      damageTaken: this.damageTaken,
    });
    const masteryRanks = this.meta.bank(kept, classId, this.fullMode);
    const heatUnlocked = quelled && this.seed ? this.meta.clearedHeat(this.seed.heat) : false;
    const place = this.meta.record({ code: this.code, classId, heat: this.heat, score, seconds, at: Date.now(), outcome });
    const summary: RunSummary = { outcome, code: this.code, heat: this.heat, embers: this.embers, kept, score, seconds, place, heatUnlocked, masteryRanks };
    this.last = summary;
    this.teardown();
    this.phase = 'idle';
    // The release of the save hold runs the deferred save, now at home with the run banked.
    return summary;
  }

  private teardown(): void {
    for (const lp of this.pois.values()) this.release(lp.groups);
    this.release(this.patrolGroups);
    this.patrolGroups = [];
    this.patrolActors.clear();
    this.pois.clear();
    this.actorPoi.clear();
    this.ports.setRespawnHome(false);
    this.ports.setFlag(RUN_FLAG, false);
    this.ports.setTerrain(null);
    const undo = this.undo;
    this.undo = [];
    // Release in reverse: the save hold (pushed first) goes last, so its deferred save sees the banked run.
    for (const u of undo.reverse()) {
      try {
        u();
      } catch (e) {
        this.ports.warn(`teardown step failed: ${String(e)}`);
      }
    }
  }
}
