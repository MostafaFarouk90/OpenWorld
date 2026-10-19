import type {
  BeatDef,
  BeatId,
  DirectorEvent,
  DirectorPorts,
  DirectorSave,
  GoalSpec,
  GoalTracker,
  SpawnSpec,
  TickSample,
  TutorialMode,
} from './types';
import { BEAT_IDS } from './types';
import { goalRequired, goalUnits } from './goals';

/** Set once the T12 kit step (equip and drink) is done; the t12 quest's kit objective reads it. */
const KIT_DONE_FLAG = 'tutorial.t12.kitDone';
/** Seconds the T05 crack plays before the wraiths rise. */
export const CRACK_SECONDS = 2.5;
/** Seconds the director retries `dialogue.start` at the kneel before giving up (review change 13). */
export const VOW_RETRY_SECONDS = 1;
/** Ticks the T12 smoke hit is retried while health stays full (i-frames can eat it). */
export const SMOKE_RETRY_TICKS = 30;
export const SMOKE_FRACTION = 0.25;
/** Seconds a spawn that found nothing is retried (the enemy model may still be loading) before its goals count as done. */
export const SPAWN_RETRY_SECONDS = 10;
const SPAWN_RETRY_INTERVAL = 0.5;
/** Enemy health on a restarted beat (design section 2, "a second failure restarts the beat with enemies at half health"). */
export const RESTART_HEALTH_SCALE = 0.5;
/** A Replay drill left running this long ends by itself (an abandoned drill must not keep kill XP paused). */
export const DRILL_SECONDS = 180;
/** A turn of the view this large counts as one success of the look prompt. */
export const LOOK_SUCCESS_RADIANS = 0.5;

const KIT: { itemId: string; count: number }[] = [
  { itemId: 'squires-arming-sword', count: 1 },
  { itemId: 'gauts-spare-tabard', count: 1 },
  { itemId: 'healing-flask', count: 2 },
];

export interface DirectorData {
  beats: Readonly<Record<BeatId, BeatDef>>;
  orders: Readonly<Record<TutorialMode, readonly BeatId[]>>;
  /** Every verb the tutorial can lock; a beat's `unlocks` free them from that beat on. */
  lockable: readonly string[];
  createGoal(spec: GoalSpec): GoalTracker;
}

/** A Replay board drill: goals in steps plus the spawns of step 0 (plan section 3, review change 15). */
export interface DrillDef {
  id: string;
  waves?: SpawnSpec[];
  steps: GoalSpec[][];
}

type EnterMode = 'fresh' | 'reload' | 'restart' | 'jump';

const emptySave = (): DirectorSave => ({
  mode: 'full',
  beat: null,
  finished: [],
  skipped: [],
  progress: {},
  t13PendingPassive: null,
  kitGranted: false,
  complete: false,
});

function isBeatId(v: unknown): v is BeatId {
  return typeof v === 'string' && (BEAT_IDS as readonly string[]).includes(v);
}

/**
 * The Knighting Day beat state machine (plans/knighting-day-integration.md sections 3 and 9).
 * It owns the truth: finished beats and the current beat's goal progress are saved here, and a beat
 * never advances because its quest completed. All world effects go through `DirectorPorts`.
 */
export class TutorialDirector {
  private s: DirectorSave = emptySave();
  private steps: GoalTracker[][] = [];
  private step = 0;
  /** Bitmask of the current beat's waves spawned so far. */
  private wavesSpawned = 0;
  /** Spawners whose spawn found nothing: their goals count as done (missing anchors never soft-lock). */
  private readonly missing = new Set<string>();
  private healthScale = 1;
  private retries: { sp: SpawnSpec; left: number; wait: number }[] = [];
  private pendingLoad = false;
  private loadedEntry = false;
  private restartPending = false;
  private restarting = false;
  private crackLeft = 0;
  private vowRetryLeft = -1;
  /** The kneel step to rebuild when the vow will not open. */
  private kneelStep = -1;
  private smokeTicks = 0;
  private drill: { def: DrillDef; steps: GoalTracker[][]; step: number; left: number } | null = null;
  private started = false;
  /**
   * Re-entrancy guard. The real services emit synchronously outside a bus dispatch (quests.complete,
   * dialogue.close), so an event can arrive while the director is mid-transition. Such events wait in
   * `queued` and are handled once the outer call returns, and only if the beat and drill they were
   * raised in are still current (review B1, M1).
   */
  private depth = 0;
  private queued: { beat: BeatId | null; drill: string | null; e: DirectorEvent }[] = [];
  /** Bumped on load and dispose so a restart fade that resolves later does nothing. */
  private generation = 0;
  private disposed = false;
  /** Tracker units already reported per goal of the current beat (`tutorial.goal`). */
  private units: number[][] = [];
  private wasMoving = false;
  private lookRef: { x: number; y: number; z: number } | null = null;

  constructor(
    private readonly ports: DirectorPorts,
    private readonly data: DirectorData,
  ) {}

  // ---- queries ----------------------------------------------------------------------------------

  get beat(): BeatId | null {
    return this.s.beat;
  }
  get complete(): boolean {
    return this.s.complete;
  }
  /** True once a run began or a save said where we are (the start screen is then not shown). */
  get begun(): boolean {
    return this.started || this.s.beat !== null || this.s.complete;
  }
  get mode(): TutorialMode {
    return this.s.mode;
  }
  get restartInFlight(): boolean {
    return this.restartPending || this.restarting;
  }
  get drillActive(): string | null {
    return this.drill?.def.id ?? null;
  }
  get currentStep(): number {
    return this.step;
  }
  /** The current goal detail (the gaze target banner, for highlighting). */
  detail(): string | null {
    for (const g of this.steps[this.step] ?? []) {
      if (!g.done && g.spec.kind === 'gaze') return g.detail();
    }
    return null;
  }
  /** The anchor the objective beacon marks now, or null (fights, cutscenes, drills, done). */
  currentTarget(): string | null {
    if (this.s.complete || this.drill || !this.s.beat || this.crackLeft > 0 || this.restartInFlight || this.pendingLoad) return null;
    if (this.vowRetryLeft >= 0) return null;
    return this.def().targets?.[this.step] ?? null;
  }
  snapshot(): DirectorSave {
    this.captureProgress();
    return JSON.parse(JSON.stringify(this.s)) as DirectorSave;
  }

  // ---- persistence --------------------------------------------------------------------------------

  serialize(): DirectorSave {
    return this.snapshot();
  }

  /** Persistable load: replaces the state; the beat restarts on the next tick (review change 4). */
  load(data: unknown): void {
    const d = (data ?? {}) as Partial<DirectorSave>;
    const s = emptySave();
    if (d.mode === 'full' || d.mode === 'veteran' || d.mode === 'kettlewick') s.mode = d.mode;
    s.beat = isBeatId(d.beat) ? d.beat : null;
    s.finished = Array.isArray(d.finished) ? d.finished.filter(isBeatId) : [];
    s.skipped = Array.isArray(d.skipped) ? d.skipped.filter(isBeatId) : [];
    if (d.progress && typeof d.progress === 'object') {
      for (const [k, v] of Object.entries(d.progress)) if (typeof v === 'number' && Number.isFinite(v)) s.progress[k] = v;
    }
    s.t13PendingPassive = typeof d.t13PendingPassive === 'string' ? d.t13PendingPassive : null;
    s.kitGranted = d.kitGranted === true;
    s.complete = d.complete === true;
    this.leaveBeat();
    this.generation++;
    this.restarting = false;
    this.s = s;
    this.loadedEntry = true;
    this.pendingLoad = true;
  }

  /**
   * After every persistable loaded (`save.loaded`). A save without a `tutorial` entry is migrated
   * from quest states (review change 1). The restart itself waits for the next tick.
   */
  onSaveLoaded(): void {
    if (!this.loadedEntry) this.migrate();
    this.loadedEntry = false;
    this.pendingLoad = true;
    this.restartPending = false;
    this.generation++;
    this.restarting = false;
    if (this.drill) this.endDrill(false);
  }

  /** Plugin teardown: nothing the director scheduled may touch the world afterwards. */
  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.queued = [];
  }

  private migrate(): void {
    this.leaveBeat();
    const s = emptySave();
    // A save from before this director existed, past the tutorial: T12 done or M01 under way.
    const m01 = this.ports.state.questState('m01');
    if (
      this.ports.state.flag('tutorial.complete') ||
      this.ports.state.questState('t12') === 'completed' ||
      m01 === 'active' ||
      m01 === 'completed'
    ) {
      s.complete = true;
    } else {
      const order = this.data.orders.full;
      const first = order.find((b) => this.ports.state.questState(this.data.beats[b].questId) !== 'completed');
      if (first) {
        s.beat = first;
        s.finished = order.slice(0, order.indexOf(first));
      } else {
        s.beat = order[order.length - 1];
        s.finished = order.slice(0, -1);
      }
    }
    this.s = s;
  }

  // ---- run control --------------------------------------------------------------------------------

  /** From the start screen or `?tutorial=`. `at` jumps to a beat with every earlier reward applied. */
  begin(mode: TutorialMode, at?: BeatId): void {
    this.guarded(() => this.beginNow(mode, at));
  }

  private beginNow(mode: TutorialMode, at?: BeatId): void {
    if (this.begun) return;
    this.started = true;
    this.s = emptySave();
    this.s.mode = mode;
    const order = this.order();
    if (mode === 'kettlewick') {
      this.ports.resetToStarterKit();
      this.s.kitGranted = true;
      for (const b of this.data.orders.full) {
        if (b === 't15') break;
        this.grantSkipRewards(b);
        this.ports.completeQuest(this.data.beats[b].questId);
        this.s.finished.push(b);
      }
      this.enter('t15', 'jump');
      return;
    }
    if (at && order.includes(at) && at !== order[0]) {
      for (const b of order) {
        if (b === at) break;
        this.grantSkipRewards(b);
        this.ports.completeQuest(this.data.beats[b].questId);
        this.s.finished.push(b);
      }
      this.enter(at, 'jump');
      return;
    }
    this.enter(order[0], 'fresh');
  }

  /** Hold-Esc: the current beat's rewards (only what is missing), its quest completed, next beat. */
  skipCurrent(): void {
    this.guarded(() => this.skipNow());
  }

  private skipNow(): void {
    const id = this.s.beat;
    if (!id || this.restartInFlight || this.pendingLoad) return;
    if (this.ports.vowOpen()) this.ports.closeVow();
    this.ports.cutscene(null);
    this.crackLeft = 0;
    this.vowRetryLeft = -1;
    for (const w of this.def().waves ?? []) for (const sp of w) this.ports.despawn(sp.spawnerId);
    this.grantSkipRewards(id);
    if (!this.s.skipped.includes(id)) this.s.skipped.push(id);
    this.ports.setFlag('tutorial.skipped', true);
    this.ports.toast('tutorial.toast.skipped');
    this.finishBeat('skipped');
  }

  /**
   * Lethal handler body (`tutorial-restart`, order 0, after Second Wind). Returns true to save the
   * player. Idempotent while a restart is pending; the beat's enemies go in this very tick (review change 5).
   */
  onLethal(): boolean {
    let saved = false;
    this.guarded(() => (saved = this.lethalNow()));
    return saved;
  }

  private lethalNow(): boolean {
    if (this.restartInFlight) return true;
    if (this.drill) {
      this.endDrill(false);
      this.ports.healFull();
      return true;
    }
    if (this.s.complete || !this.s.beat) return false;
    // A restart keeps the goals already earned (review 21): the tracker never goes backwards.
    this.captureProgress();
    this.restartPending = true;
    for (const w of this.def().waves ?? []) for (const sp of w) this.ports.despawn(sp.spawnerId);
    this.ports.cutscene(null);
    return true;
  }

  // ---- tick and events ------------------------------------------------------------------------------

  tick(sample: TickSample): void {
    this.guarded(() => this.tickNow(sample));
  }

  private tickNow(sample: TickSample): void {
    if (this.disposed) return;
    if (this.pendingLoad) {
      this.pendingLoad = false;
      this.resumeAfterLoad();
      return;
    }
    if (this.restartPending) {
      this.restartPending = false;
      this.runRestart();
      return;
    }
    if (this.restarting) return;
    if (this.drill) {
      this.drill.left -= sample.dt;
      if (this.drill.left <= 0) {
        this.endDrill(false);
        this.ports.toast('tutorial.replay.cancelled');
        return;
      }
      this.tickSteps(this.drill.steps, this.drill.step, sample);
      this.advanceDrill();
      return;
    }
    const id = this.s.beat;
    if (!id) return;

    if (this.crackLeft > 0) {
      this.crackLeft -= sample.dt;
      if (this.crackLeft <= 0) {
        this.crackLeft = 0;
        this.ports.cutscene(null);
        // UpTo, not For: a reload after the last kill resumes at the clear step (review M2).
        this.spawnWavesUpTo(this.step);
        this.advance();
      }
      return;
    }
    if (this.vowRetryLeft >= 0) {
      if (this.ports.startVow()) {
        this.vowRetryLeft = -1;
      } else {
        this.vowRetryLeft -= sample.dt;
        if (this.vowRetryLeft < 0) {
          this.ports.warn('Tutorial: the vow dialogue would not open; kneel again');
          this.ports.cutscene(null);
          this.rebuildStep(this.kneelStep);
        }
      }
    }
    if (id === 't12') this.tickSmoke();
    this.tickRetries(sample.dt);
    this.tickPromptSuccess(sample);

    this.tickSteps(this.steps, this.step, sample);
    this.advance();
  }

  /** Move and look have no verb event: count a start of walking and a real turn of the view (review 13). */
  private tickPromptSuccess(sample: TickSample): void {
    if (sample.moving && !this.wasMoving) this.ports.promptSuccess('move');
    this.wasMoving = sample.moving;
    const f = sample.camera?.forward;
    if (!f) return;
    if (!this.lookRef) {
      this.lookRef = { ...f };
      return;
    }
    const dot = f.x * this.lookRef.x + f.y * this.lookRef.y + f.z * this.lookRef.z;
    if (dot < Math.cos(LOOK_SUCCESS_RADIANS)) {
      this.ports.promptSuccess('look');
      this.lookRef = { ...f };
    }
  }

  onEvent(e: DirectorEvent): void {
    if (this.disposed) return;
    if (this.depth > 0) {
      this.queued.push({ beat: this.s.beat, drill: this.drill?.def.id ?? null, e });
      return;
    }
    this.guarded(() => this.handleEvent(e));
  }

  /** Runs `fn` with events deferred, then handles the deferred ones that still apply. */
  private guarded(fn: () => void): void {
    this.depth++;
    try {
      fn();
    } finally {
      this.depth--;
    }
    if (this.depth > 0) return;
    let guard = 0;
    while (this.queued.length > 0 && guard++ < 256) {
      const q = this.queued.shift()!;
      if (q.beat !== this.s.beat || q.drill !== (this.drill?.def.id ?? null)) continue;
      this.depth++;
      try {
        this.handleEvent(q.e);
      } finally {
        this.depth--;
      }
    }
    this.queued = [];
  }

  private handleEvent(e: DirectorEvent): void {
    if (this.pendingLoad || this.restartInFlight) return;
    if (e.type === 'skillTriggered' && this.s.t13PendingPassive === e.skillId) {
      this.s.t13PendingPassive = null;
      this.ports.completeQuest(this.data.beats.t13.questId);
    }
    if (this.drill) {
      for (const g of this.drill.steps[this.drill.step] ?? []) g.onEvent(e);
      this.advanceDrill();
      return;
    }
    const id = this.s.beat;
    if (!id || this.crackLeft > 0) return;
    if (id === 't12' && e.type === 'modal' && e.open && e.id === 'inventory' && !this.consumeDone()) {
      this.smokeTicks = SMOKE_RETRY_TICKS;
    }
    if (e.type === 'groupCleared') this.maybeRefill(e.spawnerId);
    for (const g of this.steps[this.step] ?? []) g.onEvent(e);
    this.advance();
  }

  // ---- Replay board -------------------------------------------------------------------------------------

  startDrill(def: DrillDef): boolean {
    let ok = false;
    this.guarded(() => (ok = this.startDrillNow(def)));
    return ok;
  }

  /** The board while a drill runs: stop it (no reward). */
  cancelDrill(): void {
    this.guarded(() => {
      if (!this.drill) return;
      this.endDrill(false);
      this.ports.toast('tutorial.replay.cancelled');
    });
  }

  private startDrillNow(def: DrillDef): boolean {
    if (!this.s.complete || this.drill || this.restartInFlight) return false;
    const steps = def.steps.map((st) => st.map((spec) => this.data.createGoal(spec)));
    for (const st of steps) for (const g of st) g.sync(this.ports.state);
    this.drill = { def, steps, step: 0, left: DRILL_SECONDS };
    this.ports.holdKillXp(true, 'tutorial.replay');
    this.seedTriggers(steps[0] ?? []);
    for (const sp of def.waves ?? []) {
      this.ports.resetGroup(sp.spawnerId);
      if (this.ports.spawn(sp).length === 0) this.ports.warn(`Tutorial: drill spawner ${sp.spawnerId} spawned nothing`);
    }
    return true;
  }

  endDrill(done: boolean): void {
    const d = this.drill;
    if (!d) return;
    this.drill = null;
    for (const sp of d.def.waves ?? []) this.ports.despawn(sp.spawnerId);
    this.ports.holdKillXp(false);
    this.ports.hidePrompts();
    if (done) this.ports.toast('tutorial.replay.done');
  }

  private advanceDrill(): void {
    const d = this.drill;
    if (!d) return;
    for (;;) {
      this.seedTriggers(d.steps[d.step] ?? []);
      if (d.step >= d.steps.length || !d.steps[d.step].every((g) => this.satisfied(g))) break;
      d.step++;
    }
    if (d.step >= d.steps.length) this.endDrill(true);
  }

  // ---- beat life cycle -------------------------------------------------------------------------------------

  private order(): readonly BeatId[] {
    return this.data.orders[this.s.mode];
  }

  private def(id: BeatId | null = this.s.beat): BeatDef {
    return this.data.beats[id!];
  }

  private enter(id: BeatId, mode: EnterMode): void {
    const def = this.data.beats[id];
    this.leaveBeat();
    this.s.beat = id;
    if (mode === 'fresh' || mode === 'jump') this.s.progress = {};
    this.healthScale = mode === 'restart' ? RESTART_HEALTH_SCALE : 1;
    if (mode === 'fresh' || mode === 'jump') this.ports.emitBeat(id, 'started');

    this.ports.startQuest(def.questId);
    if (mode === 'jump' || (mode === 'fresh' && id === this.order()[0]) || (mode === 'reload' && def.cutscene === 'crack')) {
      this.ports.teleport(def.startAnchor);
    }
    this.placeNpcsFor(id);
    this.ports.setLocks(this.locksFor(id));
    this.ports.holdKillXp(this.beforeT13(id), 'tutorial');
    const index = this.data.orders.full.indexOf(id);
    if (index >= 0 && index < this.data.orders.full.indexOf('t05')) this.ports.reArm(0);
    else if (def.crisis || def.cutscene === 'crack') this.ports.reArm(1);

    this.steps = def.steps.map((st) => st.map((spec) => this.data.createGoal(spec)));
    this.step = Math.max(0, Math.min(this.s.progress['step'] ?? 0, this.steps.length));
    this.wavesSpawned = 0;
    // Everything earned is kept, groups already cleared included: a restart respawns only the groups still
    // owed (spawnWave), so the tracker, which never goes back, always matches the director (review m11).
    this.steps.forEach((st, si) =>
      st.forEach((g, gi) => {
        const p = this.s.progress[`${si}.${gi}`];
        if (p !== undefined) g.restore(p);
      }),
    );
    // What the tracker already counted (a fresh beat counted nothing); state synced below is new credit.
    this.units = this.steps.map((st, si) =>
      st.map((g, gi) => (si < this.step ? goalRequired(g.spec) : this.s.progress[`${si}.${gi}`] === undefined ? 0 : goalUnits(g.spec, g.progress, g.done))),
    );
    if (mode === 'reload') this.reconcileTracker(id);
    for (const st of this.steps) for (const g of st) g.sync(this.ports.state);

    this.beatSetup(id, mode);
    this.showPrompts(def);
    for (const line of def.lines ?? []) if (mode !== 'reload' && mode !== 'restart') this.ports.showLine(line);

    if (def.cutscene === 'crack' && mode !== 'restart') {
      this.ports.cutscene('crack');
      this.ports.crackEffects();
      this.ports.setFlag('tutorial.heartshard-awakened', true);
      this.crackLeft = CRACK_SECONDS;
      return;
    }
    this.spawnWavesUpTo(this.step);
    this.advance();
  }

  /**
   * NPC placements are not saved by the npcs service, so every enter re-applies the latest placement
   * of each NPC up to and including this beat (review: Gaut after a reload in T07 or after the end).
   */
  private placeNpcsFor(id: BeatId | null): void {
    const full = this.data.orders.full;
    const upTo = id === null ? full.length - 1 : full.indexOf(id);
    const latest = new Map<string, string>();
    const beats: BeatId[] = upTo >= 0 ? full.slice(0, upTo + 1) : [];
    if (id !== null && upTo < 0) beats.push(id); // skirmish (veteran only)
    for (const b of beats) for (const [npc, anchor] of Object.entries(this.data.beats[b].npcs ?? {})) latest.set(npc, anchor);
    for (const [npc, anchor] of latest) this.ports.placeNpc(npc, anchor);
  }

  /** Per-beat side effects at (re)start that are not goals. */
  private beatSetup(id: BeatId, mode: EnterMode): void {
    if (id === 't04') this.ports.setFlag('tutorial.t04.begin', true);
    if (id === 't05' && mode === 'restart') this.ports.setFlag('tutorial.heartshard-awakened', true);
    if (id === 't12') {
      if (!this.s.kitGranted) {
        this.ports.grantItems('tutorial:t12', KIT);
        this.s.kitGranted = true;
      } else if (mode !== 'fresh' && !this.consumeDone() && !this.ports.hasConsumable()) {
        this.ports.grantItems('tutorial:t12.refill', [{ itemId: 'healing-flask', count: 1 }]);
      }
      if (this.kitStepDone()) {
        this.ports.setFlag('tutorial.t12.kit', true);
        this.ports.setFlag(KIT_DONE_FLAG, true);
      }
      this.smokeTicks = this.consumeDone() ? 0 : SMOKE_RETRY_TICKS;
    }
    if (id === 't13' && this.ports.level() < 2) this.ports.grantLevelTwo();
  }

  private leaveBeat(): void {
    this.units = [];
    this.lookRef = null;
    this.steps = [];
    this.step = 0;
    this.wavesSpawned = 0;
    this.missing.clear();
    this.retries = [];
    this.crackLeft = 0;
    this.vowRetryLeft = -1;
    this.smokeTicks = 0;
  }

  private resumeAfterLoad(): void {
    this.restarting = false;
    this.ports.cutscene(null);
    if (this.s.complete || !this.s.beat) {
      this.leaveBeat();
      this.ports.setLocks([]);
      this.ports.holdKillXp(false);
      // After M01 the quest posts own Gaut and Aelfreda (src/quests/posts.ts).
      if (this.s.complete && this.ports.state.questState('m01') !== 'completed') this.placeNpcsFor(null);
      return;
    }
    const def = this.def();
    for (const w of def.waves ?? []) for (const sp of w) this.ports.resetGroup(sp.spawnerId);
    this.enter(this.s.beat, 'reload');
  }

  private runRestart(): void {
    const id = this.s.beat;
    if (!id) return;
    this.restarting = true;
    const def = this.def();
    const generation = this.generation;
    this.ports.toast('tutorial.toast.restart');
    const finish = (): void => {
      // A load or teardown during the fade owns the state now.
      if (generation !== this.generation || this.disposed) return;
      this.guarded(() => {
        this.restarting = false;
        if (this.s.beat !== id) return;
        this.ports.healFull();
        for (const w of def.waves ?? []) for (const sp of w) this.ports.resetGroup(sp.spawnerId);
        this.enter(id, 'restart');
      });
    };
    this.ports.fadeTeleport(def.startAnchor).then(finish, (err) => {
      this.ports.warn(`Tutorial: restart teleport failed (${String(err)})`);
      finish();
    });
  }

  private finishBeat(how: 'completed' | 'skipped'): void {
    const id = this.s.beat!;
    const def = this.def(id);
    const pendingPassive = id === 't13' && how === 'completed' ? this.pendingPassive() : null;
    if (pendingPassive) {
      this.s.t13PendingPassive = pendingPassive;
      this.ports.toast('tutorial.t13.passive');
    } else {
      this.ports.completeQuest(def.questId);
    }
    if (!this.s.finished.includes(id)) this.s.finished.push(id);
    this.ports.hidePrompts();
    this.ports.emitBeat(id, how);
    if (how === 'completed') this.ports.beatDone(id);
    const order = this.order();
    const next = order[order.indexOf(id) + 1];
    this.s.progress = {};
    if (next) this.enter(next, 'fresh');
    else this.finishTutorial();
  }

  private finishTutorial(): void {
    this.leaveBeat();
    if (this.s.t13PendingPassive) {
      this.s.t13PendingPassive = null;
      this.ports.completeQuest(this.data.beats.t13.questId);
    }
    this.s.beat = null;
    this.s.complete = true;
    this.ports.setLocks([]);
    this.ports.holdKillXp(false);
    // No free tutorial Second Wind carries into the open world (coordinator decision).
    this.ports.reArm(0);
    this.ports.setFlag('tutorial.complete', true);
    this.ports.toast('tutorial.toast.open');
    this.ports.recordCompletion();
  }

  // ---- steps, waves, goals ---------------------------------------------------------------------------------

  private tickSteps(steps: GoalTracker[][], step: number, sample: TickSample): void {
    for (const g of steps[step] ?? []) g.tick(sample, this.ports.state);
  }

  private advance(): void {
    const id = this.s.beat;
    if (!id || this.crackLeft > 0) return;
    let guard = 0;
    while (this.step < this.steps.length && guard++ < 32) {
      const current = this.steps[this.step];
      this.seedTriggers(current);
      this.reportUnits(id, this.step, false);
      if (!current.every((g) => this.satisfied(g))) break;
      this.reportUnits(id, this.step, true);
      this.onStepDone(id, this.step);
      if (this.s.beat !== id) return;
      if (this.step < this.steps.length - 1) this.ports.stepDone(id, this.step);
      this.step++;
      // Re-read state for goals met while an earlier step was current (review M3: T14 lit).
      for (const g of this.steps[this.step] ?? []) g.sync(this.ports.state);
      this.captureProgress();
      this.spawnWavesFor(this.step);
      this.showPrompts(this.def());
    }
    if (this.step >= this.steps.length && this.vowRetryLeft < 0) this.finishBeat('completed');
  }

  /**
   * After a load the tracker may hold less than the director restored (a save from before step objectives
   * existed holds none): send the difference, so the quest's step objectives fill when the steps do (review B1).
   */
  private reconcileTracker(id: BeatId): void {
    for (let si = 0; si <= this.step && si < this.steps.length; si++) {
      const tracked = this.ports.trackedUnits(id, si);
      if (tracked === null) continue;
      const own = this.units[si].reduce((a, b) => a + b, 0);
      if (own > tracked) this.ports.goalProgress(id, si, own - tracked);
    }
  }

  /** Reports newly earned tracker units of a step; `complete` tops every goal up to its required count. */
  private reportUnits(id: BeatId, step: number, complete: boolean): void {
    const goals = this.steps[step];
    const seen = this.units[step];
    if (!goals || !seen) return;
    let delta = 0;
    goals.forEach((g, gi) => {
      // A learned passive passes T13 but its quest waits for the first trigger (skillTriggered completes it; review M1).
      if (complete && g.spec.kind === 'skill' && !g.done) return;
      const u = complete ? goalRequired(g.spec) : goalUnits(g.spec, g.progress, g.done);
      if (u > seen[gi]) {
        delta += u - seen[gi];
        seen[gi] = u;
      }
    });
    if (delta <= 0) return;
    this.ports.goalProgress(id, step, delta);
    // T06: Gaut calls for the second run once the first one counts (coordinator ruling: "Again!").
    if (id === 't06' && step === 0 && !complete && seen.reduce((a, b) => a + b, 0) === 1) this.ports.showLine('tutorial.line.t06.again');
  }

  /**
   * `trigger.enter` fires only on a transition, so a step whose trigger already holds the player would
   * wait for them to step out and back in. Like quest objectives, check on activation; `advance` runs
   * every tick, which also covers `isInside` being stale in the tick of a teleport or load. The event
   * goes to those goals only, and a counted goal ignores it.
   */
  private seedTriggers(goals: GoalTracker[]): void {
    for (const g of goals) {
      if (g.spec.kind === 'trigger' && !g.done && this.ports.playerInTrigger(g.spec.id)) g.onEvent({ type: 'trigger', id: g.spec.id });
    }
  }

  private onStepDone(id: BeatId, step: number): void {
    const current = this.steps[step];
    // The t12 quest's kit objective is done by this flag too, so a save after the kit step never waits on it.
    if (id === 't12' && current.some((g) => g.spec.kind === 'consume')) this.ports.setFlag(KIT_DONE_FLAG, true);
    if (current.some((g) => g.spec.kind === 'interact' && g.spec.id.startsWith('kneel:'))) {
      this.ports.cutscene('knighting');
      this.kneelStep = step;
      this.vowRetryLeft = VOW_RETRY_SECONDS;
      if (this.ports.startVow()) this.vowRetryLeft = -1;
    }
    if (id === 't12' && current.some((g) => g.spec.kind === 'consume')) {
      this.ports.setFlag('tutorial.t12.kit', true);
      this.smokeTicks = 0;
    }
  }

  private rebuildStep(step: number): void {
    const def = this.def();
    this.steps[step] = def.steps[step].map((spec) => this.data.createGoal(spec));
    for (const g of this.steps[step]) g.sync(this.ports.state);
    this.step = step;
    this.vowRetryLeft = -1;
  }

  private waveStep(i: number): number {
    return this.def().waveSteps?.[i] ?? i;
  }

  /** Waves up to this step that a goal from this step on still needs cleared (a restart or reload keeps the step; review M3). */
  private spawnWavesUpTo(step: number): void {
    const waves = this.def().waves ?? [];
    for (let i = 0; i < waves.length; i++) if (this.waveStep(i) <= step && this.waveNeeded(i, step)) this.spawnWave(i);
  }

  private waveNeeded(i: number, step: number): boolean {
    const ids = new Set(this.def().waves![i].map((sp) => sp.spawnerId));
    const clearedBy = (from: number) =>
      this.steps.slice(from).some((st) => st.some((g) => g.spec.kind === 'cleared' && g.spec.spawnerIds.some((s) => ids.has(s))));
    // A wave no goal clears (a T10-style hazard) belongs to its own step only.
    return clearedBy(step) || (!clearedBy(0) && this.waveStep(i) === step);
  }

  private spawnWavesFor(step: number): void {
    const waves = this.def().waves ?? [];
    for (let i = 0; i < waves.length; i++) if (this.waveStep(i) === step) this.spawnWave(i);
  }

  private spawnWave(i: number): void {
    if (this.wavesSpawned & (1 << i)) return;
    this.wavesSpawned |= 1 << i;
    for (const sp of this.def().waves![i]) if (!this.groupCounted(sp.spawnerId)) this.spawnOne(sp);
  }

  /** A group every "cleared" goal from this step on has already counted (kept across a restart or reload). */
  private groupCounted(spawnerId: string): boolean {
    let seen = false;
    for (const st of this.steps.slice(this.step)) {
      for (const g of st) {
        if (g.spec.kind !== 'cleared') continue;
        const i = g.spec.spawnerIds.indexOf(spawnerId);
        if (i < 0) continue;
        if (!(g.progress & (1 << i))) return false;
        seen = true;
      }
    }
    return seen;
  }

  private spawnOne(sp: SpawnSpec): void {
    const scaled: SpawnSpec = { ...sp, healthScale: (sp.healthScale ?? 1) * this.healthScale };
    if (this.ports.spawn(scaled).length > 0) return;
    if (!this.retries.some((r) => r.sp.spawnerId === sp.spawnerId)) {
      this.retries.push({ sp, left: SPAWN_RETRY_SECONDS, wait: SPAWN_RETRY_INTERVAL });
    }
  }

  private tickRetries(dt: number): void {
    if (this.retries.length === 0) return;
    for (const r of [...this.retries]) {
      r.left -= dt;
      r.wait -= dt;
      if (r.wait > 0 && r.left > 0) continue;
      r.wait = SPAWN_RETRY_INTERVAL;
      const scaled: SpawnSpec = { ...r.sp, healthScale: (r.sp.healthScale ?? 1) * this.healthScale };
      if (this.ports.spawn(scaled).length > 0) {
        this.retries.splice(this.retries.indexOf(r), 1);
      } else if (r.left <= 0) {
        this.retries.splice(this.retries.indexOf(r), 1);
        this.ports.warn(`Tutorial: spawner ${r.sp.spawnerId} spawned nothing; its goals count as done`);
        this.missing.add(r.sp.spawnerId);
      }
    }
  }

  /** Done, impossible (missing spawner), or a T13 passive learned but not yet triggered. */
  private satisfied(g: GoalTracker): boolean {
    if (g.done || this.isMissing(g)) return true;
    if (g.spec.kind === 'skill') {
      const learned = g.detail();
      return !!learned && g.spec.passives.includes(learned);
    }
    return false;
  }

  /** A goal that depends on enemies of a spawner that could not spawn counts as done. */
  private isMissing(g: GoalTracker): boolean {
    if (this.missing.size === 0) return false;
    const spec = g.spec;
    if (spec.kind === 'cleared') return spec.spawnerIds.every((id) => this.missing.has(id) || g.done);
    if (spec.kind === 'kill') return this.missing.has(spec.spawnTag);
    if (spec.kind === 'attacks' || spec.kind === 'count' || spec.kind === 'lockSwap') {
      const waves = this.def().waves ?? [];
      return waves.flat().length > 0 && waves.flat().every((sp) => this.missing.has(sp.spawnerId));
    }
    return false;
  }

  /** A group cleared before the steps that need it are done refills (plan section 3, combat beat rule). */
  private maybeRefill(spawnerId: string): void {
    const def = this.def();
    const waves = def.waves ?? [];
    const wave = waves.findIndex((w) => w.some((sp) => sp.spawnerId === spawnerId));
    if (wave < 0 || !(this.wavesSpawned & (1 << wave))) return;
    const clearStep = def.steps.findIndex((st) => st.some((g) => g.kind === 'cleared' && g.spawnerIds.includes(spawnerId)));
    if (clearStep < 0 || this.step >= clearStep) return;
    const sp = waves[wave].find((x) => x.spawnerId === spawnerId)!;
    this.ports.resetGroup(spawnerId);
    this.spawnOne(sp);
  }

  private showPrompts(def: BeatDef): void {
    this.ports.hidePrompts();
    for (const p of def.prompts ?? []) {
      if (p.step !== undefined && p.step !== this.step) continue;
      if (def.id === 'skirmish' && this.ports.promptCount(p.mechanic) > 0) continue;
      if (def.id === 't12' && p.mechanic === 'journal' && !this.kitStepDone()) continue;
      this.ports.showPrompt(p);
    }
  }

  private locksFor(id: BeatId): string[] {
    const order = this.order();
    const freed = new Set<string>();
    for (const b of order.slice(0, order.indexOf(id) + 1)) for (const v of this.data.beats[b].unlocks ?? []) freed.add(v);
    // Skipped-to modes have finished beats outside the order (kettlewick): their unlocks count too.
    for (const b of this.s.finished) for (const v of this.data.beats[b].unlocks ?? []) freed.add(v);
    const locks = this.data.lockable.filter((v) => !freed.has(v));
    return [...locks, ...(this.data.beats[id].extraLocks ?? [])];
  }

  private beforeT13(id: BeatId): boolean {
    const full = this.data.orders.full;
    const i = full.indexOf(id);
    if (id === 'skirmish') return true;
    return i >= 0 && i < full.indexOf('t13');
  }

  private captureProgress(): void {
    if (!this.s.beat) return;
    const p: Record<string, number> = { step: this.step };
    this.steps.forEach((st, si) => st.forEach((g, gi) => (p[`${si}.${gi}`] = g.progress)));
    this.s.progress = p;
  }

  // ---- T12 and T13 helpers -----------------------------------------------------------------------------------

  private consumeDone(): boolean {
    return this.steps.some((st) => st.some((g) => g.spec.kind === 'consume' && g.done));
  }

  private kitStepDone(): boolean {
    const st = this.steps.find((s) => s.some((g) => g.spec.kind === 'consume'));
    return !!st && st.every((g) => g.done);
  }

  private tickSmoke(): void {
    if (this.smokeTicks <= 0 || this.consumeDone()) return;
    if (this.ports.playerHealthFraction() < 0.999) {
      this.smokeTicks = 0;
      return;
    }
    this.smokeTicks--;
    this.ports.smokeHit(SMOKE_FRACTION);
  }

  private pendingPassive(): string | null {
    for (const st of this.steps) {
      for (const g of st) {
        if (g.spec.kind !== 'skill') continue;
        const learned = g.detail();
        if (learned && g.spec.passives.includes(learned) && !g.done) return learned;
      }
    }
    return null;
  }

  // ---- skip rewards (only what is missing, review change 9) ------------------------------------------------------

  private grantSkipRewards(id: BeatId): void {
    const q = this.ports.state;
    switch (id) {
      case 't03':
        if (!q.flag('quest.t03.eddaGift')) {
          this.ports.grantItems('tutorial:t03', [
            { itemId: 'hearth-bread', count: 1 },
            { itemId: 'hearth-token', count: 1 },
          ]);
          this.ports.setFlag('quest.t03.eddaGift', true);
        }
        break;
      case 't04':
        this.ports.setFlag('tutorial.t04.begin', true);
        for (const k of ['tutorial.t04.vow1', 'tutorial.t04.vow2', 'tutorial.t04.vow3', 'tutorial.t04.tone']) {
          if (!q.flag(k)) this.ports.setFlag(k, 'earnest');
        }
        break;
      case 't05':
        this.ports.setFlag('tutorial.heartshard-awakened', true);
        break;
      case 't12':
        if (!this.s.kitGranted) {
          this.ports.grantItems('tutorial:t12', KIT);
          this.s.kitGranted = true;
        }
        this.ports.equip('squires-arming-sword');
        this.ports.equip('gauts-spare-tabard');
        this.ports.setFlag('tutorial.t12.kit', true);
        this.ports.setFlag(KIT_DONE_FLAG, true);
        break;
      case 't13':
        if (this.ports.level() < 2) this.ports.grantLevelTwo();
        break;
      case 't14':
        if (!q.isLit('chapel')) this.ports.rekindle('chapel');
        break;
      default:
        break;
    }
  }
}
