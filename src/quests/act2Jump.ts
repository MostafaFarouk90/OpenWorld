// `?act2=<quest>&new` (dev and smoke only): jumps a fresh game to a Phase C quest's giver. Act 1 is replayed through the
// same runner as `?act1=` (every prerequisite on the real quests service, with the dialogue-node effects real play runs),
// with the Act 1 card and camp marked seen first so the ending does not play over the player, and `story.gate.a2` set
// before the teleport so containment lets the destination stand. The Phase C prerequisites are then completed the same
// way (the closing dialogue nodes of M13 and M14 write the companion joins and ranks), the world state no quest effect
// writes is seeded, and the target quest is left offerable at its giver so the offer's own effects run when the player
// accepts. The prerequisite table is `ACT2_PREREQS` in actJump.ts (the registered table); this file fills nothing in.
import { dialogueDefs } from '../dialogue/content';
import { ACT1_CAMP_SEEN_FLAG, ACT1_CARD_SEEN_FLAG, ACT1_CARD_SEEN_FLAG_V06, ACT1_GATE_FLAG } from '../integration/act1Ending';
import { ACT1_PREREQS, completeAct1Quest, nodeEffects, type Act1JumpPorts, type NodeRef } from './act1Jump';
import { ACT2_PREREQS } from './actJump';

export const ACT2_PHASE_C_IDS = ['m11', 'm12', 'r06', 'r05', 'm13', 'r07', 'r11', 'm14', 'm15', 'd03'] as const;
export type Act2JumpId = (typeof ACT2_PHASE_C_IDS)[number];

/** All of Act 1: D02's prerequisites and D02 (completing it ends the act). */
const ACT1_ALL: readonly string[] = [...ACT1_PREREQS.d02, 'd02'];

/** The NPC each Phase C quest is offered by (the player lands in front of it at its current post). */
export const ACT2_GIVERS: Record<Act2JumpId, string> = {
  m11: 'gaut', m12: 'osgar', r06: 'maud', r05: 'ketta', m13: 'hrolf', r07: 'ketta', r11: 'hrolf', m14: 'aelfreda', m15: 'osgar', d03: 'osgar',
};

/** Dialogue nodes whose effects real play runs inside a prerequisite quest (looked up from the content, not copied). */
export const ACT2_NODE_EFFECTS: Record<string, ReadonlyArray<NodeRef>> = {
  m13: [{ dialogueId: 'npc-hrolf', nodeId: 'm13-oath-12' }],
  m14: [{ dialogueId: 'npc-aelfreda', nodeId: 'a2-rite-13' }],
};
/** Waystones real play rekindles inside a quest (the Hushed Anvil rekindles through its waystone). */
export const ACT2_REKINDLE_AFTER: Record<string, readonly string[]> = { m11: ['cinder-road'], m14: ['hushed-anvil'] };

export const ACT2_JUMP_CLASSES = ['knight', 'warden', 'emberwright', 'pathfinder', 'ashblade'] as const;

export interface Act2JumpPorts extends Act1JumpPorts {
  /** True when the Phase C dependencies exist (the quests service has the Act 2 defs). */
  hasQuest(id: string): boolean;
  /** Closes a dialogue the prerequisites started (the stone-lit speech of M11 opens one); true when one was open. */
  closeDialogue?(): boolean;
}

export type Act2Phase = 'waiting' | 'tutorial' | 'act1' | 'phaseC' | 'quiet' | 'place' | 'done' | 'failed';

/** Ticks with no dialogue open before the player is placed (the director's speeches start a tick after their event). */
export const QUIET_TICKS = 6;

export function parseAct2(search: string): { id: Act2JumpId; classId: string; fresh: true } | { error: string } | null {
  const params = new URLSearchParams(search);
  const raw = params.get('act2');
  if (raw === null) return null;
  if (!(ACT2_PHASE_C_IDS as readonly string[]).includes(raw)) return { error: `unknown quest "${raw}" (one of ${ACT2_PHASE_C_IDS.join(', ')})` };
  if (!params.has('new')) return { error: 'needs &new so the jump never runs over a real save' };
  const classId = params.get('class') ?? 'knight';
  if (!(ACT2_JUMP_CLASSES as readonly string[]).includes(classId)) return { error: `unknown class "${classId}"` };
  return { id: raw as Act2JumpId, classId, fresh: true };
}

/** Ticked once per rules step until `done`. */
export class Act2Jump {
  phase: Act2Phase = 'waiting';
  private wait = 0;
  private quiet = 0;

  constructor(readonly id: Act2JumpId, private readonly ports: Act2JumpPorts, private readonly classId = 'knight') {}

  get finished(): boolean { return this.phase === 'done' || this.phase === 'failed'; }

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
      // Mark the Act 1 card and camp seen first: completing D02 would otherwise start the ending over the player.
      p.setFlag(ACT1_CARD_SEEN_FLAG, true);
      p.setFlag(ACT1_CARD_SEEN_FLAG_V06, true);
      p.setFlag(ACT1_CAMP_SEEN_FLAG, true);
      for (const q of ACT1_ALL) completeAct1Quest(p, q, this.classId);
      p.setFlag(ACT1_GATE_FLAG, true);
      this.phase = 'phaseC';
    }
    if (this.phase === 'phaseC') {
      if (!p.hasQuest(this.id)) {
        p.warn(`act2: quest ${this.id} is not registered`);
        this.phase = 'failed';
        return;
      }
      for (const q of ACT2_PREREQS[this.id].filter((x) => !ACT1_ALL.includes(x))) this.completeQuest(q);
      this.phase = 'quiet';
    }
    if (this.phase === 'quiet') {
      // The prerequisites' own directors speak (Gaut's stone-lit speech): close those over the player, and the posts
      // (held while a dialogue is open) catch up, before the player is put in front of the giver.
      if (p.closeDialogue?.()) this.quiet = 0;
      else if (++this.quiet >= QUIET_TICKS) this.phase = 'place';
      return;
    }
    if (this.phase === 'place') {
      if (p.standBy(ACT2_GIVERS[this.id])) this.phase = 'done';
    }
  }

  private completeQuest(q: string): void {
    const p = this.ports;
    if (p.quests.state(q) === 'completed') return;
    if (p.quests.state(q) === 'inactive') p.quests.start(q);
    for (const ref of ACT2_NODE_EFFECTS[q] ?? []) {
      const effects = nodeEffects(ref.dialogueId, ref.nodeId, dialogueDefs, ref.choiceId);
      if (effects) p.runEffects(effects);
      else p.warn(`act2: dialogue node ${ref.dialogueId}:${ref.nodeId} is missing`);
    }
    for (const id of ACT2_REKINDLE_AFTER[q] ?? []) p.rekindle(id);
    if (!p.quests.complete(q)) p.warn(`act2: could not complete ${q}`);
  }
}
