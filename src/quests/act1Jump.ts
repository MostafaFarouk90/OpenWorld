// `?act1=<quest>&new` (dev and smoke only): jumps a fresh game to the start of a Phase A quest. The tutorial is
// finished through the director (Kettlewick skip, then every beat skipped), each prerequisite quest is started and
// completed on the real quests service, and the dialogue-node effects that real play runs on the way (the Leap,
// the mercy unlocks, the carters) are read from the dialogue content and run through the quest effect runner. Saves
// are held for the whole session, and the `&new` boot skips the slot clear (save.plugin.ts), so a jump neither
// overwrites nor deletes a real save.
import { dialogueDefs } from '../dialogue/content';
import { QUEST_LEADS } from './leads';
import type { DialogueDef, Effect } from './types';

export const ACT1_JUMP_IDS = ['m03', 'm04', 'm05', 'd01', 'r01', 'r02'] as const;
export type Act1JumpId = (typeof ACT1_JUMP_IDS)[number];

/** Prerequisites in play order (from the givers' offer conditions). */
export const ACT1_PREREQS: Record<Act1JumpId, readonly string[]> = {
  m03: ['m01', 'm02'],
  m04: ['m01', 'm02', 'm03'],
  m05: ['m01', 'm02', 'm03', 'm04'],
  d01: ['m01', 'm02', 'm03', 'm04', 'm05'],
  r01: ['m01', 'm02'],
  r02: ['m01', 'm02'],
};

/** Dialogue nodes whose effects real play runs inside each quest (looked up, not copied). */
export const ACT1_NODE_EFFECTS: Record<string, ReadonlyArray<{ dialogueId: string; nodeId: string }>> = {
  m03: [{ dialogueId: 'npc-aelfreda', nodeId: 'leap' }, { dialogueId: 'npc-aelfreda', nodeId: 'release' }],
  m04: [{ dialogueId: 'npc-gaut', nodeId: 'm04-spare' }, { dialogueId: 'npc-carter-1', nodeId: 'thanks-2' }],
};

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

export function nodeEffects(dialogueId: string, nodeId: string, defs: readonly DialogueDef[] = dialogueDefs): Effect[] | null {
  const node = defs.find((d) => d.id === dialogueId)?.nodes.find((n) => n.id === nodeId);
  return node ? [...(node.effects ?? [])] : null;
}

export interface Act1JumpPorts {
  tutorial(): { begun: boolean; complete: boolean; beat: string | null; restartInFlight: boolean; begin(mode: 'kettlewick'): void; skipCurrent(): void } | undefined;
  quests: { state(id: string): string; start(id: string): boolean; complete(id: string): boolean };
  runEffects(effects: Effect[]): void;
  setFlag(flag: string, value: true): void;
  rekindle(waystoneId: string): void;
  /** Teleports the player to an anchor; false while it cannot yet (retry). */
  teleportTo(anchorId: string): boolean;
  /** True once saves have settled (the `&new` boot finished). */
  ready(): boolean;
  warn(msg: string): void;
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
      if (p.quests.state(this.id) === 'inactive' && !p.quests.start(this.id)) {
        p.warn(`act1: could not start ${this.id}`);
        this.phase = 'failed';
        return;
      }
      this.phase = 'place';
    }
    if (this.phase === 'place') {
      const lead = QUEST_LEADS.find((l) => l.questId === this.id);
      if (!lead || p.teleportTo(lead.postAnchor)) this.phase = 'done';
    }
  }

  private completeQuest(q: string): void {
    const p = this.ports;
    if (p.quests.state(q) === 'completed') return;
    if (p.quests.state(q) === 'inactive') p.quests.start(q);
    for (const ref of ACT1_NODE_EFFECTS[q] ?? []) {
      const effects = nodeEffects(ref.dialogueId, ref.nodeId);
      if (effects) p.runEffects(effects);
      else p.warn(`act1: dialogue node ${ref.dialogueId}:${ref.nodeId} is missing`);
    }
    for (const w of ACT1_WORLD_AFTER[q] ?? []) p.setFlag(w.flag, w.value);
    for (const id of ACT1_REKINDLE_AFTER[q] ?? []) p.rekindle(id);
    if (!p.quests.complete(q)) p.warn(`act1: could not complete ${q}`);
  }
}
