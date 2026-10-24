// `?act3=<quest>&new&order=greyfen|spine` (dev and smoke only, contracts v0.7 item 22): jumps a fresh game into Act 3 before
// any fixture exists (K16 owns the deterministic fixtures on this plumbing). Act 1 and Act 2 are replayed through the shipped
// runners with both act endings marked seen, so neither card plays over the player; `story.gate.a3` is set before the teleport
// (and `story.phase.dragonspineOpen` for any jump that needs the Dragonspine, since Phase E holds it). The Act 3 prerequisites
// are then completed by flag injection in the chosen block order: every prerequisite gets `story.<id>.complete`, and a quest
// the quests service knows is also started and completed there (so its own effects run once the quest threads land). The
// player is placed at the target block's waystone point (plan Part 3.5) until K1's giver anchors exist.
//
// Order semantics (read by K16's fixtures): `order` names the block the player did FIRST. A target in the first block needs
// only its own prerequisites inside that block. A target in the second block needs the whole first block, then its own. A
// summit target needs its prerequisites from the first block, then from the second, then from the summit, in that order.
// Each block's level is locked when its lock quest (M23, M28) is injected, after the shrines of everything injected before
// it are lit, so the second block's lock sees the first block's Warmth (design 5.9). `order` defaults to `greyfen`.
import { ACT1_CAMP_SEEN_FLAG, ACT1_CARD_SEEN_FLAG, ACT1_CARD_SEEN_FLAG_V06, ACT1_GATE_FLAG } from '../integration/act1Ending';
import { actEnding } from '../integration/actEndings';
import { ACT3_BLOCKS, type Act3BlockId } from '../enemies/level';
import { ACT1_PREREQS, completeAct1Quest, type Act1JumpPorts } from './act1Jump';
import { ACT2_JUMP_CLASSES, completeAct2Quest } from './act2Jump';
import { ACT2_PREREQS, registerActJump } from './actJump';

export type Act3Order = 'greyfen' | 'spine';
export const ACT3_ORDERS: readonly Act3Order[] = ['greyfen', 'spine'];

/** Each block's quests in table order (plan 2.1 to 2.3). */
export const ACT3_GREYFEN = ['m23', 'm24', 'r12', 'm25', 'r14', 'r13', 'm26', 'm27', 'd05'] as const;
export const ACT3_SPINE = ['m28', 'r15', 'm29', 'r16', 'm30', 'r17', 'r18'] as const;
export const ACT3_SUMMIT = ['m31', 'm32', 'm33', 'm34', 'd06'] as const;
export const ACT3_JUMP_IDS: readonly string[] = [...ACT3_GREYFEN, ...ACT3_SPINE, ...ACT3_SUMMIT];

const GREYFEN_MAIN = ['m23', 'm24', 'm25', 'm26', 'm27', 'd05'];
const SPINE_MAIN = ['m28', 'm29', 'm30'];

/** Plan 2.5, direct prerequisites inside Act 3 (`story.gate.a3` opens M23 and M28). */
export const ACT3_DIRECT: Readonly<Record<string, readonly string[]>> = {
  m23: [], m24: ['m23'], r14: ['m23'], m25: ['m24'], r12: ['m24'], m26: ['m25'], r13: ['m25'], m27: ['m26', 'r14'], d05: ['m27'],
  m28: [], m29: ['m28'], r15: ['m28'], r18: ['m28'], m30: ['m29'], r16: ['m29'], r17: ['m30'],
  m31: [...GREYFEN_MAIN, ...SPINE_MAIN, 'r16'],
  m32: ['m31'], m33: ['m32'],
  m34: [...GREYFEN_MAIN, ...SPINE_MAIN, 'm31', 'm32', 'm33', 'r12', 'r13', 'r14', 'r15', 'r16', 'r17', 'r18'],
  d06: ['m34'],
};

export type Act3BlockOf = 'greyfen' | 'spine' | 'summit';
export function blockOf(id: string): Act3BlockOf | undefined {
  if ((ACT3_GREYFEN as readonly string[]).includes(id)) return 'greyfen';
  if ((ACT3_SPINE as readonly string[]).includes(id)) return 'spine';
  if ((ACT3_SUMMIT as readonly string[]).includes(id)) return 'summit';
  return undefined;
}

function closure(id: string, out = new Set<string>()): Set<string> {
  for (const d of ACT3_DIRECT[id] ?? []) {
    if (out.has(d)) continue;
    out.add(d);
    closure(d, out);
  }
  return out;
}

/** The Act 3 quests done before `id` in the given order, in play order (see the header for the semantics). */
export function act3Prereqs(id: string, order: Act3Order): readonly string[] {
  const block = blockOf(id);
  if (!block) return [];
  const [first, second] = order === 'greyfen' ? [ACT3_GREYFEN, ACT3_SPINE] : [ACT3_SPINE, ACT3_GREYFEN];
  const own = closure(id);
  const pick = (list: readonly string[]) => list.filter((q) => own.has(q));
  if (block === 'summit') return [...pick(first), ...pick(second), ...pick(ACT3_SUMMIT)];
  const ownList = block === 'greyfen' ? ACT3_GREYFEN : ACT3_SPINE;
  return ownList === first ? pick(first) : [...first, ...pick(second)];
}

/** `ACT3_PREREQS[order][id]`: Act 1 and Act 2 are not listed (the jump always replays them first). */
export const ACT3_PREREQS: Readonly<Record<Act3Order, Readonly<Record<string, readonly string[]>>>> = {
  greyfen: Object.fromEntries(ACT3_JUMP_IDS.map((id) => [id, act3Prereqs(id, 'greyfen')])),
  spine: Object.fromEntries(ACT3_JUMP_IDS.map((id) => [id, act3Prereqs(id, 'spine')])),
};
// The shared registry holds the default order; `?act3=` itself reads `order` (parseAct3).
registerActJump(3, { prereqs: ACT3_PREREQS.greyfen });

/** All of Act 2: every quest the ending waits on, then M22. */
export const ACT2_ALL: readonly string[] = [...ACT2_PREREQS.ending, 'm22'];
const ACT1_ALL: readonly string[] = [...ACT1_PREREQS.d02, 'd02'];

/** The shrines a prerequisite lights in real play (plan 2.1 to 2.3); injected with the quest so the Warmth Tier follows. */
export const ACT3_SHRINE_AFTER: Readonly<Record<string, string>> = {
  m26: 'shrine.hathrens-mere.lit',
  m30: 'shrine.last-anvil.lit',
  m34: 'shrine.wyrms-hearth.lit',
};

/** The block a lock quest locks (Q5, design 5.9). */
const LOCK_OF: Readonly<Record<string, Act3BlockId>> = Object.fromEntries(
  (Object.keys(ACT3_BLOCKS) as Act3BlockId[]).map((b) => [ACT3_BLOCKS[b].lockQuest, b]),
);

export const ACT3_GATE_FLAG = 'story.gate.a3';
export const DRAGONSPINE_OPEN_FLAG = 'story.phase.dragonspineOpen';

/** Plan 3.5 engine positions: the Reedgate and Wyrmwatch Lodge waystone points. */
export const ACT3_ARRIVAL: Readonly<Record<Act3BlockOf, { x: number; z: number }>> = {
  greyfen: { x: 3200, z: 10200 },
  spine: { x: 13600, z: 11850 },
  summit: { x: 13600, z: 11850 },
};

/** True when a jump to `id` in `order` needs the Dragonspine open (the target or any prerequisite is there). */
export function needsDragonspine(id: string, order: Act3Order): boolean {
  return blockOf(id) !== 'greyfen' || act3Prereqs(id, order).some((q) => blockOf(q) !== 'greyfen');
}

export function parseAct3(
  search: string,
): { id: string; order: Act3Order; classId: string; fresh: true } | { error: string } | null {
  const params = new URLSearchParams(search);
  const raw = params.get('act3');
  if (raw === null) return null;
  if (!ACT3_JUMP_IDS.includes(raw)) return { error: `unknown quest "${raw}" (one of ${ACT3_JUMP_IDS.join(', ')})` };
  if (!params.has('new')) return { error: 'needs &new so the jump never runs over a real save' };
  const order = params.get('order') ?? 'greyfen';
  if (!(ACT3_ORDERS as readonly string[]).includes(order)) return { error: `unknown order "${order}" (greyfen or spine)` };
  const classId = params.get('class') ?? 'knight';
  if (!(ACT2_JUMP_CLASSES as readonly string[]).includes(classId)) return { error: `unknown class "${classId}"` };
  return { id: raw, order: order as Act3Order, classId, fresh: true };
}

export interface Act3JumpPorts extends Act1JumpPorts {
  /** True when the quests service has a def for the id (no Act 3 defs exist until the quest threads land). */
  hasQuest(id: string): boolean;
  /** Locks an Act 3 block at its live preview (K9's accept path in real play); absent until the enemies service has it. */
  lockBlock?(block: Act3BlockId): void;
  /** Places the player at an engine x, z on the ground; false while it cannot yet (retry). */
  placeAt(at: { x: number; z: number }): boolean;
  closeDialogue?(): boolean;
}

export type Act3Phase = 'waiting' | 'tutorial' | 'act1' | 'act2' | 'act3' | 'quiet' | 'place' | 'done';

export const QUIET_TICKS = 6;

/** Ticked once per rules step until `done`. */
export class Act3Jump {
  phase: Act3Phase = 'waiting';
  private wait = 0;
  private quiet = 0;

  constructor(
    readonly id: string,
    readonly order: Act3Order,
    private readonly ports: Act3JumpPorts,
    private readonly classId = 'knight',
  ) {}

  get finished(): boolean { return this.phase === 'done'; }

  tick(): void {
    if (this.finished) return;
    if (this.wait > 0) { this.wait--; return; }
    const p = this.ports;
    if (this.phase === 'waiting') {
      if (!p.ready() || !p.tutorial()) return;
      this.phase = 'tutorial';
    }
    if (this.phase === 'tutorial') {
      const t = p.tutorial()!;
      if (!t.begun) { t.begin('kettlewick'); this.wait = 2; return; }
      if (!t.complete) {
        if (t.beat && !t.restartInFlight) t.skipCurrent();
        this.wait = 2;
        return;
      }
      this.phase = 'act1';
    }
    if (this.phase === 'act1') {
      p.setFlag(ACT1_CARD_SEEN_FLAG, true);
      p.setFlag(ACT1_CARD_SEEN_FLAG_V06, true);
      p.setFlag(ACT1_CAMP_SEEN_FLAG, true);
      for (const q of ACT1_ALL) completeAct1Quest(p, q, this.classId);
      p.setFlag(ACT1_GATE_FLAG, true);
      this.phase = 'act2';
    }
    if (this.phase === 'act2') {
      // Both Act 2 seen flags first: completing M22 and D04 would otherwise play the ending over the player.
      const a2 = actEnding(2);
      if (a2) {
        p.setFlag(a2.cardSeenFlag, true);
        p.setFlag(a2.campSeenFlag, true);
      }
      for (const q of ACT2_ALL.filter((x) => !ACT1_ALL.includes(x))) completeAct2Quest(p, q);
      p.setFlag(ACT3_GATE_FLAG, true);
      if (needsDragonspine(this.id, this.order)) p.setFlag(DRAGONSPINE_OPEN_FLAG, true);
      this.phase = 'act3';
    }
    if (this.phase === 'act3') {
      for (const q of ACT3_PREREQS[this.order][this.id] ?? []) this.inject(q);
      // The target's own lock happens when the player accepts it (K9); the jump leaves it offerable.
      this.phase = 'quiet';
    }
    if (this.phase === 'quiet') {
      if (p.closeDialogue?.()) this.quiet = 0;
      else if (++this.quiet >= QUIET_TICKS) this.phase = 'place';
      return;
    }
    if (this.phase === 'place') {
      if (p.placeAt(ACT3_ARRIVAL[blockOf(this.id)!])) this.phase = 'done';
    }
  }

  private inject(q: string): void {
    const p = this.ports;
    const block = LOCK_OF[q];
    if (block) p.lockBlock?.(block);
    if (p.hasQuest(q)) {
      if (p.quests.state(q) === 'inactive') p.quests.start(q);
      if (p.quests.state(q) !== 'completed' && !p.quests.complete(q)) p.warn(`act3: could not complete ${q}`);
    }
    p.setFlag(`story.${q}.complete`, true);
    const shrine = ACT3_SHRINE_AFTER[q];
    if (shrine) p.setFlag(shrine, true);
  }
}
