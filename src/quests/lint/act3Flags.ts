// Ownership of the Act 3 flags that are not named by a quest id (contracts v0.7 item 19). Quest flags `story.<id>.*`
// (choices in `story.<id>.choice`, witness counters such as `story.m27.witnesses`) belong to the thread that owns the
// quest; the rest of the namespace is owned here, so two threads never write one key.
import { ACT3_QUEST_IDS } from './act3Ids';

export interface Act3FlagOwner {
  /** the flag key; `<id>` and `<classId>` stand for one path segment */
  pattern: string;
  owner: string;
  note: string;
}

export const ACT3_FLAG_OWNERS: readonly Act3FlagOwner[] = [
  { pattern: 'warmth.block.<id>.level', owner: 'K9', note: 'the Warmth level of each Act 3 block' },
  { pattern: 'story.a3.campSeen', owner: 'K16', note: 'the Act 3 camp scene has played' },
  { pattern: 'story.gate.a4', owner: 'K16', note: 'the Act 4 gate' },
  { pattern: 'trainer.<classId>.masterBook', owner: 'K11', note: 'written through grantMasterBook' },
  { pattern: 'boss.<id>.outcome', owner: 'core boss registry', note: 'written by the core boss registry for every boss' },
  { pattern: 'story.phase.dragonspineOpen', owner: 'Phase F PR', note: 'nothing writes it in Phase E' },
  { pattern: 'gear.shardgem.granted.<id>', owner: 'K10', note: 'one shard-gem paid per boss (live drop or the D01 to D04 retro-grant)' },
];

/** The quest flag namespace: every Act 3 quest owns `story.<id>.*`, owned by that quest's thread. */
export const ACT3_QUEST_FLAG_OWNERS: readonly Act3FlagOwner[] = ACT3_QUEST_IDS.map((id) => ({
  pattern: `story.${id}.*`,
  owner: `the thread that owns ${id}`,
  note: 'quest flags, choices in story.<id>.choice',
}));

/** Anchor prefixes reserved for Act 3 places (no shipped anchor uses them). */
export const ACT3_ANCHOR_PREFIXES: readonly string[] = ['greyfen.', 'fenroad.', 'dragonspine.', 'spineroad.'];
/** Trigger prefixes reserved for Act 3 (no shipped trigger uses them). */
export const ACT3_TRIGGER_PREFIXES: readonly string[] = ['trg.greyfen.', 'trg.dragonspine.'];
