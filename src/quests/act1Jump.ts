// `?act1=<quest>&new` (dev and smoke only): jumps a fresh game to the start of an Act 1 quest. Phase A quests
// (Brightwater) are started at their giver; Phase B quests (Harrowmark, D02) are left offerable at their giver, so the
// offer's own effects (Rook's bread and Calm for D02, Merrin's door for M09) run when the player accepts. The tutorial is
// finished through the director (Kettlewick skip, then every beat skipped), each prerequisite quest is started and
// completed on the real quests service, and the dialogue-node effects that real play runs on the way (the Leap,
// the mercy unlocks, the carters) are read from the dialogue content and run through the quest effect runner. Saves
// are held for the whole session, and the `&new` boot skips the slot clear (save.plugin.ts), so a jump neither
// overwrites nor deletes a real save.
import { dialogueDefs } from '../dialogue/content';
import { registerActJump, type ActPoint } from './actJump';
import { QUEST_LEADS } from './leads';
import type { DialogueDef, Effect } from './types';

export const ACT1_PHASE_A_JUMP_IDS = ['m03', 'm04', 'm05', 'd01', 'r01', 'r02'] as const;
export const ACT1_PHASE_B_JUMP_IDS = ['m06', 'm07', 'm08', 'm09', 'm10', 'r03', 'r04', 'd02'] as const;
export const ACT1_JUMP_IDS = [...ACT1_PHASE_A_JUMP_IDS, ...ACT1_PHASE_B_JUMP_IDS] as const;
export type Act1JumpId = (typeof ACT1_JUMP_IDS)[number];
export const isPhaseBJump = (id: Act1JumpId): boolean => (ACT1_PHASE_B_JUMP_IDS as readonly string[]).includes(id);

const THROUGH_M05 = ['m01', 'm02', 'm03', 'm04', 'm05'] as const;

/** Prerequisites in play order (from the givers' offer conditions). */
export const ACT1_PREREQS: Record<Act1JumpId, readonly string[]> = {
  m03: ['m01', 'm02'],
  m04: ['m01', 'm02', 'm03'],
  m05: ['m01', 'm02', 'm03', 'm04'],
  d01: ['m01', 'm02', 'm03', 'm04', 'm05'],
  r01: ['m01', 'm02'],
  r02: ['m01', 'm02'],
  m06: [...THROUGH_M05],
  m07: [...THROUGH_M05, 'm06'],
  m08: [...THROUGH_M05, 'm06', 'm07'],
  m09: [...THROUGH_M05, 'm06', 'm07', 'm08'],
  m10: [...THROUGH_M05, 'm06', 'm07', 'm08', 'm09'],
  r03: [...THROUGH_M05, 'm06', 'm07'],
  r04: [...THROUGH_M05, 'm06', 'm07'],
  d02: [...THROUGH_M05, 'r01', 'r02', 'm06', 'm07', 'm08', 'm09', 'm10', 'r03', 'r04'],
};

registerActJump(1, { prereqs: ACT1_PREREQS });

/** The giver whose offer a Phase B jump leaves the player beside (the NPC's post under the post rules at that point). */
export const ACT1_GIVERS: Record<(typeof ACT1_PHASE_B_JUMP_IDS)[number], string> = {
  m06: 'rook', m07: 'aldith', m08: 'wystan', m09: 'merrin', m10: 'gerta', r03: 'aldith', r04: 'whitlock', d02: 'rook',
};
/** How far in front of the giver (along the post's facing) a Phase B jump lands. */
export const GIVER_STAND_OFF = 2.5;

export interface NodeRef {
  dialogueId: string;
  nodeId: string;
  /** A choice on that node: its effects run after the node's own, as when the player picks it. */
  choiceId?: string;
}

/**
 * Dialogue nodes (and choices) whose effects real play runs inside each quest (looked up, not copied). The jump's
 * branch picks: M06 by bribe, M08 steady answers, R03 collected, R04 shielded.
 */
export const ACT1_NODE_EFFECTS: Record<string, ReadonlyArray<NodeRef>> = {
  m03: [{ dialogueId: 'npc-aelfreda', nodeId: 'leap' }, { dialogueId: 'npc-aelfreda', nodeId: 'release' }],
  m04: [{ dialogueId: 'npc-gaut', nodeId: 'm04-spare' }, { dialogueId: 'npc-carter-1', nodeId: 'thanks-2' }],
  m06: [{ dialogueId: 'npc-rook', nodeId: 'm06-choose', choiceId: 'bribe' }],
  // m07-return opens the trainers (story.m07.classOpen); its satchel take only warns on a jump
  m07: [{ dialogueId: 'npc-aldith', nodeId: 'm07-return' }],
  m08: ['q1', 'q2', 'q3'].map((q) => ({ dialogueId: 'npc-edric', nodeId: q, choiceId: 'honest' })),
  m09: [{ dialogueId: 'npc-merrin', nodeId: 'm09-offer-2', choiceId: 'accept' }],
  r03: [{ dialogueId: 'npc-aldith', nodeId: 'r03-settle', choiceId: 'collect' }],
  r04: [{ dialogueId: 'npc-whitlock', nodeId: 'r04-pages', choiceId: 'shield' }],
};

/** Gold the dev harness grants before a quest's choices (M06's bribe; real play earns it from purses and chests). */
export const ACT1_GOLD_BEFORE: Record<string, number> = { m06: 50 };

/**
 * World state that real play of a quest leaves and that no quest effect writes (the owning systems write it
 * from combat or the rhythm game, which a jump does not play).
 */
export const ACT1_WORLD_AFTER: Record<string, ReadonlyArray<{ flag: string; value: true }>> = {
  m04: [{ flag: 'world.brightwater.tollPost', value: true }],
  m05: [{ flag: 'world.deadroad.wardstones.done', value: true }],
};
/** Waystones real play rekindles inside a quest. */
export const ACT1_REKINDLE_AFTER: Record<string, readonly string[]> = { m05: ['quenchstone'] };

export function parseAct1(search: string): { id: Act1JumpId; fresh: boolean } | { error: string } | null {
  const params = new URLSearchParams(search);
  const raw = params.get('act1');
  if (raw === null) return null;
  if (!(ACT1_JUMP_IDS as readonly string[]).includes(raw)) return { error: `unknown quest "${raw}" (one of ${ACT1_JUMP_IDS.join(', ')})` };
  if (!params.has('new')) return { error: 'needs &new so the jump never runs over a real save' };
  return { id: raw as Act1JumpId, fresh: true };
}

export function nodeEffects(dialogueId: string, nodeId: string, defs: readonly DialogueDef[] = dialogueDefs, choiceId?: string): Effect[] | null {
  const node = defs.find((d) => d.id === dialogueId)?.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  if (choiceId === undefined) return [...(node.effects ?? [])];
  const choice = node.choices?.find((c) => c.id === choiceId);
  return choice ? [...(node.effects ?? []), ...(choice.effects ?? [])] : null;
}

export interface Act1JumpPorts {
  tutorial(): { begun: boolean; complete: boolean; beat: string | null; restartInFlight: boolean; begin(mode: 'kettlewick'): void; skipCurrent(): void } | undefined;
  quests: { state(id: string): string; start(id: string): boolean; complete(id: string): boolean };
  runEffects(effects: Effect[]): void;
  setFlag(flag: string, value: true): void;
  rekindle(waystoneId: string): void;
  /** Gives the player gold (a dev-harness grant). */
  giveGold(amount: number): void;
  /** M07's class choice through the classes service: chooses and skips the drill; false when refused. */
  chooseClass(classId: string): boolean;
  /** Teleports the player to an anchor; false while it cannot yet (retry). */
  teleportTo(anchorId: string): boolean;
  /** Teleports the player in front of an NPC at its current post; false while it cannot yet (retry). */
  standBy(npcId: string): boolean;
  /** True once saves have settled (the `&new` boot finished). */
  ready(): boolean;
  warn(msg: string): void;
  /** Optional containment clamp: every teleport destination (a position) goes through it when present. */
  clamp?(at: ActPoint): ActPoint;
}

export type Act1Phase = 'waiting' | 'tutorial' | 'quests' | 'place' | 'done' | 'failed';

/** Ticked once per rules step until `done`. */
export class Act1Jump {
  phase: Act1Phase = 'waiting';
  private wait = 0;

  constructor(readonly id: Act1JumpId, private readonly ports: Act1JumpPorts) {}

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
      this.phase = 'quests';
    }
    if (this.phase === 'quests') {
      for (const q of ACT1_PREREQS[this.id]) this.completeQuest(q);
      if (isPhaseBJump(this.id)) {
        // Left offerable: the giver's offer node starts it (and runs its own effects).
        this.phase = 'place';
      } else if (p.quests.state(this.id) === 'inactive' && !p.quests.start(this.id)) {
        p.warn(`act1: could not start ${this.id}`);
        this.phase = 'failed';
        return;
      } else {
        this.phase = 'place';
      }
    }
    if (this.phase === 'place') {
      if (isPhaseBJump(this.id)) {
        if (p.standBy(ACT1_GIVERS[this.id as keyof typeof ACT1_GIVERS])) this.phase = 'done';
        return;
      }
      const lead = QUEST_LEADS.find((l) => l.questId === this.id);
      if (!lead || p.teleportTo(lead.postAnchor)) this.phase = 'done';
    }
  }

  private completeQuest(q: string): void {
    const p = this.ports;
    if (p.quests.state(q) === 'completed') return;
    if (p.quests.state(q) === 'inactive') p.quests.start(q);
    if (ACT1_GOLD_BEFORE[q]) p.giveGold(ACT1_GOLD_BEFORE[q]);
    for (const ref of ACT1_NODE_EFFECTS[q] ?? []) {
      const effects = nodeEffects(ref.dialogueId, ref.nodeId, dialogueDefs, ref.choiceId);
      if (effects) p.runEffects(effects);
      else p.warn(`act1: dialogue node ${ref.dialogueId}:${ref.nodeId}${ref.choiceId ? `/${ref.choiceId}` : ''} is missing`);
    }
    if (q === 'm07' && !p.chooseClass('knight')) p.warn('act1: the M07 class choice was refused');
    for (const w of ACT1_WORLD_AFTER[q] ?? []) p.setFlag(w.flag, w.value);
    for (const id of ACT1_REKINDLE_AFTER[q] ?? []) p.rekindle(id);
    if (!p.quests.complete(q)) p.warn(`act1: could not complete ${q}`);
  }
}
