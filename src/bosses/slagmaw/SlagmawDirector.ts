import * as THREE from "three";
import { bossOutcomeFlag } from "../../actors/BossRegistry";
import type { GameContext } from "../../core/Game";
import { BossArena, type BossModelState } from "../arena/BossArena";
import { AshVeil } from "../prior/priorFx";
import { SlagmawEncounter, type SlagmawPlaces } from "./SlagmawEncounter";
import type { SlagmawModel } from "./SlagmawModel";
import {
  ARENA,
  D04_STARTED_FLAG,
  LOOK,
  PRESENTATION,
  SLAGMAW_BOSS_ID,
} from "./tuning";

export const INTRO_SOURCE = "bosses.slagmaw.intro";
export const OUTCOME_FLAG = bossOutcomeFlag(SLAGMAW_BOSS_ID);

export interface SlagmawDirectorOptions {
  makeModel?: () => SlagmawModel | null;
  modelState?: () => BossModelState;
  warn?: (message: string) => void;
}

/**
 * The D04 fight's lifecycle around one SlagmawEncounter (plans/act2-A8.md, "PR 2"), on the shared boss arena: A4's Deepdelve arena
 * trigger, armed only once `story.d04.started` is set (re-checked while the player stands in the trigger), the intro and the
 * rumble, the gate and its veil, and the reload rule inside the arena rectangle only. A4's anchors are not on main yet: with
 * any of them missing the director warns once and the fight does not start.
 */
export class SlagmawDirector {
  private readonly arena: BossArena<
    SlagmawModel,
    SlagmawPlaces,
    SlagmawEncounter
  >;
  private warnedPlaces = false;

  constructor(ctx: GameContext, opts: SlagmawDirectorOptions = {}) {
    const warn =
      opts.warn ?? ((m: string) => console.warn(`[the-slagmaw] ${m}`));
    const veil = new AshVeil(14, 3);
    (veil.mesh.material as THREE.MeshBasicMaterial).color.setHex(
      LOOK.veilColor,
    );
    veil.mesh.name = "slagmaw-gate-veil";
    this.arena = new BossArena(ctx, {
      tag: "the-slagmaw",
      outcomeFlag: OUTCOME_FLAG,
      interiorId: ARENA.interiorId,
      trigger: ARENA.arenaTrigger,
      door: ARENA.arenaDoor,
      centre: ARENA.centre,
      gate: ARENA.gate,
      gateClearance: ARENA.gateClearance,
      veilOffset: ARENA.veilOffset,
      introSource: INTRO_SOURCE,
      veil,
      intro: {
        seconds: PRESENTATION.introSeconds,
        retrySeconds: PRESENTATION.retrySeconds,
        cueAt: PRESENTATION.introRumbleAt,
        cue: () => {
          try {
            ctx.services.get("audio")?.play("sfx.slagmaw.rumble");
          } catch {
            // the audio thread owns the key
          }
        },
      },
      places: () => this.places(ctx, warn),
      makeEncounter: (places, model, onEnd) =>
        new SlagmawEncounter(ctx, {
          model,
          places,
          warn,
          onEnd: () => onEnd(),
        }),
      makeModel: opts.makeModel,
      modelState: opts.modelState,
      armed: () => ctx.state.hasFlag(D04_STARTED_FLAG),
      // A4's gate blocker is not on main: the arena's own radial clearance stands until its rect is known.
      gateClear: () => true,
      insideForReload: (feet) => {
        const c = ctx.anchors.find(ARENA.centre);
        if (!c) return false;
        const h = ARENA.reloadHalfExtent;
        return (
          Math.abs(feet.x - c.position.x) <= h &&
          Math.abs(feet.z - c.position.z) <= h
        );
      },
      warn,
    });
  }

  get current(): SlagmawEncounter | null {
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

  private places(
    ctx: GameContext,
    warn: (m: string) => void,
  ): SlagmawPlaces | null {
    const centre = ctx.anchors.find(ARENA.centre);
    const door = ctx.anchors.find(ARENA.arenaDoor);
    const valves = ARENA.valves.map((id) => ctx.anchors.find(id));
    if (!centre || !door || valves.some((v) => !v)) {
      if (!this.warnedPlaces) {
        this.warnedPlaces = true;
        warn(
          `arena anchors missing (${[ARENA.centre, ARENA.arenaDoor, ...ARENA.valves].join(", ")}); the Slagmaw does not start`,
        );
      }
      return null;
    }
    return {
      centre: new THREE.Vector3(
        centre.position.x,
        centre.position.y,
        centre.position.z,
      ),
      centreYaw: centre.yaw,
      valves: valves.map(
        (v) => new THREE.Vector3(v!.position.x, v!.position.y, v!.position.z),
      ),
    };
  }
}
