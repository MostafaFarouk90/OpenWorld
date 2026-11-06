// Ownership of the Act 4 flags (contracts v0.8 item 15). Quest flags `story.<id>.*` (choices in `story.<id>.choice`)
// belong to the thread that owns the quest; the rest of the Act 4 namespace is owned here, so two threads never write one key.
import type { Act3FlagOwner } from './act3Flags';
import { ACT4_QUEST_IDS } from './act4Ids';

export type Act4FlagOwner = Act3FlagOwner;

export const ACT4_FLAG_OWNERS: readonly Act4FlagOwner[] = [
  { pattern: 'story.m36.delegate.<id>', owner: 'L10', note: 'F3: one flag per House delegate won (M36)' },
  { pattern: 'story.d07.ledgers', owner: 'L6', note: 'the heart ledgers read in the Crucible (D07)' },
  { pattern: 'story.phase.wasteOpen', owner: 'L13', note: 'the Phase G hold on the Waste (PHASE_HOLDS); retired by L13 PR 2' },
  { pattern: 'story.a4.campSeen', owner: 'L13', note: 'the Act 4 camp scene at the Rimfoot fire has played' },
  { pattern: 'story.gate.a5', owner: 'L13', note: 'the Act 5 gate (the Act 4 ending)' },
  { pattern: 'boss.<id>.outcome', owner: 'core boss registry', note: 'bellows-engine (defeated only) and eormen (released or defeated)' },
];

/** The quest flag namespace: every Act 4 quest owns `story.<id>.*`, owned by that quest's thread. */
export const ACT4_QUEST_FLAG_OWNERS: readonly Act4FlagOwner[] = ACT4_QUEST_IDS.map((id) => ({
  pattern: `story.${id}.*`,
  owner: `the thread that owns ${id}`,
  note: 'quest flags, choices in story.<id>.choice',
}));

/**
 * Anchor prefixes reserved for Act 4 places (no shipped anchor uses them): Harrowmark's Act 4 posts and interiors, the
 * Ash Road, the Waste, and Ashgate (the refuge sits outside the Waste's edge, so it has its own prefix).
 */
export const ACT4_ANCHOR_PREFIXES: readonly string[] = ['harrowmark.a4.', 'ashroad.', 'waste.', 'ashgate.'];
/** Trigger prefixes reserved for Act 4 (no shipped trigger uses them). */
export const ACT4_TRIGGER_PREFIXES: readonly string[] = ['trg.harrowmark.a4.', 'trg.waste.', 'trg.ashgate.', 'trg.ashroad.'];
