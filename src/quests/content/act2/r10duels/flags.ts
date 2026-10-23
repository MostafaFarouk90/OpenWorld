// R10's optional duels (follow-up to thread A13, plans/act2-followups/r10-duels.md): what this module assumes about
// A13's R10, in one place. Every name below is A13's, copied exactly from its branch `claude/project-thread-kjqxpx`
// at 6ab7e35 (src/quests/content/act2/oldsmoke/r10.quest.ts and src/dialogue/content/act2/oldsmoke/{stewards,miners}.
// dialogue.ts). A13 stays the owner and the writer of `story.r10.*`; the one exception, on purpose, is that a won duel
// writes the very same round flag and raises the very same event as a won talk, so R10 sees one resolved state
// whichever way the round was won. If A13 renames any of these, change them here and nowhere else.

/** R10's quest id. */
export const R10_QUEST = 'r10';
/** The objective that counts the three rounds (`story.r10.persuaded`, `required: 3`, `dedupeBy: 'n'`). */
export const R10_TALKS_OBJECTIVE = 'talks';
/** The branch flag Slagg's choice writes; the rounds (talks or duels) exist only on `compromise`. */
export const R10_BRANCH_FLAG = 'story.r10.branch';
export const R10_COMPROMISE = 'compromise';
/** Round `n` won (A13 writes it from the talk's winning choice): `true`. */
export const r10RoundFlag = (n: R10Round): string => `story.r10.p.${n}`;
/** Raised once per round won, payload `{ n: '1' | '2' | '3' }` (a string, as A13's dialogue effect sends it). */
export const R10_PERSUADED_EVENT = 'story.r10.persuaded';

export type R10Round = 1 | 2 | 3;
export const R10_ROUNDS: readonly R10Round[] = [1, 2, 3];

/** The three talk targets: A13's dialogue ids and NPC ids, round by round. */
export const R10_TARGETS: Readonly<Record<R10Round, { npcId: string; dialogueId: string; who: string }>> = {
  1: { npcId: 'miner-1', dialogueId: 'npc-miner-1', who: 'Oda Brennock, the miners\' delegate' },
  2: { npcId: 'steward-market-1', dialogueId: 'npc-steward-market-1', who: 'Steward Halse' },
  3: { npcId: 'steward-market-2', dialogueId: 'npc-steward-market-2', who: 'the paymaster\'s clerk' },
};

/**
 * A13's round segment is `r10-round-<n>` (built by `roundSegments`); its last line is the choice node, whose choices are
 * `evidence`, `standing` and `bluff`. The duel choice is added beside them.
 */
export const r10RoundSegment = (n: R10Round): string => `r10-round-${n}`;
export const R10_TALK_CHOICE_IDS = ['evidence', 'standing', 'bluff'] as const;

/** This module's own names (not A13's): the dialogue event the duel choice raises, and the choice id. */
export const R10_DUEL_START_EVENT = 'story.r10duel.start';
export const R10_DUEL_CHOICE_ID = 'duel';
export const r10DuelTrialId = (n: R10Round): string => `r10.duel.${n}`;

export function isR10Round(v: unknown): v is R10Round {
  return v === 1 || v === 2 || v === 3;
}
