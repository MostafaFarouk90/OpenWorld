import * as THREE from "three";
import { bossOutcomeFlag } from "../../actors/BossRegistry";
import { ensureAct2Sfx } from "../../audio/act2SfxEnsure";
import type { GameContext } from "../../core/Game";
import { DEEPDELVE_DEF } from "../../oldsmoke/mines/deepdelve";
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
 * rumble, the gate and its veil (both fitted to A4's real 4 m gate blocker), and the reload rule inside the arena rectangle
 * only. With any of the anchors missing the director warns once and the fight does not start.
 */
export class SlagmawDirector {
  private readonly arena: BossArena<
    SlagmawModel,
    SlagmawPlaces,
    SlagmawEncounter
  >;
  private warnedPlaces = false;
  /** The last attempt could not mount its valves: stay unarmed (no retry every interval) until the next trigger enter. */
  private mountFailed = false;
  private readonly offs: (() => void)[] = [];

  constructor(ctx: GameContext, opts: SlagmawDirectorOptions = {}) {
    const warn =
      opts.warn ?? ((m: string) => console.warn(`[the-slagmaw] ${m}`));
    // Registered before the arena's own enter handler, so a fresh enter clears the failure before the arena re-arms.
    const player = () => ctx.player.actor.id;
    this.offs.push(
      ctx.events.on("trigger.enter", (e) => {
        if (e.triggerId === ARENA.arenaTrigger && e.actorId === player())
          this.mountFailed = false;
      }),
      ctx.events.on("actor.died", (e) => {
        if (e.actorId === player()) this.mountFailed = false;
      }),
    );
    const veil = new AshVeil(ARENA.veilWidth, ARENA.veilHeight);
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
      veilPlacement: () => gateVeil(ctx),
      introSource: INTRO_SOURCE,
      veil,
      intro: {
        seconds: PRESENTATION.introSeconds,
        retrySeconds: PRESENTATION.retrySeconds,
        cueAt: PRESENTATION.introRumbleAt,
        cue: () => {
          try {
            ensureAct2Sfx("sfx.slagmaw.rumble");
            ctx.services.get("audio")?.play("sfx.slagmaw.rumble");
          } catch {
            // the audio thread owns the key
          }
        },
      },
      places: () => this.places(ctx, warn),
      makeEncounter: (places, model, onEnd) => {
        const encounter: SlagmawEncounter = new SlagmawEncounter(ctx, {
          model,
          places,
          warn,
          onEnd: () => {
            if (encounter.mountFailed) this.mountFailed = true;
            onEnd();
          },
        });
        return encounter;
      },
      makeModel: opts.makeModel,
      modelState: opts.modelState,
      armed: () => !this.mountFailed && ctx.state.hasFlag(D04_STARTED_FLAG),
      gateClear: (feet) => gateIsClear(ctx, feet),
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
    for (const off of this.offs.splice(0)) off();
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

/** A4's gate blocker rect and door anchor, in Deepdelve-local metres. */
function localGate() {
  const gate = DEEPDELVE_DEF.blockers?.find((b) => b.id === ARENA.gate)?.rect;
  const door = DEEPDELVE_DEF.anchors.find((a) => a.id === ARENA.arenaDoor);
  return gate && door ? { gate, door } : null;
}

/**
 * The veil across A4's real gate: the blocker rect's centre, spanning its long side (the Deepdelve gate runs along z, so the
 * veil turns a quarter). Interiors are placed by translation only, so the door anchor gives the local-to-world offset.
 */
export function gateVeil(
  ctx: Pick<GameContext, "anchors">,
): { at: THREE.Vector3Like; yaw: number } | null {
  const local = localGate();
  const door = ctx.anchors.find(ARENA.arenaDoor);
  if (!local || !door) return null;
  const { gate } = local;
  const ox = door.position.x - local.door.x;
  const oz = door.position.z - local.door.z;
  const at = {
    x: (gate.x0 + gate.x1) / 2 + ox,
    y: door.position.y,
    z: (gate.z0 + gate.z1) / 2 + oz,
  };
  const yaw = gate.x1 - gate.x0 >= gate.z1 - gate.z0 ? 0 : Math.PI / 2;
  return { at, yaw };
}

/** The capsule half-width plus a margin: the gate closes only when the player stands this far past its arena side. */
export const GATE_MARGIN = 0.8;

/**
 * Where the gate may close: the player is wholly on the arena side of the blocker rect (the arena lies east, at larger x), by
 * `GATE_MARGIN`. The trigger starts only 0.5 m past the rect, so the arena's radial clearance alone could shut the blocker on
 * a player standing in it. Unknown anchors: clear (the arena's own checks stand).
 */
export function gateIsClear(
  ctx: Pick<GameContext, "anchors">,
  feet: THREE.Vector3Like,
): boolean {
  const local = localGate();
  const door = ctx.anchors.find(ARENA.arenaDoor);
  if (!local || !door) return true;
  const ox = door.position.x - local.door.x;
  return feet.x >= local.gate.x1 + ox + GATE_MARGIN;
}
