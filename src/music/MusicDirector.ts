import { BarClock } from './barClock';
import type { MixDriver } from './driver';
import { musicConfig } from './musicConfig';
import { HostileSet } from './hostileSet';
import type { MixState, TrackDef } from './tracks';

const ANON_BOSS = '\u0000anonymous';

export type MusicState = Exclude<MixState, 'talk'>;

export interface MusicDirectorOptions {
  track: TrackDef;
  driver: MixDriver;
  /** Random source in [0, 1) for silence lengths; injectable for tests. */
  random?: () => number;
  config?: typeof musicConfig;
}

interface DiscoverWindow {
  startAt: number;
  endAt: number;
  active: boolean;
}

/**
 * The music state machine. It knows nothing about Three.js, Howler or the event bus: handlers
 * record facts, and `update(now)` (called once per fixed tick with the audio clock) decides the
 * state and issues at most one `setMix`. Until `start()` is called (stems loaded and audio
 * unlocked) it only records, so nothing is scheduled on a mixer that is not playing.
 *
 * Time is the audio-clock time in seconds, which stands still while the context is suspended, so
 * timers never run while audio is locked.
 */
export class MusicDirector {
  private readonly track: TrackDef;
  private readonly driver: MixDriver;
  private readonly random: () => number;
  private readonly cfg: typeof musicConfig;
  private readonly hostiles = new HostileSet();
  private readonly ducks = new Set<string>();

  private clock: BarClock | null = null;
  private disposed = false;
  private lastNow = -Infinity;
  private lastAudio: number | null = null;

  /** Active registry bosses by id (insertion order: the last started sets the mix), plus the anonymous legacy flag. */
  private readonly bosses = new Map<string, { phase: number; hush: boolean }>();
  private warnedBossIds = new Set<string>();
  private combat = false;
  private lastHold = -Infinity;
  private lastHit = -Infinity;
  private endingUntil: number | null = null;
  private discoverPending = false;
  private discover: DiscoverWindow | null = null;
  private exploreSince: number | null = null;
  private silenceUntil: number | null = null;
  private appliedKey: string | null = null;

  constructor(options: MusicDirectorOptions) {
    this.track = options.track;
    this.driver = options.driver;
    this.random = options.random ?? Math.random;
    this.cfg = options.config ?? musicConfig;
  }

  get started(): boolean {
    return this.clock !== null;
  }

  /** The state ignoring the talk overlay. */
  get state(): MusicState {
    return this.baseState(this.lastNow);
  }

  /** The mix key currently wanted: `talk` while any duck is active, else the state. */
  get mixKey(): MixState {
    return this.ducks.size > 0 ? 'talk' : this.state;
  }

  private get boss(): boolean {
    return this.bosses.size > 0;
  }

  private get leadBoss(): [string, { phase: number; hush: boolean }] | undefined {
    let last: [string, { phase: number; hush: boolean }] | undefined;
    for (const entry of this.bosses) last = entry;
    return last;
  }

  /** Changes whenever the wanted mix changes, including a boss phase or hush inside `boss`. */
  get mixRevision(): string {
    const key = this.mixKey;
    const lead = key === 'boss' ? this.leadBoss : undefined;
    return lead ? `boss:${lead[0]}:${lead[1].phase}:${lead[1].hush ? 'hush' : ''}` : key;
  }

  /** The gains for the mix that should be playing now, for starting the mixer. */
  currentMix(): Readonly<Record<string, number>> {
    const key = this.mixKey;
    const lead = key === 'boss' ? this.leadBoss : undefined;
    if (!lead) return this.track.mixes[key];
    const [id, st] = lead;
    const def = this.track.bossMixes?.[id];
    if (!def) {
      if (id !== ANON_BOSS && !this.warnedBossIds.has(id)) {
        this.warnedBossIds.add(id);
        console.warn(`Music: no boss mix for "${id}"; using the generic boss mix`);
      }
      return this.track.mixes.boss;
    }
    if (st.hush && def.hush) return def.hush;
    const phase = Math.min(def.phases.length, Math.max(1, Math.floor(st.phase) || 1));
    return def.phases[phase - 1];
  }

  get hostileCount(): number {
    return this.hostiles.size;
  }

  /** Marks the mixer as playing; `clock.startedAt` is the audio time all stems started at. */
  start(clock: BarClock, now: number): void {
    if (this.disposed || this.clock) return;
    this.clock = clock;
    this.lastNow = now;
    this.exploreSince = now;
    this.appliedKey = this.mixRevision; // the mixer was started with currentMix()
  }

  // ---- events -------------------------------------------------------------------------------

  /** `ai.aggro` with the player as target. */
  onAggro(actorId: string): void {
    this.hostiles.add(actorId);
  }

  /** `ai.calm`, `actor.died`, `actor.despawned`: the creature is no longer hostile. */
  onCalm(actorId: string, now: number): void {
    if (this.hostiles.remove(actorId)) this.lastHold = Math.max(this.lastHold, now);
  }

  /** `mercy`: spared, calmed or released. Leaves the set at once; an emptied fight resolves quietly. */
  onMercy(actorId: string, now: number): void {
    const wasHostile = this.hostiles.remove(actorId);
    if (!wasHostile || this.disposed) return;
    if (this.combat && !this.boss && this.hostiles.size === 0) {
      this.combat = false;
      this.lastHit = -Infinity;
      this.endingUntil = now + this.cfg.mercyEndingSeconds;
      this.exploreSince = null;
    }
  }

  /** A hostile hit the player, or the player hit a hostile (already filtered by `isCombatHit`). */
  onCombatHit(now: number): void {
    if (!this.clock) return; // a hit before the music can play says nothing about the fight now
    this.lastHit = Math.max(this.lastHit, now);
  }

  /** `discover` and `waystone.rekindled`. Dropped during combat, boss and ending, or if one is already planned. */
  requestDiscover(): void {
    if (this.disposed) return;
    if (this.combat || this.boss || this.endingUntil !== null) return;
    if (this.discoverPending || this.discover) return;
    this.discoverPending = true;
  }

  /**
   * The public `music.setBoss`. The plugin follows the core boss registry (`bossStarted`,
   * `bossResolved`, `bossEnded`); this stays for callers outside it. `setBoss(false)` never ends
   * a registry boss's music, so a stray call cannot start an ending while a boss is still active.
   */
  setBoss(on: boolean, now: number, bossId?: string): void {
    if (this.disposed) return;
    if (on) {
      this.bossStarted(bossId ?? ANON_BOSS, 1, now);
      return;
    }
    if (bossId !== undefined) {
      this.bossResolved(bossId, now);
      return;
    }
    if (this.bosses.has(ANON_BOSS)) this.bossResolved(ANON_BOSS, now);
  }

  /** A registry boss started (`phase` is 1-based; a boss registered below a threshold starts in that phase). */
  bossStarted(bossId: string, phase: number, _now: number): void {
    if (this.disposed) return;
    const existing = this.bosses.get(bossId);
    if (existing) {
      existing.phase = phase;
      return;
    }
    this.bosses.set(bossId, { phase, hush: false });
    this.discover = null;
    this.discoverPending = false;
    this.silenceUntil = null;
    this.exploreSince = null;
    this.combat = false;
    this.endingUntil = null;
  }

  bossPhase(bossId: string, phase: number): void {
    const b = this.bosses.get(bossId);
    if (b) b.phase = phase;
  }

  /** The Release window opened or closed. A close after the boss resolved finds no boss and does nothing. */
  bossHush(bossId: string, open: boolean): void {
    const b = this.bosses.get(bossId);
    if (b) b.hush = open;
  }

  /** A boss was defeated or released: the 6 s ending plays once the last active boss has resolved. */
  bossResolved(bossId: string, now: number): void {
    if (!this.bosses.delete(bossId) || this.bosses.size > 0) return;
    this.afterLastBoss(now, true);
  }

  /** A boss was despawned or unregistered without an outcome: no ending, the mix just returns to exploring. */
  bossEnded(bossId: string, now: number): void {
    if (!this.bosses.delete(bossId) || this.bosses.size > 0) return;
    this.afterLastBoss(now, false);
  }

  private afterLastBoss(now: number, ending: boolean): void {
    this.combat = false;
    this.hostiles.clear();
    this.lastHit = -Infinity;
    if (ending) this.endingUntil = now + this.cfg.endingSeconds;
    else this.exploreSince = now;
  }

  /** Reasons are namespaced by the caller (`dialogue:<id>`, `cutscene:<id>`). Unknown `off` is a no-op. */
  duck(reason: string, on: boolean): void {
    if (on) this.ducks.add(reason);
    else this.ducks.delete(reason);
  }

  /** `save.loaded` and player respawn: forget fights, ducks and queued phrases. */
  reset(now: number): void {
    this.hostiles.clear();
    this.ducks.clear();
    this.bosses.clear();
    this.combat = false;
    this.lastHold = -Infinity;
    this.lastHit = -Infinity;
    this.endingUntil = null;
    this.discoverPending = false;
    this.discover = null;
    this.silenceUntil = null;
    this.exploreSince = this.clock ? now : null;
  }

  dispose(): void {
    this.disposed = true;
  }

  // ---- tick ---------------------------------------------------------------------------------

  /**
   * @param now audio-clock seconds
   * @param distanceTo distance from the player to an actor in metres, undefined if unknown
   */
  update(
    now: number,
    distanceTo: (actorId: string) => number | undefined = () => undefined,
    extra: { audioNow?: number; hostileNear?: boolean } = {},
  ): void {
    if (this.disposed || !this.clock) return;
    if (!Number.isFinite(now) || now < this.lastNow) return;
    const audioNow = extra.audioNow ?? now;
    // Audio time keeps running through a pause or a backgrounded tab while `now` (game time) does
    // not; a phrase planned on the bar clock cannot survive that gap, so drop it instead of skipping it.
    if (this.lastAudio !== null && audioNow - this.lastAudio - (now - this.lastNow) > 0.5) {
      this.discover = null;
    }
    this.lastAudio = audioNow;
    this.lastNow = now;
    const cfg = this.cfg;

    // Combat enter and exit. Aggro is an edge event, so combat holds while the set is non-empty.
    if (!this.boss) {
      if (!this.combat) {
        const near = this.hostiles.list().some((id) => {
          const d = distanceTo(id);
          return d !== undefined && d <= cfg.aggroRadius;
        });
        if (near || now - this.lastHit < cfg.exitHysteresis) this.enterCombat();
      }
      if (this.combat) {
        // A set member with no known position (actor gone) cannot hold combat; the 6 s timer ends it.
        const holding =
          extra.hostileNear === true ||
          this.hostiles.list().some((id) => distanceTo(id) !== undefined);
        if (holding) this.lastHold = now;
        if (!holding && now - Math.max(this.lastHold, this.lastHit) >= cfg.exitHysteresis) {
          this.combat = false;
          this.exploreSince = now;
        }
      }
    }

    if (this.endingUntil !== null && now >= this.endingUntil) {
      this.endingUntil = null;
      this.exploreSince = now;
    }

    this.updateDiscover(audioNow);
    this.updateSilence(now);
    this.apply(now);
  }

  private enterCombat(): void {
    this.combat = true;
    this.discover = null;
    this.discoverPending = false;
    this.silenceUntil = null;
    this.exploreSince = null;
    this.endingUntil = null;
    this.lastHold = this.lastNow;
  }

  private updateDiscover(now: number): void {
    const clock = this.clock;
    if (!clock) return;
    const blocked = this.combat || this.boss || this.endingUntil !== null;
    if (blocked) {
      this.discover = null;
      this.discoverPending = false;
      return;
    }
    if (this.discoverPending && !this.discover && this.ducks.size === 0) {
      const pos = clock.position(now);
      const half = clock.nextHalf(now);
      const startPos = half - pos <= this.cfg.halfBoundaryReachBars ? half : clock.nextBar(now);
      this.discover = {
        startAt: clock.timeAtBarPosition(now, startPos),
        endAt: clock.timeAtBarPosition(now, startPos + this.cfg.halfLoopBars),
        active: false,
      };
      this.discoverPending = false;
    }
    const d = this.discover;
    if (!d) return;
    if (!d.active && now >= d.startAt && this.ducks.size === 0) d.active = true;
    if (now >= d.endAt) {
      this.discover = null;
      this.exploreSince = this.lastNow;
    }
  }

  private updateSilence(now: number): void {
    const plainExplore =
      !this.combat && !this.boss && this.endingUntil === null && this.discover === null && !this.discoverPending && this.ducks.size === 0;
    if (!plainExplore) {
      this.exploreSince = null;
      this.silenceUntil = null;
      return;
    }
    if (this.silenceUntil !== null) {
      if (now >= this.silenceUntil) {
        this.silenceUntil = null;
        this.exploreSince = now;
      }
      return;
    }
    if (this.exploreSince === null) this.exploreSince = now;
    const loopSeconds = this.clock!.loopSeconds;
    if (now - this.exploreSince >= this.cfg.silenceAfterLoops * loopSeconds) {
      const span = this.cfg.silenceMaxSeconds - this.cfg.silenceMinSeconds;
      this.silenceUntil = now + this.cfg.silenceMinSeconds + this.random() * span;
    }
  }

  private baseState(_now: number): MusicState {
    if (this.boss) return 'boss';
    if (this.combat) return 'combat';
    if (this.endingUntil !== null) return 'ending';
    if (this.discover?.active) return 'discover';
    if (this.silenceUntil !== null) return 'silence';
    return 'explore';
  }

  private apply(now: number): void {
    const key = this.mixRevision;
    if (key === this.appliedKey) return;
    try {
      this.driver.setMix(this.currentMix(), this.cfg.rampSeconds);
      this.appliedKey = key;
    } catch (err) {
      console.warn(`Music: setMix(${key}) failed at ${now.toFixed(2)} s:`, err);
    }
  }
}
