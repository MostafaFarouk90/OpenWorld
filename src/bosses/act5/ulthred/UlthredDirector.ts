// The D10 fight's lifecycle around one UlthredEncounter (plans/act5-N6.md section 3): N2's Hammer Hall trigger, armed while
// `story.d10.started` is set and Ulthred has no outcome; the intro; N2's hall gate with a veil; the floor drop to the Anvil (the
// encounter runs it on these pieces); the leave rules (the hall floor or the Anvil left for 3 s, or the hall left before the drop,
// ends it as a death does); the reload rule (a load on the Anvil mid-fight puts Cael back at the hall mouth); and v0.9's `bossArena`
// registration 'd10' with N3's kit (floor, ring) and this thread's pieces (anvils, flames, lines), all reset on `boss.ended` and
// on a load.
import * as THREE from 'three';
import type { ArenaPiece } from '../../arena';
import { bossOutcomeFlag } from '../../../actors/BossRegistry';
import { BreakingFloor, TurningPlatforms, kitSystem } from '../../../caldera/arenaKit';
import { HAMMER_HALL_DOOR_ID } from '../../../caldera/interiors/sites';
import type { GameContext } from '../../../core/Game';
import { showToast } from '../../../waystones/toast';
import { BossArena, type BossModelState } from '../../arena/BossArena';
import { AshVeil } from '../../prior/priorFx';
import { buildAnvilArena, type AnvilArena } from './anvilArena';
import { UlthredEncounter, type UlthredPlaces } from './UlthredEncounter';
import type { UlthredModel } from './UlthredModel';
import { D10_STARTED_FLAG, DROP_ANCHOR, HALL, LOOK, PRESENTATION, ULTHRED_BOSS_ID, ulthredLevel } from './tuning';

export const INTRO_SOURCE = 'bosses.ulthred.intro';
export const OUTCOME_FLAG = bossOutcomeFlag(ULTHRED_BOSS_ID);
export const RESET_TOAST_KEY = 'bosses.ulthred.reset';
/** The `bossArena` id of D10 (v0.9 item 7). */
export const ULTHRED_ARENA_ID = 'd10';
export const RING_DEG_PER_S = 10;

export interface UlthredDirectorOptions {
  makeModel?: () => UlthredModel | null;
  modelState?: () => BossModelState;
  warn?: (message: string) => void;
  toast?: (text: string) => void;
  /** Builds the Anvil's pieces (default: this thread's greybox; N1 PR 2 swaps its own in). */
  buildAnvil?: (ctx: GameContext) => AnvilArena | null;
}

export class UlthredDirector {
  private readonly ctx: GameContext;
  private readonly arena: BossArena<UlthredModel, UlthredPlaces, UlthredEncounter>;
  private readonly warn: (m: string) => void;
  private readonly toast: (text: string) => void;
  private readonly offs: (() => void)[] = [];
  private anvil: AnvilArena | null = null;
  private floorPiece: BreakingFloor | null = null;
  private ringPiece: TurningPlatforms | null = null;
  private warnedPlaces = false;
  private outside = 0;
  /** The fight was on the Anvil when the last load landed (tests). */
  reloadsToMouth = 0;
  resetsAnnounced = 0;

  constructor(ctx: GameContext, opts: UlthredDirectorOptions = {}) {
    this.ctx = ctx;
    this.warn = opts.warn ?? ((m: string) => console.warn(`[ulthred] ${m}`));
    this.toast = opts.toast ?? ((text) => showToast(ctx.hud, text, 4000));
    try {
      this.anvil = (opts.buildAnvil ?? ((c) => buildAnvilArena(c, this.warn)))(ctx);
    } catch (err) {
      this.anvil = null;
      this.warn(`the Anvil arena could not be built (${String(err)}); the drop will reset the fight`);
    }
    this.offs.push(() => this.anvil?.dispose());
    const veil = new AshVeil(HALL.veilWidth, HALL.veilHeight);
    (veil.mesh.material as THREE.MeshBasicMaterial).color.setHex(LOOK.soot);
    veil.mesh.name = 'ulthred-gate-veil';
    const player = () => ctx.player.actor.id;
    this.offs.push(
      ctx.events.on('actor.died', (e) => {
        if (e.actorId === player() && this.live) this.announceReset();
      }),
      ctx.events.on('interior.exited', (e) => {
        // The drop leaves the hall on purpose (the bounds rule ends the interior when Cael lands on the Anvil).
        const cur = this.arena.current;
        if (e.interiorId === HALL.interiorId && cur && !cur.island && !cur.dropping) this.abandon();
      }),
      ctx.events.on('save.loaded', () => this.onLoaded()),
    );
    this.registerArena();
    this.arena = new BossArena(ctx, {
      tag: 'ulthred',
      outcomeFlag: OUTCOME_FLAG,
      interiorId: HALL.interiorId,
      trigger: HALL.trigger,
      door: HALL.mouth,
      centre: HALL.centre,
      gate: HALL.gate,
      gateClearance: HALL.gateClearance,
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
          model?.setEmbers(0.2);
        },
      },
      places: () => this.places(),
      makeEncounter: (places, model, onEnd) =>
        new UlthredEncounter(ctx, {
          model,
          places,
          level: ulthredLevel(ctx.services.get('progression')?.level),
          warn: this.warn,
          stage: {
            anvil: () => this.anvil,
            piece: (id, state) => this.setPiece(id, state),
            teleportToAnvil: () => this.teleportToAnvil(),
            say: (key) => this.say(key),
          },
          onEnd: () => onEnd(),
        }),
      makeModel: opts.makeModel,
      modelState: opts.modelState,
      armed: () => ctx.state.hasFlag(D10_STARTED_FLAG),
      gateClear: (feet) => this.gateClear(feet),
      insideForReload: (feet) => this.onHallFloor(feet, 0),
      warn: this.warn,
    });
  }

  get current(): UlthredEncounter | null {
    return this.arena.current;
  }

  get introRunning(): boolean {
    return this.arena.introRunning;
  }

  get gateIsClosed(): boolean {
    return this.arena.gateIsClosed;
  }

  get anvilArena(): AnvilArena | null {
    return this.anvil;
  }

  fixedUpdate(dt: number): void {
    this.arena.fixedUpdate(dt);
    const e = this.arena.current;
    if (!e || !e.contested || e.dropping || !(dt > 0)) {
      this.outside = 0;
      return;
    }
    const feet = this.ctx.player.feet;
    const inside = e.island ? !!this.anvil?.onArena(feet) : this.onHallFloor(feet, 0.5, HALL.gateLocalZ - 0.5);
    this.outside = inside ? 0 : this.outside + dt;
    if (this.outside >= HALL.abandonSeconds) this.abandon();
  }

  dispose(): void {
    this.arena.dispose();
    for (const off of this.offs.splice(0).reverse()) off();
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
    this.say(RESET_TOAST_KEY);
  }

  private say(key: string): void {
    try {
      this.toast(this.ctx.strings.t(key));
    } catch (err) {
      this.warn(`toast failed (${String(err)})`);
    }
  }

  /** v0.9's arena hook: N3's floor and ring, and this thread's anvils, flames and lava lines. */
  private registerArena(): void {
    const arenas = this.ctx.services.get('bossArena');
    if (!arenas) return;
    const interiors = this.ctx.services.get('interiors');
    // solid = closed: the floor blocker is a flat floor until the floor breaks.
    this.floorPiece = new BreakingFloor({ solids: [{ setSolid: (s) => void interiors?.setBlocker(HALL.floorBlocker, s) }], warn: this.warn });
    const plats = this.ctx.services.get('platforms');
    if (plats && this.anvil && this.anvil.platforms.length > 0) {
      const c = this.anvil.centre;
      this.ringPiece = new TurningPlatforms({ platforms: plats, pivot: { x: c.x, y: c.y, z: c.z }, degPerS: RING_DEG_PER_S, items: this.anvil.platforms, start: 'still', warn: this.warn });
      this.offs.push(() => this.ringPiece?.dispose());
    }
    const anvils: ArenaPiece = {
      apply: () => {},
      reset: () => this.anvil?.anvils.forEach((_, i) => this.anvil?.setAnvilCracked(i, false)),
    };
    const flames: ArenaPiece = { apply: () => {}, reset: () => this.anvil?.setFlames(0) };
    const lines: ArenaPiece = { apply: (s) => s === 'clear' && this.arena.current?.lines.clear(), reset: () => this.arena.current?.lines.clear() };
    const pieces: Record<string, ArenaPiece> = { floor: this.floorPiece, anvils, flames, lines };
    if (this.ringPiece) pieces['ring'] = this.ringPiece;
    try {
      this.offs.push(arenas.register(ULTHRED_ARENA_ID, { bossId: ULTHRED_BOSS_ID, pieces }));
    } catch (err) {
      this.warn(`could not register the d10 arena (${String(err)})`);
    }
    const kit = [this.floorPiece, ...(this.ringPiece ? [this.ringPiece] : [])];
    this.offs.push(this.ctx.systems.add(kitSystem(ULTHRED_ARENA_ID, kit)));
  }

  private setPiece(id: string, state: string): void {
    const arenas = this.ctx.services.get('bossArena');
    if (!arenas) {
      // Headless without act5-core: drive the kit pieces directly.
      if (id === 'floor') this.floorPiece?.apply(state);
      if (id === 'ring') this.ringPiece?.apply(state);
      return;
    }
    arenas.set(ULTHRED_ARENA_ID, id, state);
  }

  private async teleportToAnvil(): Promise<boolean> {
    const arenas = this.ctx.services.get('bossArena');
    if (arenas && this.ctx.services.get('waystones')) return arenas.phaseTeleport(ULTHRED_ARENA_ID, DROP_ANCHOR);
    // Headless (no waystones, so no safe teleport): a plain teleport to the anchor, so tests and N11's chain reach phase 2.
    const a = this.ctx.anchors.find(DROP_ANCHOR);
    if (!a) return false;
    this.ctx.player.teleport(a.position, a.yaw);
    return true;
  }

  /** A load on the Anvil with D10 unfinished: back to the hall mouth (the fight restarts there). */
  private onLoaded(): void {
    if (this.ctx.state.hasFlag(OUTCOME_FLAG) || !this.ctx.state.hasFlag(D10_STARTED_FLAG)) return;
    const feet = this.ctx.player.feet;
    if (!this.anvil?.onArena(feet)) return;
    this.reloadsToMouth++;
    void this.toMouth();
  }

  private async toMouth(): Promise<void> {
    const interiors = this.ctx.services.get('interiors');
    try {
      if (interiors && interiors.current !== HALL.interiorId) await interiors.enter(HALL.interiorId, HAMMER_HALL_DOOR_ID);
    } catch (err) {
      this.warn(`could not re-enter the Hammer Hall after a load (${String(err)})`);
      return;
    }
    const mouth = this.ctx.anchors.find(HALL.mouth);
    if (mouth) this.ctx.player.teleport(mouth.position, mouth.yaw);
  }

  /** Hall-local to world: interiors are placed by translation, so N2's entry anchor gives the offset. */
  private offset(): { x: number; y: number; z: number } | null {
    const entry = this.ctx.anchors.find(HALL.entry);
    if (!entry) return null;
    return { x: entry.position.x - HALL.entryLocal.x, y: entry.position.y, z: entry.position.z - HALL.entryLocal.z };
  }

  /** On the hall floor (grown by `margin`); `z0` replaces its near edge (the abandon rule reaches the gate). */
  onHallFloor(feet: THREE.Vector3Like, margin: number, z0?: number): boolean {
    const o = this.offset();
    if (!o) return false;
    const r = HALL.rect;
    const x = feet.x - o.x;
    const z = feet.z - o.z;
    const near = z0 ?? r.z0 - margin;
    // The pit is 3 m deep: a player in it (a failed drop) is still in the hall.
    return x >= r.x0 - margin && x <= r.x1 + margin && z >= near && z <= r.z1 + margin && Math.abs(feet.y - o.y) < 6;
  }

  private gateClear(feet: THREE.Vector3Like): boolean {
    const o = this.offset();
    if (!o) return true;
    return feet.z - o.z >= HALL.gateLocalZ + HALL.gateMargin;
  }

  private veilAt(): { at: THREE.Vector3Like; yaw: number } | null {
    const o = this.offset();
    if (!o) return null;
    return { at: { x: o.x, y: o.y, z: o.z + HALL.gateLocalZ + 0.25 }, yaw: 0 };
  }

  private places(): UlthredPlaces | null {
    const centre = this.ctx.anchors.find(HALL.centre);
    const o = this.offset();
    if (!centre || !o || !this.ctx.anchors.find(HALL.mouth)) {
      if (!this.warnedPlaces) {
        this.warnedPlaces = true;
        this.warn(`hall anchors missing (${HALL.centre}, ${HALL.entry}, ${HALL.mouth}); Ulthred does not start`);
      }
      return null;
    }
    const r = HALL.rect;
    const i = HALL.inset;
    return {
      centre: new THREE.Vector3(centre.position.x, centre.position.y, centre.position.z),
      centreYaw: centre.yaw,
      bounds: { x0: o.x + r.x0 + i, x1: o.x + r.x1 - i, z0: o.z + r.z0 + i, z1: o.z + r.z1 - i },
    };
  }
}
