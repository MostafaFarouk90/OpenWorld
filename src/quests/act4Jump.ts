// `?act4=<quest>&new` (dev and smoke only, contracts v0.8 item 18): jumps a fresh game into Act 4 before any fixture exists
// (L13 PR 1 owns the deterministic `act4-*.json` fixtures on this plumbing). Acts 1 to 3 are replayed through the shipped
// `?act3=` runner (Act 3 in order greyfen, to D06 complete) with every ending card and camp marked seen, so no card plays
// over the player. Then `story.gate.a4` is set, the Act 4 prerequisites are injected the Act 3 way (`story.<id>.complete`,
// plus start and complete when the quests service knows the id), and the player's XP is topped up to ACT4_START_XP. A Phase H
// target also sets `story.phase.wasteOpen` until L13 retires that hold. The player lands at the giver's post at the 1.8 m
// stand-off (ACT4_GIVER_STAND_OFF) when the giver is placed, else at the phase's placeholder point: the Harrowmark South Gate
// road (outside the ring wall, so the no-strand rule never applies) or Ashgate.
import { act3Prereqs, Act3Jump, type Act3JumpPorts } from './act3Jump';
import { actEnding } from '../integration/actEndings';
import { NPC_TUNING } from '../npcs/tuning';
import { ACT4_GATE_FLAG } from '../region/regions';
import { ASHGATE_POINT } from '../region/act4Containment';
import { registerActJump } from './actJump';
import { ACT2_JUMP_CLASSES } from './act2Jump';

/** Plan 2.1 to 2.3, in play order. */
export const ACT4_PHASE_G = ['m35', 'm36', 'r19', 'r20', 'r21', 'r22', 'r23', 'd07', 'm37', 'm38', 'm39', 'm40', 'm41'] as const;
export const ACT4_PHASE_H = ['m42', 'm43', 'm44', 'r25', 'r24', 'm45', 'd08', 'm46'] as const;
export const ACT4_JUMP_IDS: readonly string[] = [...ACT4_PHASE_G, ...ACT4_PHASE_H];

const PHASE_G_BEFORE_M37 = ['m35', 'm36', 'r19', 'r20', 'r21', 'r22', 'r23', 'd07'];

/** Plan 2.5, direct prerequisites inside Act 4 (`story.gate.a4` opens M35). Q12: M37 and M46 wait on every quest of their phase. */
export const ACT4_DIRECT: Readonly<Record<string, readonly string[]>> = {
  m35: [], m36: ['m35'], r19: ['m35'], r22: ['m35'], r23: ['m35'], d07: ['m35', 'r23'], r20: ['m36'], r21: ['m36'],
  m37: PHASE_G_BEFORE_M37, m38: ['m37'], m39: ['m38'], m40: ['m39'], m41: ['m40'],
  m42: ['m41'], m43: ['m42'], m44: ['m43'], r24: ['m43'], d08: ['m43'], r25: ['m44'], m45: ['m44'],
  m46: ['m42', 'm43', 'm44', 'm45', 'd08', 'r24', 'r25'],
};

function closure(id: string, out = new Set<string>()): Set<string> {
  for (const d of ACT4_DIRECT[id] ?? []) {
    if (out.has(d)) continue;
    out.add(d);
    closure(d, out);
  }
  return out;
}

/** `ACT4_PREREQS[id]`: the Act 4 quests done before `id`, in play order. Acts 1 to 3 are not listed (always replayed). */
export const ACT4_PREREQS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  ACT4_JUMP_IDS.map((id) => {
    const own = closure(id);
    return [id, ACT4_JUMP_IDS.filter((q) => own.has(q))];
  }),
);
registerActJump(4, { prereqs: ACT4_PREREQS });

export type Act4Phase = 'G' | 'H';
export function phaseOf(id: string): Act4Phase | undefined {
  if ((ACT4_PHASE_G as readonly string[]).includes(id)) return 'G';
  if ((ACT4_PHASE_H as readonly string[]).includes(id)) return 'H';
  return undefined;
}

/** Plan 2.1 to 2.3 givers (NPC ids; L2, L4 and L1 place them). A giver not placed yet lands at the placeholder. */
export const ACT4_GIVERS: Readonly<Record<string, string>> = {
  m35: 'wystan', m36: 'merrin', r19: 'wystan', r20: 'merrin', r21: 'wenna', r22: 'dunstan', r23: 'rook', d07: 'rook',
  m37: 'tobb', m38: 'edric', m39: 'gaut', m40: 'rook', m41: 'edric',
  m42: 'wulfhild', m43: 'wulfhild', m44: 'ebba', r25: 'ebba', r24: 'wulfhild', m45: 'wulfhild', d08: 'wulfhild', m46: 'hrolf',
};

/** Plan 7.2: Act 4 starts at about 64,000 XP (full play, level 26 to 27). Never Act 3's 23,500 floor. */
export const ACT4_START_XP = 64_000;
/** The Act 2 rule: inside the talk radius with margin. */
export const ACT4_GIVER_STAND_OFF = NPC_TUNING.talkRadius - 0.7;
/** Phase H's hold (Q11); L13 retires it, and the jump stops writing it then. */
export const WASTE_OPEN_FLAG = 'story.phase.wasteOpen';

/**
 * Placeholder landings before the givers exist: the South Gate road, 30 m south of the Harrowmark-gate stone (outside the
 * 760 m ring wall), and Ashgate (outside the Waste's edge; the Ash Road opens on M41, which every Phase H target has done).
 */
export const ACT4_PLACEHOLDER: Readonly<Record<Act4Phase, { x: number; z: number }>> = {
  G: { x: 8516, z: 1180 },
  H: { x: ASHGATE_POINT.x, z: ASHGATE_POINT.z },
};

export function parseAct4(search: string): { id: string; classId: string; fresh: true } | { error: string } | null {
  const params = new URLSearchParams(search);
  const raw = params.get('act4');
  if (raw === null) return null;
  if (!ACT4_JUMP_IDS.includes(raw)) return { error: `unknown quest "${raw}" (one of ${ACT4_JUMP_IDS.join(', ')})` };
  if (!params.has('new')) return { error: 'needs &new so the jump never runs over a real save' };
  const classId = params.get('class') ?? 'knight';
  if (!(ACT2_JUMP_CLASSES as readonly string[]).includes(classId)) return { error: `unknown class "${classId}"` };
  return { id: raw, classId, fresh: true };
}

export interface Act4Pose { x: number; y: number; z: number; yaw: number }

export interface Act4JumpPorts extends Act3JumpPorts {
  /** The giver's post now (position and facing); undefined until its thread places it. */
  giverPose?(npcId: string): Act4Pose | undefined;
  /** Places the player at a pose (`y` omitted: on the ground); false while it cannot yet (retry). */
  placePose(at: { x: number; y?: number; z: number }, yaw: number): boolean;
  /** Counts the replay's expected refusals instead of printing each; called with false once, at the end. */
  quiet?(on: boolean): void;
}

/** The landing for `id`: in front of the giver at the stand-off, facing them; else the phase placeholder. */
export function act4Landing(id: string, pose: Act4Pose | undefined): { at: { x: number; z: number; y?: number }; yaw: number; giver: boolean } {
  if (pose) {
    // Yaw 0 faces -Z (NpcBehavior): stand in front of the giver, turned to face them.
    const fx = -Math.sin(pose.yaw);
    const fz = -Math.cos(pose.yaw);
    return { at: { x: pose.x + fx * ACT4_GIVER_STAND_OFF, y: pose.y, z: pose.z + fz * ACT4_GIVER_STAND_OFF }, yaw: pose.yaw + Math.PI, giver: true };
  }
  return { at: { ...ACT4_PLACEHOLDER[phaseOf(id) ?? 'G'] }, yaw: 0, giver: false };
}

export type Act4JumpPhase = 'replay' | 'act3-end' | 'act4' | 'quiet' | 'place' | 'done';

export const QUIET_TICKS = 6;

/** Ticked once per rules step until `done`. */
export class Act4Jump {
  phase: Act4JumpPhase = 'replay';
  private readonly inner: Act3Jump;
  private quietTicks = 0;

  constructor(
    readonly id: string,
    private readonly ports: Act4JumpPorts,
    readonly classId = 'knight',
  ) {
    // The Act 3 runner to D06 (order greyfen) does Acts 1 to 3 except D06 itself; its own placement is skipped.
    this.inner = new Act3Jump('d06', 'greyfen', { ...ports, placeAt: () => true }, classId);
  }

  get finished(): boolean { return this.phase === 'done'; }

  /**
   * L13 (additive): on a game already carried through the whole of Act 3 (the Act 4 fixtures' base save), skip the Acts 1 to
   * 3 replay and the Act 3 ending step; only the Act 4 injection, the XP top-up and the placement run.
   */
  fromCarriedSave(): this {
    this.phase = 'act4';
    return this;
  }

  tick(): void {
    if (this.finished) return;
    const p = this.ports;
    if (this.phase === 'replay') {
      if (this.inner.phase === 'waiting' && p.ready() && p.tutorial()) p.quiet?.(true);
      this.inner.tick();
      if (!this.inner.finished) return;
      this.phase = 'act3-end';
    }
    if (this.phase === 'act3-end') {
      // Both Act 3 seen flags before D06 completes, so the ending card and the camp never play over the player.
      const a3 = actEnding(3);
      if (a3) for (const f of [a3.cardSeenFlag, a3.campSeenFlag]) p.setFlag(f, true);
      this.inject('d06', 'act3');
      p.rekindle('frostfang-aerie');
      p.setFlag(ACT4_GATE_FLAG, true);
      this.phase = 'act4';
    }
    if (this.phase === 'act4') {
      const prereqs = ACT4_PREREQS[this.id] ?? [];
      if (phaseOf(this.id) === 'H') p.setFlag(WASTE_OPEN_FLAG, true);
      for (const q of prereqs) this.inject(q, 'act4');
      p.topUpXp?.(ACT4_START_XP);
      this.phase = 'quiet';
    }
    if (this.phase === 'quiet') {
      if (p.closeDialogue?.()) this.quietTicks = 0;
      else if (++this.quietTicks >= QUIET_TICKS) {
        p.quiet?.(false);
        this.phase = 'place';
      }
      return;
    }
    if (this.phase === 'place') {
      const land = act4Landing(this.id, p.giverPose?.(ACT4_GIVERS[this.id]));
      if (p.placePose(land.at, land.yaw)) this.phase = 'done';
    }
  }

  private inject(q: string, tag: string): void {
    const p = this.ports;
    if (p.hasQuest(q)) {
      if (p.quests.state(q) === 'inactive') p.quests.start(q);
      if (p.quests.state(q) !== 'completed' && !p.quests.complete(q)) p.warn(`${tag}: could not complete ${q}`);
    }
    p.setFlag(`story.${q}.complete`, true);
  }
}

/** The Act 4 ending row's seen flags (for L13's fixtures; the jump never reaches the Act 4 ending). */
export function act4EndingSeenFlags(): readonly string[] {
  const a4 = actEnding(4);
  return a4 ? [a4.cardSeenFlag, a4.campSeenFlag] : [];
}

/** True when `id`'s replay includes D06 (always: Act 4 needs the whole of Act 3). */
export const ACT4_ACT3_REPLAY: readonly string[] = [...act3Prereqs('d06', 'greyfen'), 'd06'];
