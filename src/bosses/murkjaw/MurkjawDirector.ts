import * as THREE from 'three';
import { bossOutcomeFlag } from '../../actors/BossRegistry';
import { LEVEL } from '../../enemies/tuning';
import type { GameContext } from '../../core/Game';
import { DEEPS_DEF } from '../../greyfen/deepsInterior';
import { BossArena, type BossModelState, type InteriorsPort } from '../arena/BossArena';
import { AshVeil } from '../prior/priorFx';
import { ArenaFrame } from './arenaGeometry';
import { MurkjawEncounter, type MurkjawPlaces } from './MurkjawEncounter';
import type { MurkjawModel } from './MurkjawModel';
import { ARENA, D05_STARTED_FLAG, LOOK, MURKJAW, PRESENTATION, SFX, MURKJAW_BOSS_ID } from './tuning';

export const INTRO_SOURCE = 'bosses.murkjaw.intro';
export const OUTCOME_FLAG = bossOutcomeFlag(MURKJAW_BOSS_ID);
/** The capsule half-width plus a margin: the gate closes only when the player stands this far inside its arena side. */
export const GATE_MARGIN = 0.8;
/** A live fight ends when the player has been out of the hall this long (they left by another way). */
export const ABANDON_SECONDS = 2;

interface EnemiesPort {
  blockTopLevel?(block: string): number | undefined;
  blockPreview?(block: string): number | undefined;
}

export interface MurkjawDirectorOptions {
  makeModel?: () => MurkjawModel | null;
  modelState?: () => BossModelState;
  warn?: (message: string) => void;
  rng?: () => number;
}

/**
 * His level: the Greyfen block's L + 5 (`enemies.blockTopLevel`; 23 when the Greyfen comes first, 26 when second). An unlocked
 * block (an older or damaged save) reads its live preview + 5, then `MURKJAW.fallbackLevel`.
 */
export function murkjawLevel(enemies: EnemiesPort | undefined): number {
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 1;
  try {
    const top = enemies?.blockTopLevel?.('greyfen');
    if (ok(top)) return Math.round(top);
    const preview = enemies?.blockPreview?.('greyfen');
    if (ok(preview)) return Math.min(LEVEL.cap, Math.round(preview) + 5);
  } catch {
    // fall through to the fallback
  }
  return MURKJAW.fallbackLevel;
}

/**
 * The D05 fight's lifecycle around one MurkjawEncounter (plans/act3-K8.md 3.5), on the shared boss arena: K3's arena trigger in
 * the Mirewater Deeps, armed once `story.d05.started` is set, the intro and the gurgle, the gate and its veil (on K3's gate
 * rect), the reload rule inside the hall only. A `save.loaded` re-derives the drop and the gate (K3 review item 10): interiors
 * keep blocker state across a same-session load, so the crossing is raised and the gate opened unless a fight is live.
 */
export class MurkjawDirector {
  private readonly arena: BossArena<MurkjawModel, MurkjawPlaces, MurkjawEncounter>;
  private readonly ctx: GameContext;
  private warnedPlaces = false;
  private outside = 0;
  private readonly offs: (() => void)[] = [];

  constructor(ctx: GameContext, opts: MurkjawDirectorOptions = {}) {
    this.ctx = ctx;
    const warn = opts.warn ?? ((m: string) => console.warn(`[murkjaw] ${m}`));
    const veil = new AshVeil(ARENA.veilWidth, ARENA.veilHeight);
    (veil.mesh.material as THREE.MeshBasicMaterial).color.setHex(LOOK.veil);
    veil.mesh.name = 'murkjaw-gate-veil';
    // Before the arena's own listener, so the arena's teardown (which raises the crossing through the encounter) runs after.
    this.offs.push(
      ctx.events.on('save.loaded', () => this.rederive()),
      // The far exit works under aggro (K3): leaving the Deeps ends the fight as a death does, so the gate never stays shut
      // behind a player who walks back in through the main door (review B1).
      ctx.events.on('interior.exited', (e) => {
        if (e.interiorId === ARENA.interiorId) this.abandon();
      }),
    );
    this.arena = new BossArena(ctx, {
      tag: 'murkjaw',
      outcomeFlag: OUTCOME_FLAG,
      interiorId: ARENA.interiorId,
      trigger: ARENA.trigger,
      door: ARENA.door,
      centre: ARENA.centre,
      gate: ARENA.gate,
      gateClearance: ARENA.gateClearance,
      veilOffset: ARENA.veilOffset,
      veilPlacement: () => gateVeil(ctx),
      introSource: INTRO_SOURCE,
      veil,
      intro: {
        seconds: PRESENTATION.introSeconds,
        retrySeconds: PRESENTATION.retrySeconds,
        cueAt: PRESENTATION.introGurgleAt,
        cue: () => {
          try {
            ctx.services.get('audio')?.play(SFX.gurgle);
          } catch {
            // silent until the audio side registers the key
          }
        },
      },
      places: () => this.places(warn),
      makeEncounter: (places, model, onEnd) =>
        new MurkjawEncounter(ctx, {
          model,
          places,
          level: murkjawLevel((ctx.services.get as (n: string) => unknown)('enemies') as EnemiesPort | undefined),
          warn,
          onEnd: () => onEnd(),
          rng: opts.rng,
        }),
      makeModel: opts.makeModel,
      modelState: opts.modelState,
      armed: () => ctx.state.hasFlag(D05_STARTED_FLAG),
      gateClear: (feet) => gateIsClear(ctx, feet),
      insideForReload: (feet) => {
        const c = ctx.anchors.find(ARENA.centre);
        return !!c && new ArenaFrame(c.position).inHall(feet.x, feet.z);
      },
      warn,
    });
  }

  get current(): MurkjawEncounter | null {
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
    // Backstop for B1: a live fight with the player out of the hall (any other way out) for `ABANDON_SECONDS` ends.
    const e = this.arena.current;
    if (!e || !e.contested || !(dt > 0)) {
      this.outside = 0;
      return;
    }
    const c = this.ctx.anchors.find(ARENA.centre);
    const f = this.ctx.player.feet;
    const inside = !!c && new ArenaFrame(c.position).inHall(f.x, f.z) && Math.abs(f.y - c.position.y) < 12;
    this.outside = inside ? 0 : this.outside + dt;
    if (this.outside >= ABANDON_SECONDS) this.abandon();
  }

  private abandon(): void {
    this.outside = 0;
    if (this.arena.current || this.arena.introRunning) this.arena.abandon();
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.arena.dispose();
  }

  /** No fight survives a load: the crossing stands and the gate is open. */
  private rederive(): void {
    const interiors = (this.ctx.services.get as (n: string) => unknown)('interiors') as InteriorsPort | undefined;
    try {
      interiors?.setBlocker?.(ARENA.drop, true);
      interiors?.setBlocker?.(ARENA.gate, false);
    } catch (err) {
      console.warn(`[murkjaw] could not re-derive the arena blockers (${String(err)})`);
    }
  }

  private places(warn: (m: string) => void): MurkjawPlaces | null {
    const a = this.ctx.anchors;
    const centre = a.find(ARENA.centre);
    const door = a.find(ARENA.door);
    const surfaces = ARENA.surfaces.map((id) => a.find(id));
    const beaches = ARENA.beaches.map((id) => a.find(id));
    const racks = ARENA.racks.map((id) => a.find(id));
    const walkways = ARENA.walkways.map((id) => a.find(id));
    if (!centre || !door || [...surfaces, ...beaches, ...racks, ...walkways].some((x) => !x)) {
      if (!this.warnedPlaces) {
        this.warnedPlaces = true;
        warn(`arena anchors missing (${[ARENA.centre, ARENA.door, ...ARENA.surfaces, ...ARENA.beaches, ...ARENA.racks, ...ARENA.walkways].join(', ')}); Murkjaw does not start`);
      }
      return null;
    }
    const v = (p: { position: THREE.Vector3Like }) => new THREE.Vector3(p.position.x, p.position.y, p.position.z);
    return {
      centre: v(centre),
      floorY: centre.position.y,
      frame: new ArenaFrame(centre.position),
      surfaces: surfaces.map((s) => v(s!)),
      beaches: beaches.map((s) => v(s!)),
      racks: racks.map((s) => v(s!)),
      walkways: walkways.map((s) => v(s!)),
    };
  }
}

/** K3's gate blocker rect in Deeps-local metres. */
function localGate() {
  return DEEPS_DEF.blockers?.find((b) => b.id === ARENA.gate)?.rect ?? null;
}

/** The veil across K3's gate rect (it runs along z, so the veil turns a quarter). */
export function gateVeil(ctx: Pick<GameContext, 'anchors'>): { at: THREE.Vector3Like; yaw: number } | null {
  const gate = localGate();
  const c = ctx.anchors.find(ARENA.centre);
  if (!gate || !c) return null;
  const f = new ArenaFrame(c.position);
  const at = { x: (gate.x0 + gate.x1) / 2 + f.ox, y: c.position.y, z: (gate.z0 + gate.z1) / 2 + f.oz };
  const yaw = gate.x1 - gate.x0 >= gate.z1 - gate.z0 ? 0 : Math.PI / 2;
  return { at, yaw };
}

/**
 * Where the gate may close: the player stands wholly on the arena side of the gate rect (the hall lies west, at smaller x), by
 * `GATE_MARGIN`. Unknown anchors: clear (the arena's own radial test stands).
 */
export function gateIsClear(ctx: Pick<GameContext, 'anchors'>, feet: THREE.Vector3Like): boolean {
  const gate = localGate();
  const c = ctx.anchors.find(ARENA.centre);
  if (!gate || !c) return true;
  const f = new ArenaFrame(c.position);
  return feet.x <= gate.x0 + f.ox - GATE_MARGIN;
}

