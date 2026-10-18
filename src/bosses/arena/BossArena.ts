import * as THREE from 'three';
import type { GameContext } from '../../core/Game';
import type { CameraOverride } from '../../rendering/ThirdPersonCamera';

/** Thread 3a's interiors service, as far as an arena uses it (plans/slice-2-interiors-nav.md section 1). */
export interface InteriorsPort {
  readonly current: string | null;
  setBlocker?(blockerId: string, closed: boolean): void;
}

/**
 * Where a boss model stands: 'none' (headless: the fight runs without a model, for tests), 'loading' (a start waits for
 * it), 'ready', or 'failed'. Without a model the boss has no hurtboxes and nothing can touch him, so a real game never
 * starts the fight without one (Prior review S2).
 */
export type BossModelState = 'none' | 'loading' | 'ready' | 'failed';

/** What the arena needs from one fight. */
export interface ArenaEncounter<M> {
  /** The fight is on and no outcome is playing: the gate may close. */
  readonly contested: boolean;
  readonly done: boolean;
  /** An outcome presentation is playing (a late outcome flag must not tear it down). */
  readonly outcomePlaying: boolean;
  readonly view: M | null;
  /** Registers with the core boss registry after the intro; false refuses the fight. */
  register(): boolean;
  tick(dt: number): void;
  reset(opts?: { unregisterFirst?: boolean }): void;
}

/** A veil drawn across the gate while it is closed (the collider is 3a's blocker). */
export interface ArenaVeil {
  readonly mesh: THREE.Object3D;
  show(at: THREE.Vector3Like, yaw: number): void;
  hide(): void;
  update(dt: number): void;
  dispose(): void;
}

export interface ArenaIntro<M> {
  /** First intro and retry lengths (sim seconds). */
  seconds: number;
  retrySeconds: number;
  /** When the intro's cue (gong, howl) plays, first intro only. */
  cueAt: number;
  /** Called as the intro begins (a rise, a reverse dissolve). */
  begin?(model: M | null, first: boolean): void;
  /** Called once at `cueAt` on the first intro. */
  cue?(model: M | null): void;
}

export interface BossArenaConfig<M, P extends { centre: THREE.Vector3 }, E extends ArenaEncounter<M>> {
  /** Log prefix, e.g. 'ashen-prior'. */
  tag: string;
  outcomeFlag: string;
  interiorId: string;
  trigger: string;
  door: string;
  centre: string;
  gate: string;
  /** The gate closes only once the player is this far past the door, so it never shuts on them. */
  gateClearance: number;
  /** The veil sits this far from the door toward the centre. */
  veilOffset: number;
  introSource: string;
  intro: ArenaIntro<M>;
  veil: ArenaVeil;
  /** The fight's anchors, or null (the arena warns once and does not start). */
  places(): P | null;
  makeEncounter(places: P, model: M | null, onEnd: () => void): E;
  makeModel?: () => M | null;
  modelState?: () => BossModelState;
  /** Extra start condition (D02: the kennels are done). Default: always armed. */
  armed?: () => boolean;
  /** Subscribes to changes that can arm the arena while the player stands in the trigger; returns the unsubscribe. */
  watchArming?: (changed: () => void) => () => void;
  /** Whether a load at `feet` puts the player back at the door. Default: anywhere in `interiorId`. */
  insideForReload?: (feet: THREE.Vector3Like) => boolean;
  warn?: (message: string) => void;
}

interface Intro {
  t: number;
  total: number;
  first: boolean;
  cued: boolean;
  undo: (() => void)[];
  camera: CameraOverride | null;
}

/**
 * One boss arena's lifecycle around its encounter (plans/slice-2-ashen-prior.md 3.5, 3.6; plans/slice-2-grimtooth.md
 * section 7): the arena trigger, model-state gating, the intro (camera override on the first one, a frozen player, the
 * cutscene input context), registering after the intro, 3a's gate blocker with a veil, and the reset rules (player
 * death, a load inside the arena, an outcome flag that appears from outside, teardown). A beaten boss never comes back.
 */
export class BossArena<M, P extends { centre: THREE.Vector3 }, E extends ArenaEncounter<M>> {
  private readonly ctx: GameContext;
  private readonly cfg: BossArenaConfig<M, P, E>;
  private readonly warn: (message: string) => void;
  private readonly modelState: () => BossModelState;
  private readonly offs: (() => void)[] = [];
  /** The trigger fired while the model was loading; start once it is ready. */
  private waiting = false;
  private warnedModel = false;
  private encounter: E | null = null;
  private intro: Intro | null = null;
  private introSeen = false;
  private gateClosed = false;
  private beaten = false;
  private outcomeChanged = false;
  /** The player is inside the arena trigger (so a later arming can start the fight). */
  private inTrigger = false;
  private armChanged = false;
  private disposed = false;

  constructor(ctx: GameContext, cfg: BossArenaConfig<M, P, E>) {
    this.ctx = ctx;
    this.cfg = cfg;
    this.warn = cfg.warn ?? ((m) => console.warn(`[${cfg.tag}] ${m}`));
    this.modelState = cfg.modelState ?? (() => 'none');
    ctx.scene.add(cfg.veil.mesh);
    const player = () => ctx.player.actor.id;
    this.offs.push(
      ctx.events.on('trigger.enter', (e) => {
        if (e.triggerId !== cfg.trigger || e.actorId !== player()) return;
        this.inTrigger = true;
        this.start();
      }),
      ctx.events.on('trigger.exit', (e) => {
        if (e.triggerId === cfg.trigger && e.actorId === player()) this.inTrigger = false;
      }),
      ctx.events.on('actor.died', (e) => {
        if (e.actorId === player()) this.teardownFight();
      }),
      ctx.events.on('save.loaded', () => this.onLoaded()),
      ctx.gates.watch(
        (s) => s.hasFlag(cfg.outcomeFlag),
        (open, cause) => {
          this.beaten = open;
          if (open && cause !== 'init') this.outcomeChanged = true;
        },
        { keys: [cfg.outcomeFlag] },
      ),
    );
    if (cfg.watchArming) this.offs.push(cfg.watchArming(() => (this.armChanged = true)));
  }

  /** The running encounter (tests, integration). */
  get current(): E | null {
    return this.encounter;
  }

  /** A start is waiting for the model to load. */
  get waitingForModel(): boolean {
    return this.waiting;
  }

  get introRunning(): boolean {
    return this.intro !== null;
  }

  get gateIsClosed(): boolean {
    return this.gateClosed;
  }

  fixedUpdate(dt: number): void {
    if (this.disposed || !(dt > 0)) return;
    if (this.outcomeChanged) {
      this.outcomeChanged = false;
      // The outcome flag appeared without this encounter playing an outcome (a script, a load): end the fight.
      const e = this.encounter;
      if (e && !e.done && !e.outcomePlaying) this.teardownFight();
    }
    if (this.armChanged) {
      this.armChanged = false;
      if (this.inTrigger) this.start();
    }
    if (this.waiting && this.modelState() !== 'loading') {
      this.waiting = false;
      this.start();
    }
    if (this.intro) this.tickIntro(dt);
    this.encounter?.tick(dt);
    if (this.encounter?.contested && !this.gateClosed) this.tryCloseGate();
    this.cfg.veil.update(dt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.endIntro();
    this.encounter?.reset({ unregisterFirst: true });
    this.encounter = null;
    this.openGate();
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    this.cfg.veil.dispose();
  }

  // ---- internals ----

  private interiors(): InteriorsPort | undefined {
    return (this.ctx.services.get as (name: string) => unknown)('interiors') as InteriorsPort | undefined;
  }

  private start(): void {
    if (this.disposed || this.encounter || this.intro) return;
    if (this.beaten || this.ctx.state.hasFlag(this.cfg.outcomeFlag) || this.ctx.player.actor.dead) return;
    if (this.cfg.armed && !this.cfg.armed()) return;
    const places = this.cfg.places();
    if (!places) return;
    const modelState = this.modelState();
    if (modelState === 'loading') {
      this.waiting = true;
      return;
    }
    let model: M | null = null;
    if (modelState !== 'none') {
      try {
        model = modelState === 'ready' ? (this.cfg.makeModel?.() ?? null) : null;
      } catch (err) {
        model = null;
        if (!this.warnedModel) this.warn(`model failed to build (${err instanceof Error ? err.message : String(err)})`);
      }
      if (!model) {
        if (!this.warnedModel) this.warn('no model (it failed to load); the fight does not start');
        this.warnedModel = true;
        return;
      }
    }
    const encounter = this.cfg.makeEncounter(places, model, () => this.onEnd(encounter));
    this.encounter = encounter;
    this.beginIntro(places);
  }

  private beginIntro(places: P): void {
    const first = !this.introSeen;
    this.introSeen = true;
    const { intro: cfg } = this.cfg;
    const intro: Intro = { t: 0, total: first ? cfg.seconds : cfg.retrySeconds, first, cued: false, undo: [], camera: null };
    this.intro = intro;
    const ctx = this.ctx;
    // The player stays frozen through the intro and the retry (contract: freeze the player during shots).
    intro.undo.push(ctx.player.addMoveModifier(this.cfg.introSource, { freeze: true }));
    try {
      intro.undo.push(ctx.input.contexts.push('cutscene', this.cfg.introSource));
    } catch (err) {
      this.warn(`cutscene input context unavailable (${String(err)})`);
    }
    if (first && ctx.cameraRig) {
      const feet = ctx.player.feet;
      const toCentre = new THREE.Vector3(places.centre.x - feet.x, 0, places.centre.z - feet.z);
      if (toCentre.lengthSq() < 1e-6) toCentre.set(0, 0, -1);
      toCentre.normalize();
      const position = { x: feet.x - toCentre.x * 3, y: feet.y + 2.2, z: feet.z - toCentre.z * 3 };
      const lookAt = { x: places.centre.x, y: places.centre.y + 1.6, z: places.centre.z };
      intro.camera = ctx.cameraRig.override({ position, lookAt, blendIn: 0.6, blendOut: 0.6 });
    }
    cfg.begin?.(this.encounter?.view ?? null, first);
  }

  private tickIntro(dt: number): void {
    const intro = this.intro!;
    intro.t += dt;
    if (intro.first && !intro.cued && intro.t >= this.cfg.intro.cueAt) {
      intro.cued = true;
      this.cfg.intro.cue?.(this.encounter?.view ?? null);
    }
    if (intro.t < intro.total) return;
    this.endIntro();
    if (this.encounter && !this.encounter.register()) this.teardownFight();
  }

  private endIntro(): void {
    const intro = this.intro;
    if (!intro) return;
    this.intro = null;
    intro.camera?.release();
    for (const undo of intro.undo.splice(0).reverse()) {
      try {
        undo();
      } catch (err) {
        this.warn(`intro undo failed: ${String(err)}`);
      }
    }
  }

  /** Closes 3a's gate once the player is well inside the arena, and draws the veil there. */
  private tryCloseGate(): void {
    const a = this.ctx.anchors;
    const door = a.find(this.cfg.door);
    const centre = a.find(this.cfg.centre);
    if (!door || !centre) return;
    const feet = this.ctx.player.feet;
    const fromDoor = Math.hypot(feet.x - door.position.x, feet.z - door.position.z);
    const toCentre = Math.hypot(feet.x - centre.position.x, feet.z - centre.position.z);
    const doorToCentre = Math.hypot(centre.position.x - door.position.x, centre.position.z - door.position.z);
    if (fromDoor < this.cfg.gateClearance || toCentre >= doorToCentre) return;
    this.gateClosed = true;
    try {
      this.interiors()?.setBlocker?.(this.cfg.gate, true);
    } catch (err) {
      this.warn(`could not close the arena gate (${String(err)})`);
    }
    const dx = centre.position.x - door.position.x;
    const dz = centre.position.z - door.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const k = this.cfg.veilOffset / len;
    this.cfg.veil.show({ x: door.position.x + dx * k, y: door.position.y, z: door.position.z + dz * k }, Math.atan2(-dx, -dz));
  }

  private openGate(): void {
    if (!this.gateClosed) return;
    this.gateClosed = false;
    this.cfg.veil.hide();
    try {
      this.interiors()?.setBlocker?.(this.cfg.gate, false);
    } catch (err) {
      this.warn(`could not open the arena gate (${String(err)})`);
    }
  }

  private onEnd(encounter: E): void {
    if (this.encounter === encounter) this.encounter = null;
    this.openGate();
  }

  /** Player death, load, or an outside outcome: no fight state survives (game-events-and-flags.md section 7). */
  private teardownFight(): void {
    this.waiting = false;
    this.endIntro();
    const e = this.encounter;
    this.encounter = null;
    e?.reset();
    this.openGate();
  }

  /** Reload rule: a load inside the arena with the outcome unset puts the player at the arena door. */
  private onLoaded(): void {
    this.teardownFight();
    this.inTrigger = false;
    if (this.ctx.state.hasFlag(this.cfg.outcomeFlag)) return;
    if (this.interiors()?.current !== this.cfg.interiorId) return;
    if (this.cfg.insideForReload && !this.cfg.insideForReload(this.ctx.player.feet)) return;
    const door = this.ctx.anchors.find(this.cfg.door);
    if (!door) {
      this.warn(`${this.cfg.door} missing; the reload keeps the saved position`);
      return;
    }
    this.ctx.player.teleport(door.position, door.yaw);
  }
}
