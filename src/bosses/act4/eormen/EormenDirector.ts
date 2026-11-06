// The D08 fight's lifecycle around one EormenEncounter (plans/act4-L6.md "PR 2", A and D), on the shared boss arena: L1's Husk
// Cathedral nave trigger, armed while D08 is active, the intro, L1's gate blocker with a veil, the reload rule (a load in the nave
// puts the player at the mouth anchor this director defines if L1 has not), the leave rule (leaving the cathedral or the nave
// floor mid-fight ends it with a toast, as a death does), and his crown on the altar after a Release.
import * as THREE from 'three';
import { bossOutcomeFlag } from '../../../actors/BossRegistry';
import type { GameContext } from '../../../core/Game';
import { showToast } from '../../../waystones/toast';
import { BossArena, type BossModelState } from '../../arena/BossArena';
import { AshVeil } from '../../prior/priorFx';
import { EormenEncounter, type EormenPlaces } from './EormenEncounter';
import { buildCrown, type EormenModel } from './EormenModel';
import { ARENA, EORMEN_BOSS_ID, eormenLevel, LOOK, PRESENTATION } from './tuning';

export const INTRO_SOURCE = 'bosses.eormen.intro';
export const OUTCOME_FLAG = bossOutcomeFlag(EORMEN_BOSS_ID);
export const RESET_TOAST_KEY = 'bosses.eormen.reset';
/** L11's quest and the flag it writes when D08 starts; either arms the fight. */
export const D08_QUEST_ID = 'd08';
export const D08_STARTED_FLAG = 'story.d08.started';

export interface EormenDirectorOptions {
  makeModel?: () => EormenModel | null;
  modelState?: () => BossModelState;
  warn?: (message: string) => void;
  toast?: (text: string) => void;
}

export class EormenDirector {
  private readonly ctx: GameContext;
  private readonly arena: BossArena<EormenModel, EormenPlaces, EormenEncounter>;
  private readonly warn: (m: string) => void;
  private readonly toast: (text: string) => void;
  private readonly modelState: () => BossModelState;
  private readonly offs: (() => void)[] = [];
  private warnedPlaces = false;
  private warnedBreaks = false;
  private mountFailed = false;
  private outside = 0;
  private mouthOff: (() => void) | null = null;
  private crown: THREE.Group | null = null;
  resetsAnnounced = 0;

  constructor(ctx: GameContext, opts: EormenDirectorOptions = {}) {
    this.ctx = ctx;
    this.warn = opts.warn ?? ((m: string) => console.warn(`[eormen] ${m}`));
    this.toast = opts.toast ?? ((text) => showToast(ctx.hud, text, 4000));
    this.modelState = opts.modelState ?? (() => 'none');
    const veil = new AshVeil(ARENA.veilWidth, ARENA.veilHeight);
    (veil.mesh.material as THREE.MeshBasicMaterial).color.setHex(LOOK.veil);
    veil.mesh.name = 'eormen-gate-veil';
    const player = () => ctx.player.actor.id;
    this.offs.push(
      ctx.events.on('actor.died', (e) => {
        if (e.actorId !== player()) return;
        if (this.live) this.announceReset();
        this.mountFailed = false;
      }),
      ctx.events.on('trigger.enter', (e) => {
        if (e.triggerId === ARENA.trigger && e.actorId === player()) this.mountFailed = false;
      }),
      ctx.events.on('interior.exited', (e) => {
        if (e.interiorId === ARENA.interiorId) this.abandon();
      }),
    );
    this.arena = new BossArena(ctx, {
      tag: 'eormen',
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
        begin: (model) => model?.setGlow(0.4),
        cue: (model) => model?.play('toll'),
      },
      places: () => this.places(),
      makeEncounter: (places, model, onEnd) => {
        const encounter: EormenEncounter = new EormenEncounter(ctx, {
          model,
          places,
          level: eormenLevel(ctx.services.get('progression')?.level),
          warn: this.warn,
          onEnd: () => {
            if (encounter.mountFailed) this.mountFailed = true;
            onEnd();
          },
        });
        return encounter;
      },
      makeModel: opts.makeModel,
      modelState: this.modelState,
      armed: () => !this.mountFailed && this.d08Active() && this.hasBreaks(),
      gateClear: (feet) => this.gateClear(feet),
      insideForReload: (feet) => this.onFloor(feet, 0),
      warn: this.warn,
    });
  }

  get current(): EormenEncounter | null {
    return this.arena.current;
  }

  get introRunning(): boolean {
    return this.arena.introRunning;
  }

  get gateIsClosed(): boolean {
    return this.arena.gateIsClosed;
  }

  /** His crown rests on the altar (tests). */
  get crownShown(): boolean {
    return this.crown !== null && this.crown.visible;
  }

  fixedUpdate(dt: number): void {
    this.defineMouth();
    this.arena.fixedUpdate(dt);
    this.syncCrown();
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
    this.disposeCrown();
  }

  // ---- internals ----

  private get live(): boolean {
    const e = this.arena.current;
    return !!e && (e.contested || this.arena.introRunning);
  }

  /** D08 is under way: L11's quest is active or its started flag is set. Before L11 registers the quest, no condition. */
  private d08Active(): boolean {
    if (this.ctx.state.hasFlag(D08_STARTED_FLAG)) return true;
    const quests = this.ctx.services.get('quests');
    if (!quests || !quests.get(D08_QUEST_ID)) return true;
    return quests.state(D08_QUEST_ID) === 'active';
  }

  private hasBreaks(): boolean {
    let ok = false;
    try {
      ok = !!this.ctx.services.get('structureBreaks');
    } catch {
      ok = false;
    }
    if (!ok && !this.warnedBreaks) {
      this.warnedBreaks = true;
      this.warn('no structureBreaks service; Eormen does not start');
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

  /** Nave-local to world: interiors are placed by translation, so L1's entry anchor gives the offset. */
  private offset(): { x: number; y: number; z: number } | null {
    const entry = this.ctx.anchors.find(ARENA.entry);
    if (!entry) return null;
    return { x: entry.position.x - ARENA.entryLocal.x, y: entry.position.y, z: entry.position.z - ARENA.entryLocal.z };
  }

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

  private rectWorld(): EormenPlaces['rect'] | null {
    const o = this.offset();
    if (!o) return null;
    const r = ARENA.rect;
    return { x0: o.x + r.x0, x1: o.x + r.x1, z0: o.z + r.z0, z1: o.z + r.z1 };
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
    return { at: { x: o.x, y: o.y, z: o.z + ARENA.gateLocalZ - 0.25 }, yaw: 0 };
  }

  private places(): EormenPlaces | null {
    const a = this.ctx.anchors;
    const centre = a.find(ARENA.centre);
    const gong = a.find(ARENA.gong);
    const rect = this.rectWorld();
    if (!centre || !gong || !rect || !a.find(ARENA.mouth)) {
      if (!this.warnedPlaces) {
        this.warnedPlaces = true;
        this.warn(`nave anchors missing (${[ARENA.centre, ARENA.gong, ARENA.entry, ARENA.mouth].join(', ')}); Eormen does not start`);
      }
      return null;
    }
    const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
    return { centre: v3(centre.position), centreYaw: centre.yaw, gong: v3(gong.position), gongYaw: gong.yaw, rect };
  }

  /** After a Release his crown rests on the altar, shown inside the cathedral only. */
  private syncCrown(): void {
    const released = this.ctx.state.getString(OUTCOME_FLAG) === 'released';
    if (!released) {
      this.disposeCrown();
      return;
    }
    if (!this.crown) {
      const altar = this.ctx.anchors.find(ARENA.altar);
      if (!altar) return;
      const crown = buildCrown();
      crown.name = 'eormen-crown-rest';
      crown.scale.setScalar(1.6);
      crown.position.set(altar.position.x, altar.position.y + 1.05, altar.position.z);
      this.ctx.scene.add(crown);
      this.crown = crown;
    }
    this.crown.visible = this.interiorCurrent();
  }

  private disposeCrown(): void {
    if (!this.crown) return;
    this.crown.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.crown.removeFromParent();
    this.crown = null;
  }

  private interiorCurrent(): boolean {
    try {
      return (this.ctx.services.get as (n: string) => { current?: string | null } | undefined)('interiors')?.current === ARENA.interiorId;
    } catch {
      return false;
    }
  }
}
