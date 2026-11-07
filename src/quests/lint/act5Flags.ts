// Ownership of the Act 5 flags (contracts v0.9 item 14). Quest flags `story.<id>.*` (choices in `story.<id>.choice`)
// belong to the thread that owns the quest; the rest of the Act 5 namespace is owned here, so two threads never write one key.
import type { Act3FlagOwner } from './act3Flags';
import { ACT5_QUEST_IDS } from './act5Ids';

export type Act5FlagOwner = Act3FlagOwner;

export const ACT5_FLAG_OWNERS: readonly Act5FlagOwner[] = [
  { pattern: 'story.m47.rimGateOpen', owner: 'N10', note: "M47's winch: the Rim Gate's face opens (N1's gate structure reads it on load)" },
  { pattern: 'story.phase.foundryOpen', owner: 'N12', note: 'the Phase I hold on the bowl floor (PHASE_HOLDS.caldera); retired by N12 PR 2' },
  { pattern: 'story.a5.rimCardSeen', owner: 'N12', note: '"The Rim holds", the Phase I card after M52, has shown (once-flag)' },
  { pattern: 'story.gate.end', owner: 'N12', note: 'the final ending gate (M56 complete)' },
  { pattern: 'world.afterEnding', owner: 'N12', note: 'the world after the ending (Q1 (a)); set once the final choice has played out; N13 reads it' },
  { pattern: 'codex.actEnding.a5.seen', owner: 'N12', note: 'the first final ending card has shown' },
  { pattern: 'favour.snapshot.<id>.<track>', owner: 'core (WorldState.snapshotFavour)', note: 'm52 (N10), d09 and m56 (N11) take them' },
  { pattern: 'favour.snapshot.<id>.taken', owner: 'core (WorldState.snapshotFavour)', note: 'set with the snapshot, once' },
  { pattern: 'shrine.anvil-of-ages.lit', owner: 'N11', note: 'M56 lights the Anvil in both endings' },
  { pattern: 'siege.<siegeId>.order.<n>', owner: 'N4', note: 'the order given in the break after wave n (m52, r27); a load in or after the break keeps it' },
  { pattern: 'siege.<siegeId>.done', owner: 'N4', note: 'the siege completed (N10 and N11 complete their quests on siege.completed)' },
  { pattern: 'siege.m52.wounded', owner: 'N4', note: "the companion id of M52's wounded beat (Q2 a); they sit out at the aid post" },
  { pattern: 'siege.offer.<order>', owner: 'N4', note: "the war post's offered orders during a break (dialogue conditions)" },
  { pattern: 'boss.<id>.outcome', owner: 'core boss registry', note: 'vey (spared or defeated) and ulthred (defeated only)' },
];

/** The quest flag namespace: every Act 5 quest owns `story.<id>.*`, owned by that quest's thread. */
export const ACT5_QUEST_FLAG_OWNERS: readonly Act5FlagOwner[] = ACT5_QUEST_IDS.map((id) => ({
  pattern: `story.${id}.*`,
  owner: `the thread that owns ${id}`,
  note: 'quest flags, choices in story.<id>.choice',
}));

/**
 * Anchor prefixes reserved for Act 5 places (no shipped anchor uses them): the Caldera, the rim stairs below the crest
 * included (they are Act 5 content in the Waste's box).
 */
export const ACT5_ANCHOR_PREFIXES: readonly string[] = ['caldera.'];
/** Trigger prefixes reserved for Act 5. */
export const ACT5_TRIGGER_PREFIXES: readonly string[] = ['trg.caldera.'];
