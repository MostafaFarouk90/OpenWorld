import * as THREE from 'three';
import { playEnsured } from '../../audio/act2SfxEnsure';
import { bossOutcomeFlag } from '../../actors/BossRegistry';
import type { GameContext } from '../../core/Game';
import { UNDERWAYS_DEF } from '../../interiors/underways/generate';
import { BossArena, type BossModelState } from '../arena/BossArena';
import { AshVeil } from '../prior/priorFx';
import { GrimtoothEncounter, type GrimtoothPlaces } from './GrimtoothEncounter';
import type { GrimtoothModel } from './GrimtoothModel';
import { ARENA, D02, GRIMTOOTH_BOSS_ID, LOOK, PRESENTATION } from './tuning';

export const INTRO_SOURCE = 'bosses.grimtooth.intro';
export const OUTCOME_FLAG = bossOutcomeFlag(GRIMTOOTH_BOSS_ID);

export interface GrimtoothDirectorOptions {
  makeModel?: () => GrimtoothModel | null;
  modelState?: () => BossModelState;
  warn?: (message: string) => void;
}

/**
 * The D02 fight's lifecycle around one GrimtoothEncounter (plans/slice-2-grimtooth.md sections 6 and 11), on the shared
 * boss arena: 3a's Underways arena trigger, armed only once D02's hound objective is done (re-checked on quest changes
 * while the player stands in the trigger), the intro and howl, the gate and its soot veil (5 m clearance for 3a's door),
 * and the reload rule inside the arena rectangle only, so a load never skips the kennels.
 */
export class GrimtoothDirector {
  private readonly arena: BossArena<GrimtoothModel, GrimtoothPlaces, GrimtoothEncounter>;
  private warnedPlaces = false;

  constructor(ctx: GameContext, opts: GrimtoothDirectorOptions = {}) {
    const warn = opts.warn ?? ((m: string) => console.warn(`[gaffer-grimtooth] ${m}`));
    const veil = new AshVeil();
    (veil.mesh.material as THREE.MeshBasicMaterial).color.setHex(LOOK.soot);
    veil.mesh.name = 'grimtooth-soot-veil';
    this.arena = new BossArena(ctx, {
      tag: 'gaffer-grimtooth',
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
        cueAt: PRESENTATION.introHowlAt,
        begin: (model) => model?.play('crouch'),
        cue: (model) => {
          model?.play('howl');
          try {
            const audio = ctx.services.get('audio');
            if (audio) playEnsured(audio, 'sfx.grimtooth.howl');
          } catch {
            // thread 9 owns the key
          }
        },
      },
      places: () => this.places(ctx, warn),
      makeEncounter: (places, model, onEnd) => new GrimtoothEncounter(ctx, { model, places, warn, onEnd: () => onEnd() }),
      makeModel: opts.makeModel,
      modelState: opts.modelState,
      armed: () => {
        const quests = ctx.services.get('quests');
        if (!quests) return true;
        return quests.objectiveDone(D02.questId, D02.houndObjective) || quests.state(D02.questId) === 'completed';
      },
      insideForReload: (feet) => {
        const c = ctx.anchors.find(ARENA.centre);
        if (!c) return false;
        const h = ARENA.reloadHalfExtent;
        return Math.abs(feet.x - c.position.x) <= h && Math.abs(feet.z - c.position.z) <= h;
      },
      warn,
    });
  }

  get current(): GrimtoothEncounter | null {
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

  private places(ctx: GameContext, warn: (m: string) => void): GrimtoothPlaces | null {
    const centre = ctx.anchors.find(ARENA.centre);
    const door = ctx.anchors.find(ARENA.arenaDoor);
    if (!centre || !door) {
      if (!this.warnedPlaces) {
        this.warnedPlaces = true;
        warn(`arena anchors missing (${ARENA.centre}, ${ARENA.arenaDoor}); Grimtooth does not start`);
      }
      return null;
    }
    return { centre: new THREE.Vector3(centre.position.x, centre.position.y, centre.position.z), centreYaw: centre.yaw };
  }
}

/**
 * The veil across 3a's real gate: the blocker rect's centre, spanning its long side (review should-fix 3: the door-to-centre
 * line runs 27 degrees off the corridor, so the default placement would skew it into the wall). 3a's interior is placed by
 * translation only, so the door anchor gives the local-to-world offset.
 */
export function gateVeil(ctx: Pick<GameContext, 'anchors'>): { at: THREE.Vector3Like; yaw: number } | null {
  const gate = UNDERWAYS_DEF.blockers?.find((b) => b.id === ARENA.gate)?.rect;
  const localDoor = UNDERWAYS_DEF.anchors.find((a) => a.id === ARENA.arenaDoor);
  const door = ctx.anchors.find(ARENA.arenaDoor);
  if (!gate || !localDoor || !door) return null;
  const ox = door.position.x - localDoor.x;
  const oz = door.position.z - localDoor.z;
  const at = { x: (gate.x0 + gate.x1) / 2 + ox, y: door.position.y, z: (gate.z0 + gate.z1) / 2 + oz };
  // The veil plane spans its local X at yaw 0: across a gate that is wider in X, else turned a quarter.
  const yaw = gate.x1 - gate.x0 >= gate.z1 - gate.z0 ? 0 : Math.PI / 2;
  return { at, yaw };
}
