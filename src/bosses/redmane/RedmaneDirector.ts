import * as THREE from 'three';
import { playEnsured } from '../../audio/act2SfxEnsure';
import { bossOutcomeFlag } from '../../actors/BossRegistry';
import { SCORCHHOLD_KEEP_DEF } from '../../cinderreach/scorchholdKeep';
import type { GameContext } from '../../core/Game';
import { BossArena, type BossModelState } from '../arena/BossArena';
import { AshVeil } from '../prior/priorFx';
import { RedmaneEncounter, type RedmanePlaces } from './RedmaneEncounter';
import type { RedmaneModel } from './RedmaneModel';
import { ARENA, D03_STARTED_FLAG, LOOK, PRESENTATION, REDMANE_BOSS_ID } from './tuning';

export const INTRO_SOURCE = 'bosses.redmane.intro';
export const OUTCOME_FLAG = bossOutcomeFlag(REDMANE_BOSS_ID);

export interface RedmaneDirectorOptions {
  makeModel?: () => RedmaneModel | null;
  modelState?: () => BossModelState;
  warn?: (message: string) => void;
}

/**
 * The D03 fight's lifecycle around one RedmaneEncounter (plans/act2-A8.md section 3), on the shared boss arena: A3's keep arena
 * trigger, armed only once `story.d03.started` is set (the flag the keep door's lock reads, written by A12; re-checked while the
 * player stands in the trigger), the intro and horn, the gate and its veil (3.5 m clearance for A3's door), and the reload rule
 * inside the arena rectangle only, so a load in the entry hall (the search points) is left alone.
 */
export class RedmaneDirector {
  private readonly arena: BossArena<RedmaneModel, RedmanePlaces, RedmaneEncounter>;
  private warnedPlaces = false;

  constructor(ctx: GameContext, opts: RedmaneDirectorOptions = {}) {
    const warn = opts.warn ?? ((m: string) => console.warn(`[thrandil-redmane] ${m}`));
    const veil = new AshVeil(14, 3);
    (veil.mesh.material as THREE.MeshBasicMaterial).color.setHex(LOOK.soot);
    veil.mesh.name = 'redmane-gate-veil';
    this.arena = new BossArena(ctx, {
      tag: 'thrandil-redmane',
      outcomeFlag: OUTCOME_FLAG,
      interiorId: ARENA.interiorId,
      trigger: ARENA.arenaTrigger,
      door: ARENA.arenaDoor,
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
        cueAt: PRESENTATION.introHornAt,
        begin: (model) => model?.play('idle', { loop: true }),
        cue: () => {
          try {
            const audio = ctx.services.get('audio');
            if (audio) playEnsured(audio, 'sfx.redmane.horn');
          } catch {
            // the audio thread owns the key
          }
        },
      },
      places: () => this.places(ctx, warn),
      makeEncounter: (places, model, onEnd) => new RedmaneEncounter(ctx, { model, places, warn, onEnd: () => onEnd() }),
      makeModel: opts.makeModel,
      modelState: opts.modelState,
      armed: () => ctx.state.hasFlag(D03_STARTED_FLAG),
      gateClear: (feet) => gateIsClear(ctx, feet),
      insideForReload: (feet) => {
        const c = ctx.anchors.find(ARENA.centre);
        if (!c) return false;
        const h = ARENA.reloadHalfExtent;
        return Math.abs(feet.x - c.position.x) <= h && Math.abs(feet.z - c.position.z) <= h;
      },
      warn,
    });
  }

  get current(): RedmaneEncounter | null {
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
  }

  dispose(): void {
    this.arena.dispose();
  }

  private places(ctx: GameContext, warn: (m: string) => void): RedmanePlaces | null {
    const centre = ctx.anchors.find(ARENA.centre);
    const door = ctx.anchors.find(ARENA.arenaDoor);
    if (!centre || !door) {
      if (!this.warnedPlaces) {
        this.warnedPlaces = true;
        warn(`arena anchors missing (${ARENA.centre}, ${ARENA.arenaDoor}); Redmane does not start`);
      }
      return null;
    }
    return { centre: new THREE.Vector3(centre.position.x, centre.position.y, centre.position.z), centreYaw: centre.yaw };
  }
}

/**
 * The veil across A3's real gate: the blocker rect's centre, spanning its long side. The keep is placed by translation only, so
 * the door anchor gives the local-to-world offset.
 */
export function gateVeil(ctx: Pick<GameContext, 'anchors'>): { at: THREE.Vector3Like; yaw: number } | null {
  const gate = SCORCHHOLD_KEEP_DEF.blockers?.find((b) => b.id === ARENA.gate)?.rect;
  const localDoor = SCORCHHOLD_KEEP_DEF.anchors.find((a) => a.id === ARENA.arenaDoor);
  const door = ctx.anchors.find(ARENA.arenaDoor);
  if (!gate || !localDoor || !door) return null;
  const ox = door.position.x - localDoor.x;
  const oz = door.position.z - localDoor.z;
  const at = { x: (gate.x0 + gate.x1) / 2 + ox, y: door.position.y, z: (gate.z0 + gate.z1) / 2 + oz };
  const yaw = gate.x1 - gate.x0 >= gate.z1 - gate.z0 ? 0 : Math.PI / 2;
  return { at, yaw };
}

/** The capsule half-width plus a margin: the gate closes only when the player stands this far past its arena side. */
export const GATE_MARGIN = 0.8;

/**
 * Where the gate may close: the player is wholly on the arena side of the blocker rect (yaw 0 faces -Z, so the arena lies at
 * smaller z), by `GATE_MARGIN`. A radial clearance from the door is not enough for a 14 m gate: a player at its side edge is
 * far from the door yet inside the rect. Unknown anchors: clear (the arena's own checks stand).
 */
export function gateIsClear(ctx: Pick<GameContext, 'anchors'>, feet: THREE.Vector3Like): boolean {
  const gate = SCORCHHOLD_KEEP_DEF.blockers?.find((b) => b.id === ARENA.gate)?.rect;
  const localDoor = SCORCHHOLD_KEEP_DEF.anchors.find((a) => a.id === ARENA.arenaDoor);
  const door = ctx.anchors.find(ARENA.arenaDoor);
  if (!gate || !localDoor || !door) return true;
  const oz = door.position.z - localDoor.z;
  return feet.z <= gate.z0 + oz - GATE_MARGIN;
}
