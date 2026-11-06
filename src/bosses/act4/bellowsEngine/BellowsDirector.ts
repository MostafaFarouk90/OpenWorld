// The D07 fight's lifecycle around one BellowsEncounter (plans/act4-L6.md section 4), on the shared boss arena: L2's Crucible
// arena trigger, armed on `story.d07.started` and the arena gate's flag, the intro, L2's gate blocker with a veil, the reload rule
// (a load in the arena puts the player at the mouth anchor this director defines), the leave rule (leaving the Crucible or the
// arena floor mid-fight ends it, and a toast says so, as a death does), and the wreck of a beaten engine.
import * as THREE from 'three';
import { bossOutcomeFlag } from '../../../actors/BossRegistry';
import type { GameContext } from '../../../core/Game';
import { showToast } from '../../../waystones/toast';
import { BossArena, type BossModelState } from '../../arena/BossArena';
import { AshVeil } from '../../prior/priorFx';
import { BellowsEncounter, type BellowsPlaces } from './BellowsEncounter';
import type { BellowsModel } from './BellowsModel';
import { ARENA, ARENA_GATE_FLAG, BELLOWS_BOSS_ID, bellowsLevel, D07_STARTED_FLAG, LOOK, PRESENTATION } from './tuning';

export const INTRO_SOURCE = 'bosses.bellows.intro';
export const OUTCOME_FLAG = bossOutcomeFlag(BELLOWS_BOSS_ID);
export const RESET_TOAST_KEY = 'bosses.bellows.reset';

export interface BellowsDirectorOptions {
  makeModel?: () => BellowsModel | null;
  modelState?: () => BossModelState;
  warn?: (message: string) => void;
  /** The toast, replaceable for tests (default: the HUD toast). */
  toast?: (text: string) => void;
}

export class BellowsDirector {
  private readonly ctx: GameContext;
  private readonly arena: BossArena<BellowsModel, BellowsPlaces, BellowsEncounter>;
  private readonly warn: (m: string) => void;
  private readonly toast: (text: string) => void;
  private readonly makeModel?: () => BellowsModel | null;
  private readonly modelState: () => BossModelState;
  private readonly offs: (() => void)[] = [];
  private warnedPlaces = false;
  private warnedBreaks = false;
  /** The last attempt could not mount its valves: stay unarmed until the next trigger enter or a death. */
  private mountFailed = false;
  private outside = 0;
  private mouthOff: (() => void) | null = null;
  private wreck: BellowsModel | null = null;
  /** Resets announced (tests and the real-game log). */
  resetsAnnounced = 0;

  constructor(ctx: GameContext, opts: BellowsDirectorOptions = {}) {
    this.ctx = ctx;
    this.warn = opts.warn ?? ((m: string) => console.warn(`[bellows-engine] ${m}`));
    this.toast = opts.toast ?? ((text) => showToast(ctx.hud, text, 4000));
    this.makeModel = opts.makeModel;
    this.modelState = opts.modelState ?? (() => 'none');
    const veil = new AshVeil(ARENA.veilWidth, ARENA.veilHeight);
    (veil.mesh.material as THREE.MeshBasicMaterial).color.setHex(LOOK.veil);
    veil.mesh.name = 'bellows-gate-veil';
    const player = () => ctx.player.actor.id;
    // Before the arena's own listeners, so the announcement sees the fight that is about to be torn down.
    this.offs.push(
      ctx.events.on('actor.died', (e) => {
        if (e.actorId !== player()) return;
        if (this.live) this.announceReset();
        this.mountFailed = false;
      }),
      // A fresh enter clears a failed mount before the arena's own enter handler re-arms (the Slagmaw pattern).
      ctx.events.on('trigger.enter', (e) => {
        if (e.triggerId === ARENA.trigger && e.actorId === player()) this.mountFailed = false;
      }),
      ctx.events.on('interior.exited', (e) => {
        if (e.interiorId === ARENA.interiorId) this.abandon();
      }),
    );
    this.arena = new BossArena(ctx, {
      tag: 'bellows-engine',
      outcomeFlag: OUTCOME_FLAG,
      interiorId: ARENA.interiorId,
      trigger: ARENA.trigger,
      door: ARENA.mouth,
      centre: ARENA.centre,
      gate: ARENA.gate,
      gateClearance: ARENA.gateClearance,
      veilOffset: 2,
      veilPlacement: () => this.veilAt(),
      introSource: INTRO_SOURCE,
      veil,
      intro: {
        seconds: PRESENTATION.introSeconds,
        retrySeconds: PRESENTATION.retrySeconds,
        cueAt: PRESENTATION.introCueAt,
        begin: (model) => model?.setFlash(0.6),
        cue: (model) => model?.setDraw(1),
      },
      places: () => this.places(),
      makeEncounter: (places, model, onEnd) => {
        const encounter: BellowsEncounter = new BellowsEncounter(ctx, {
          model,
          places,
          level: bellowsLevel(ctx.services.get('progression')?.level),
          warn: this.warn,
          onEnd: () => {
            if (encounter.mountFailed) this.mountFailed = true;
            onEnd();
          },
        });
        return encounter;
      },
      makeModel: this.makeModel,
      modelState: this.modelState,
      armed: () => !this.mountFailed && ctx.state.hasFlag(D07_STARTED_FLAG) && ctx.state.hasFlag(ARENA_GATE_FLAG) && this.hasBreaks(),
      gateClear: (feet) => this.gateClear(feet),
      insideForReload: (feet) => this.onFloor(feet, 0),
      warn: this.warn,
    });
  }

  get current(): BellowsEncounter | null {
    return this.arena.current;
  }

  get introRunning(): boolean {
    return this.arena.introRunning;
  }

  get gateIsClosed(): boolean {
    return this.arena.gateIsClosed;
  }

  /** The wreck is standing (tests). */
  get wreckShown(): boolean {
    return this.wreck !== null;
  }

  fixedUpdate(dt: number): void {
    this.defineMouth();
    this.arena.fixedUpdate(dt);
    this.syncWreck();
    // Leaving the arena floor mid-fight (any way past the gate) ends it after ABANDON seconds, as a death does.
    const e = this.arena.current;
    if (!e || !e.contested || !(dt > 0)) {
      this.outside = 0;
      return;
    }
    this.outside = this.onFloor(this.ctx.player.feet, 0.5) ? 0 : this.outside + dt;
    if (this.outside >= ARENA.abandonSeconds) this.abandon();
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.arena.dispose();
    this.mouthOff?.();
    this.mouthOff = null;
    this.wreck?.dispose();
    this.wreck = null;
  }

  // ---- internals ----

  private get live(): boolean {
    const e = this.arena.current;
    return !!e && (e.contested || this.arena.introRunning);
  }

  /** The structure-break hook is the only way to break it: without the service the fight never starts (warned once). */
  private hasBreaks(): boolean {
    let ok = false;
    try {
      ok = !!this.ctx.services.get('structureBreaks');
    } catch {
      ok = false;
    }
    if (!ok && !this.warnedBreaks) {
      this.warnedBreaks = true;
      this.warn('no structureBreaks service; the engine does not start');
    }
    return ok;
  }

  private abandon(): void {
    this.outside = 0;
    if (!this.live) return;
    this.announceReset();
    this.arena.abandon();
  }

  private announceReset(): void {
    this.resetsAnnounced++;
    try {
      this.toast(this.ctx.strings.t(RESET_TOAST_KEY));
    } catch (err) {
      this.warn(`reset toast failed (${String(err)})`);
    }
  }

  /** Crucible-local to world: interiors are placed by translation, so L2's entry anchor gives the offset. */
  private offset(): { x: number; y: number; z: number } | null {
    const entry = this.ctx.anchors.find(ARENA.entry);
    if (!entry) return null;
    return { x: entry.position.x - ARENA.entryLocal.x, y: entry.position.y, z: entry.position.z - ARENA.entryLocal.z };
  }

  /** The arena mouth anchor (outside the trigger), defined once L2's anchors exist. */
  private defineMouth(): void {
    if (this.mouthOff || this.ctx.anchors.find(ARENA.mouth)) return;
    const o = this.offset();
    if (!o) return;
    try {
      this.mouthOff = this.ctx.anchors.define({ id: ARENA.mouth, position: { x: o.x + ARENA.mouthLocal.x, y: o.y, z: o.z + ARENA.mouthLocal.z }, yaw: Math.PI });
    } catch (err) {
      this.warn(`could not define ${ARENA.mouth} (${String(err)})`);
      this.mouthOff = () => {};
    }
  }

  /** The player stands on the arena floor (local rectangle, grown by `margin`), within 6 m of its height. */
  private onFloor(feet: THREE.Vector3Like, margin: number): boolean {
    const o = this.offset();
    if (!o) return false;
    const r = ARENA.rect;
    const x = feet.x - o.x;
    const z = feet.z - o.z;
    return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin && Math.abs(feet.y - o.y) < 6;
  }

  /** The gate may close only once the player is wholly past it on the arena side. Unknown anchors: clear. */
  private gateClear(feet: THREE.Vector3Like): boolean {
    const o = this.offset();
    if (!o) return true;
    return feet.z - o.z >= ARENA.gateLocalZ + ARENA.gateMargin;
  }

  private veilAt(): { at: THREE.Vector3Like; yaw: number } | null {
    const o = this.offset();
    if (!o) return null;
    return { at: { x: o.x, y: o.y, z: o.z + ARENA.gateLocalZ - 0.25 }, yaw: 0 };
  }

  private places(): BellowsPlaces | null {
    const a = this.ctx.anchors;
    const centre = a.find(ARENA.centre);
    const valves = ARENA.valves.map((id) => a.find(id));
    const chutes = ARENA.chutes.map((id) => a.find(id));
    if (!centre || valves.some((v) => !v) || !a.find(ARENA.mouth)) {
      if (!this.warnedPlaces) {
        this.warnedPlaces = true;
        this.warn(`arena anchors missing (${[ARENA.centre, ARENA.mouth, ...ARENA.valves].join(', ')}); the engine does not start`);
      }
      return null;
    }
    const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
    return {
      centre: v3(centre.position),
      centreYaw: centre.yaw,
      valves: valves.map((v) => v3(v!.position)),
      chutes: chutes.filter((c) => !!c).map((c) => v3(c!.position)),
    };
  }

  /** A beaten engine stands as a wreck (no actor, no hurtboxes) wherever its anchor is, in a game that draws. */
  private syncWreck(): void {
    const beaten = this.ctx.state.hasFlag(OUTCOME_FLAG);
    // Interior anchors stay defined for good and the Crucible's root is hidden unless it is current: so is the wreck.
    if (this.wreck?.root) this.wreck.root.visible = this.interiorCurrent();
    if (!beaten || this.arena.current) {
      if (!beaten && this.wreck) {
        this.wreck.dispose();
        this.wreck = null;
      }
      return;
    }
    if (this.wreck || this.modelState() !== 'ready' || !this.makeModel) return;
    const centre = this.ctx.anchors.find(ARENA.centre);
    if (!centre) return;
    try {
      const m = this.makeModel();
      if (!m) return;
      m.root.position.set(centre.position.x, centre.position.y, centre.position.z);
      m.setYaw(centre.yaw);
      m.setWrecked();
      m.root.visible = this.interiorCurrent();
      this.ctx.scene.add(m.root);
      this.wreck = m;
    } catch (err) {
      this.warn(`could not build the wreck (${String(err)})`);
      this.makeModelFailedOnce();
    }
  }

  private makeModelFailedOnce(): void {
    // A failed wreck is cosmetic: stop retrying by standing in an empty stand-in.
    this.wreck = { dispose: () => {} } as unknown as BellowsModel;
  }

  private interiorCurrent(): boolean {
    try {
      return (this.ctx.services.get as (n: string) => { current?: string | null } | undefined)('interiors')?.current === ARENA.interiorId;
    } catch {
      return false;
    }
  }
}
