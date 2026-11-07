// The D09 duel's lifecycle around one VeyEncounter (plans/act5-N6.md section 2), on the shared boss arena: N2's Foundry floor 3
// trigger, armed while `story.d09.started` is set and Vey has no outcome, the intro, N2's arena gate with a veil, the reload rule
// (a load on the ring floor puts the player at checkpoint 3), the leave rule (leaving the ring floor for 3 s, or the Foundry,
// mid-fight ends it as a death does), and v0.9's `bossArena` registration 'd09' (its pieces reset on `boss.ended` and on a load).
import * as THREE from 'three';
import type { ArenaPiece } from '../../arena';
import { bossOutcomeFlag } from '../../../actors/BossRegistry';
import type { GameContext } from '../../../core/Game';
import { showToast } from '../../../waystones/toast';
import { BossArena, type BossModelState } from '../../arena/BossArena';
import { AshVeil } from '../../prior/priorFx';
import { VeyEncounter, type VeyPlaces } from './VeyEncounter';
import type { VeyModel } from './VeyModel';
import { ARENA, D09_STARTED_FLAG, LOOK, PRESENTATION, VEY_BOSS_ID, veyLevel } from './tuning';

export const INTRO_SOURCE = 'bosses.vey.intro';
export const OUTCOME_FLAG = bossOutcomeFlag(VEY_BOSS_ID);
export const RESET_TOAST_KEY = 'bosses.vey.reset';
/** The `bossArena` id of D09 (v0.9 item 7). */
export const VEY_ARENA_ID = 'd09';

export interface VeyDirectorOptions {
  makeModel?: () => VeyModel | null;
  modelState?: () => BossModelState;
  warn?: (message: string) => void;
  toast?: (text: string) => void;
}

export class VeyDirector {
  private readonly ctx: GameContext;
  private readonly arena: BossArena<VeyModel, VeyPlaces, VeyEncounter>;
  private readonly warn: (m: string) => void;
  private readonly toast: (text: string) => void;
  private readonly offs: (() => void)[] = [];
  private warnedPlaces = false;
  private outside = 0;
  /** The ring lights' piece state (N2 draws the lights; this piece only records the fight's state for `bossArena`). */
  private lightsState: 'off' | 'lit' = 'off';
  resetsAnnounced = 0;

  constructor(ctx: GameContext, opts: VeyDirectorOptions = {}) {
    this.ctx = ctx;
    this.warn = opts.warn ?? ((m: string) => console.warn(`[vey] ${m}`));
    this.toast = opts.toast ?? ((text) => showToast(ctx.hud, text, 4000));
    const veil = new AshVeil(ARENA.veilWidth, ARENA.veilHeight);
    (veil.mesh.material as THREE.MeshBasicMaterial).color.setHex(LOOK.soot);
    veil.mesh.name = 'vey-gate-veil';
    const player = () => ctx.player.actor.id;
    this.offs.push(
      ctx.events.on('actor.died', (e) => {
        if (e.actorId === player() && this.live) this.announceReset();
      }),
      ctx.events.on('interior.exited', (e) => {
        if (e.interiorId === ARENA.interiorId) this.abandon();
      }),
    );
    this.registerArena();
    this.arena = new BossArena(ctx, {
      tag: 'vey',
      outcomeFlag: OUTCOME_FLAG,
      interiorId: ARENA.interiorId,
      trigger: ARENA.trigger,
      door: ARENA.mouth,
      centre: ARENA.centre,
      gate: ARENA.gate,
      gateClearance: ARENA.gateClearance,
      veilOffset: 1,
      veilPlacement: () => this.veilAt(),
      introSource: INTRO_SOURCE,
      veil,
      intro: {
        seconds: PRESENTATION.introSeconds,
        retrySeconds: PRESENTATION.retrySeconds,
        cueAt: PRESENTATION.introCueAt,
        begin: (model) => model?.play('idle', { loop: true }),
        cue: (model) => {
          model?.play('roar');
          model?.setHeart(0.3);
        },
      },
      places: () => this.places(),
      makeEncounter: (places, model, onEnd) => {
        this.setLights('lit');
        return new VeyEncounter(ctx, {
          model,
          places,
          level: veyLevel(ctx.services.get('progression')?.level),
          warn: this.warn,
          onEnd: () => {
            this.setLights('off');
            onEnd();
          },
        });
      },
      makeModel: opts.makeModel,
      modelState: opts.modelState,
      armed: () => ctx.state.hasFlag(D09_STARTED_FLAG),
      gateClear: (feet) => this.gateClear(feet),
      insideForReload: (feet) => this.onFloor(feet, 0),
      warn: this.warn,
    });
  }

  get current(): VeyEncounter | null {
    return this.arena.current;
  }

  get introRunning(): boolean {
    return this.arena.introRunning;
  }

  get gateIsClosed(): boolean {
    return this.arena.gateIsClosed;
  }

  fixedUpdate(dt: number): void {
    this.arena.fixedUpdate(dt);
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
  }

  // ---- internals ----

  private get live(): boolean {
    const e = this.arena.current;
    return !!e && (e.contested || this.arena.introRunning);
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

  /** v0.9's arena hook: one piece, the ring lights, so a load or a reset always reads them off. */
  private registerArena(): void {
    const arenas = this.ctx.services.get('bossArena');
    if (!arenas) return;
    const lights: ArenaPiece = {
      apply: (s) => void (this.lightsState = s === 'lit' ? 'lit' : 'off'),
      reset: () => void (this.lightsState = 'off'),
    };
    try {
      this.offs.push(arenas.register(VEY_ARENA_ID, { bossId: VEY_BOSS_ID, pieces: { lights } }));
    } catch (err) {
      this.warn(`could not register the d09 arena (${String(err)})`);
    }
  }

  private setLights(state: 'off' | 'lit'): void {
    this.ctx.services.get('bossArena')?.set(VEY_ARENA_ID, 'lights', state);
  }

  /** The lights piece's state (tests). */
  get lights(): 'off' | 'lit' {
    return this.lightsState;
  }

  /** Foundry-local to world: interiors are placed by translation, so N2's entry anchor gives the offset. */
  private offset(): { x: number; y: number; z: number } | null {
    const entry = this.ctx.anchors.find(ARENA.entry);
    if (!entry) return null;
    return { x: entry.position.x - ARENA.entryLocal.x, y: entry.position.y, z: entry.position.z - ARENA.entryLocal.z };
  }

  private onFloor(feet: THREE.Vector3Like, margin: number): boolean {
    const o = this.offset();
    if (!o) return false;
    const r = ARENA.rect;
    const x = feet.x - o.x;
    const z = feet.z - o.z;
    return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin && Math.abs(feet.y - o.y) < 6;
  }

  private gateClear(feet: THREE.Vector3Like): boolean {
    const o = this.offset();
    if (!o) return true;
    return feet.z - o.z >= ARENA.gateLocalZ + ARENA.gateMargin;
  }

  private veilAt(): { at: THREE.Vector3Like; yaw: number } | null {
    const o = this.offset();
    if (!o) return null;
    return { at: { x: o.x, y: o.y, z: o.z + ARENA.gateLocalZ + 0.25 }, yaw: 0 };
  }

  private places(): VeyPlaces | null {
    const a = this.ctx.anchors;
    const centre = a.find(ARENA.centre);
    const o = this.offset();
    if (!centre || !o || !a.find(ARENA.mouth)) {
      if (!this.warnedPlaces) {
        this.warnedPlaces = true;
        this.warn(`arena anchors missing (${ARENA.centre}, ${ARENA.entry}, ${ARENA.mouth}); Vey does not start`);
      }
      return null;
    }
    const r = ARENA.rect;
    const i = ARENA.inset;
    const caches = ARENA.caches
      .map((id) => a.find(id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => new THREE.Vector3(c.position.x, c.position.y, c.position.z));
    return {
      centre: new THREE.Vector3(centre.position.x, centre.position.y, centre.position.z),
      centreYaw: centre.yaw,
      bounds: { x0: o.x + r.x0 + i, x1: o.x + r.x1 - i, z0: o.z + r.z0 + i, z1: o.z + r.z1 - i },
      caches,
    };
  }
}
