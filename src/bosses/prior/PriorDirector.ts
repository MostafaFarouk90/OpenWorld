import * as THREE from 'three';
import { bossOutcomeFlag } from '../../actors/BossRegistry';
import type { GameContext } from '../../core/Game';
import { BossArena, type BossModelState } from '../arena/BossArena';
import { PriorEncounter, type PriorPlaces } from './PriorEncounter';
import type { PriorModel } from './PriorModel';
import { AshVeil } from './priorFx';
import { PRESENTATION, PRIOR_BOSS_ID, VAULT } from './tuning';

export type { InteriorsPort } from '../arena/BossArena';

export const INTRO_SOURCE = 'bosses.prior.intro';
export const OUTCOME_FLAG = bossOutcomeFlag(PRIOR_BOSS_ID);
/** The gate closes only once the player is this far past the door, so it never shuts on their feet. */
export const GATE_CLEARANCE = 4;
/** The veil plane sits this far from the door toward the arena (3a's gate spans 1 to 3 m in). */
export const VEIL_OFFSET = 2;

/** See `BossModelState`: a real game never starts the Prior without the Mage (review S2). */
export type PriorModelState = BossModelState;

export interface PriorDirectorOptions {
  /** A fresh Prior model (called only in state 'ready'); a throw refuses the start with a warning. */
  makeModel?: () => PriorModel | null;
  modelState?: () => PriorModelState;
  warn?: (message: string) => void;
}

/**
 * The D01 fight's lifecycle around one PriorEncounter (plans/slice-2-ashen-prior.md sections 3.5, 3.6 and 10), on the
 * shared boss arena: the vault trigger, the intro (camera override, a frozen player, the reverse dissolve and the gong),
 * registering after the intro, the gate and its ash veil, and the reset rules. A beaten Prior never comes back.
 */
export class PriorDirector {
  private readonly arena: BossArena<PriorModel, PriorPlaces, PriorEncounter>;
  private warnedPlaces = false;

  constructor(ctx: GameContext, opts: PriorDirectorOptions = {}) {
    const warn = opts.warn ?? ((m: string) => console.warn(`[ashen-prior] ${m}`));
    this.arena = new BossArena(ctx, {
      tag: 'ashen-prior',
      outcomeFlag: OUTCOME_FLAG,
      interiorId: VAULT.interiorId,
      trigger: VAULT.arenaTrigger,
      door: VAULT.arenaDoor,
      centre: VAULT.centre,
      gate: VAULT.gate,
      gateClearance: GATE_CLEARANCE,
      veilOffset: VEIL_OFFSET,
      introSource: INTRO_SOURCE,
      veil: new AshVeil(),
      intro: {
        seconds: PRESENTATION.introSeconds,
        retrySeconds: PRESENTATION.retrySeconds,
        cueAt: PRESENTATION.introGongAt,
        begin: (model, first) => {
          const vfx = ctx.services.get('vfx');
          if (!model || !vfx) return;
          const rise = first ? PRESENTATION.introRiseSeconds : PRESENTATION.retrySeconds;
          void vfx.dissolve(model.root, rise, { tint: PRESENTATION.teleportTint, reverse: true }).catch(() => {});
        },
        cue: (model) => {
          try {
            ctx.services.get('audio')?.play('sfx.prior.gong');
          } catch {
            // thread 9 registers it; a missing key is not worth a second warning here
          }
          model?.play('censerLift');
        },
      },
      places: () => this.places(ctx, warn),
      makeEncounter: (places, model, onEnd) => new PriorEncounter(ctx, { model, places, warn, onEnd: () => onEnd() }),
      makeModel: opts.makeModel,
      modelState: opts.modelState,
      warn,
    });
  }

  /** The running encounter (tests, integration). */
  get current(): PriorEncounter | null {
    return this.arena.current;
  }

  /** A start is waiting for the Mage to load. */
  get waitingForModel(): boolean {
    return this.arena.waitingForModel;
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

  private places(ctx: GameContext, warn: (m: string) => void): PriorPlaces | null {
    const a = ctx.anchors;
    const centre = a.find(VAULT.centre);
    const door = a.find(VAULT.arenaDoor);
    const pillars = VAULT.pillars.map((id) => a.find(id));
    if (!centre || !door || pillars.some((p) => !p)) {
      if (!this.warnedPlaces) {
        this.warnedPlaces = true;
        warn('vault anchors missing (vault.arena.centre, vault.arena.door, vault.pillar.1..4); the Prior does not start');
      }
      return null;
    }
    const v = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
    return { centre: v(centre.position), centreYaw: centre.yaw, pillars: pillars.map((p) => v(p!.position)) };
  }
}
