import * as THREE from 'three';
import { bossOutcomeFlag } from '../../actors/BossRegistry';
import type { GameContext } from '../../core/Game';
import type { CameraOverride } from '../../rendering/ThirdPersonCamera';
import { PriorEncounter, type PriorEnd, type PriorPlaces } from './PriorEncounter';
import type { PriorModel } from './PriorModel';
import { AshVeil } from './priorFx';
import { PRESENTATION, PRIOR_BOSS_ID, VAULT } from './tuning';

/** Thread 3a's interiors service, as far as the Prior uses it (plans/slice-2-interiors-nav.md section 1). */
export interface InteriorsPort {
  readonly current: string | null;
  setBlocker?(blockerId: string, closed: boolean): void;
}

export const INTRO_SOURCE = 'bosses.prior.intro';
export const OUTCOME_FLAG = bossOutcomeFlag(PRIOR_BOSS_ID);
/** The gate closes only once the player is this far past the door, so it never shuts on their feet. */
export const GATE_CLEARANCE = 4;
/** The veil plane sits this far from the door toward the arena (3a's gate spans 1 to 3 m in). */
export const VEIL_OFFSET = 2;

interface Intro {
  t: number;
  total: number;
  first: boolean;
  gonged: boolean;
  undo: (() => void)[];
  camera: CameraOverride | null;
}

export interface PriorDirectorOptions {
  /** A fresh Prior model, or null (headless or the Mage failed to load); a throw counts as null. */
  makeModel?: () => PriorModel | null;
  warn?: (message: string) => void;
}

/**
 * The D01 fight's lifecycle around one PriorEncounter (plans/slice-2-ashen-prior.md sections 3.5, 3.6 and 10): the arena
 * trigger, the intro (camera override and a frozen player), registering after the intro, the gate and its veil, and
 * the reset rules (player death, load inside the vault, teardown). A beaten Prior (outcome flag set) never comes back.
 */
export class PriorDirector {
  private readonly ctx: GameContext;
  private readonly makeModel: () => PriorModel | null;
  private readonly warn: (message: string) => void;
  private readonly offs: (() => void)[] = [];
  private readonly veil = new AshVeil();
  private encounter: PriorEncounter | null = null;
  private intro: Intro | null = null;
  private introSeen = false;
  private gateClosed = false;
  private beaten = false;
  private outcomeChanged = false;
  private warnedPlaces = false;
  private disposed = false;

  constructor(ctx: GameContext, opts: PriorDirectorOptions = {}) {
    this.ctx = ctx;
    this.makeModel = opts.makeModel ?? (() => null);
    this.warn = opts.warn ?? ((m) => console.warn(`[ashen-prior] ${m}`));
    ctx.scene.add(this.veil.mesh);
    this.offs.push(
      ctx.events.on('trigger.enter', (e) => {
        if (e.triggerId === VAULT.arenaTrigger && e.actorId === ctx.player.actor.id) this.start();
      }),
      ctx.events.on('actor.died', (e) => {
        if (e.actorId === ctx.player.actor.id) this.teardownFight();
      }),
      ctx.events.on('save.loaded', () => this.onLoaded()),
      ctx.gates.watch(
        (s) => s.hasFlag(OUTCOME_FLAG),
        (open, cause) => {
          this.beaten = open;
          if (open && cause !== 'init') this.outcomeChanged = true;
        },
        { keys: [OUTCOME_FLAG] },
      ),
    );
  }

  /** The running encounter (tests, integration). */
  get current(): PriorEncounter | null {
    return this.encounter;
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
      if (e && !e.done && e.brain.state !== 'released' && e.brain.state !== 'dying') this.teardownFight();
    }
    if (this.intro) this.tickIntro(dt);
    this.encounter?.tick(dt);
    if (this.encounter?.fighting && !this.gateClosed) this.tryCloseGate();
    this.veil.update(dt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.endIntro();
    this.encounter?.reset({ unregisterFirst: true });
    this.encounter = null;
    this.openGate();
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    this.veil.dispose();
  }

  // ---- internals ----

  private interiors(): InteriorsPort | undefined {
    return (this.ctx.services.get as (name: string) => unknown)('interiors') as InteriorsPort | undefined;
  }

  private places(): PriorPlaces | null {
    const a = this.ctx.anchors;
    const centre = a.find(VAULT.centre);
    const door = a.find(VAULT.arenaDoor);
    const pillars = VAULT.pillars.map((id) => a.find(id));
    if (!centre || !door || pillars.some((p) => !p)) {
      if (!this.warnedPlaces) {
        this.warnedPlaces = true;
        this.warn('vault anchors missing (vault.arena.centre, vault.arena.door, vault.pillar.1..4); the Prior does not start');
      }
      return null;
    }
    const v = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
    return { centre: v(centre.position), centreYaw: centre.yaw, pillars: pillars.map((p) => v(p!.position)) };
  }

  private start(): void {
    if (this.disposed || this.encounter || this.intro) return;
    if (this.beaten || this.ctx.state.hasFlag(OUTCOME_FLAG) || this.ctx.player.actor.dead) return;
    const places = this.places();
    if (!places) return;
    let model: PriorModel | null = null;
    try {
      model = this.makeModel();
    } catch (err) {
      this.warn(`Prior model unavailable, greybox fight without it (${err instanceof Error ? err.message : String(err)})`);
    }
    const encounter = new PriorEncounter(this.ctx, {
      model,
      places,
      warn: this.warn,
      onEnd: (end) => this.onEnd(encounter, end),
    });
    this.encounter = encounter;
    this.beginIntro(places);
  }

  private beginIntro(places: PriorPlaces): void {
    const first = !this.introSeen;
    this.introSeen = true;
    const intro: Intro = {
      t: 0,
      total: first ? PRESENTATION.introSeconds : PRESENTATION.retrySeconds,
      first,
      gonged: false,
      undo: [],
      camera: null,
    };
    this.intro = intro;
    const ctx = this.ctx;
    // The player stays frozen through the intro and the retry rise (contract: freeze the player during shots).
    intro.undo.push(ctx.player.addMoveModifier(INTRO_SOURCE, { freeze: true }));
    try {
      intro.undo.push(ctx.input.contexts.push('cutscene', INTRO_SOURCE));
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
    const model = this.encounter?.view;
    const vfx = ctx.services.get('vfx');
    if (model && vfx) {
      const rise = first ? PRESENTATION.introRiseSeconds : PRESENTATION.retrySeconds;
      void vfx.dissolve(model.root, rise, { tint: PRESENTATION.teleportTint, reverse: true }).catch(() => {});
    }
  }

  private tickIntro(dt: number): void {
    const intro = this.intro!;
    intro.t += dt;
    if (intro.first && !intro.gonged && intro.t >= PRESENTATION.introGongAt) {
      intro.gonged = true;
      const audio = this.ctx.services.get('audio');
      try {
        audio?.play('sfx.prior.gong');
      } catch {
        // thread 9 registers it; a missing key is not worth a second warning here
      }
      this.encounter?.view?.play('censerLift');
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
    const door = a.find(VAULT.arenaDoor);
    const centre = a.find(VAULT.centre);
    if (!door || !centre) return;
    const feet = this.ctx.player.feet;
    const fromDoor = Math.hypot(feet.x - door.position.x, feet.z - door.position.z);
    const toCentre = Math.hypot(feet.x - centre.position.x, feet.z - centre.position.z);
    const doorToCentre = Math.hypot(centre.position.x - door.position.x, centre.position.z - door.position.z);
    if (fromDoor < GATE_CLEARANCE || toCentre >= doorToCentre) return;
    this.gateClosed = true;
    try {
      this.interiors()?.setBlocker?.(VAULT.gate, true);
    } catch (err) {
      this.warn(`could not close the arena gate (${String(err)})`);
    }
    const dx = centre.position.x - door.position.x;
    const dz = centre.position.z - door.position.z;
    const len = Math.hypot(dx, dz) || 1;
    this.veil.show(
      { x: door.position.x + (dx / len) * VEIL_OFFSET, y: door.position.y, z: door.position.z + (dz / len) * VEIL_OFFSET },
      Math.atan2(-dx, -dz),
    );
  }

  private openGate(): void {
    if (!this.gateClosed) return;
    this.gateClosed = false;
    this.veil.hide();
    try {
      this.interiors()?.setBlocker?.(VAULT.gate, false);
    } catch (err) {
      this.warn(`could not open the arena gate (${String(err)})`);
    }
  }

  private onEnd(encounter: PriorEncounter, _end: PriorEnd): void {
    if (this.encounter === encounter) this.encounter = null;
    this.openGate();
  }

  /** Player death, load, or an outside outcome: no fight state survives (game-events-and-flags.md section 7). */
  private teardownFight(): void {
    this.endIntro();
    const e = this.encounter;
    this.encounter = null;
    e?.reset();
    this.openGate();
  }

  /** Vault reload rule: a load inside the vault with the outcome unset puts the player at `vault.arena.door`. */
  private onLoaded(): void {
    this.teardownFight();
    if (this.ctx.state.hasFlag(OUTCOME_FLAG)) return;
    if (this.interiors()?.current !== VAULT.interiorId) return;
    const door = this.ctx.anchors.find(VAULT.arenaDoor);
    if (!door) {
      this.warn('vault.arena.door missing; the reload keeps the saved position');
      return;
    }
    this.ctx.player.teleport(door.position, door.yaw);
  }
}
