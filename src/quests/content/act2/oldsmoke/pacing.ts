// Phase D surface pacing (plans/act2-A13.md section 5): the same pure estimate as the Phase C table in ../pacing.ts, for
// the quests that play above ground (M16, R09, R10, M21, M22). The mines quests add their rows with their build.
// Choice quests are measured on their shorter branch: R09 either side (equal beats), R10 miners or stewards (the
// compromise adds three persuasion talks), M21 confront with a persuasion pass (no fight) and the spy run.
import type { PaceRow } from '../pacing';

export interface OldsmokePaceRow extends PaceRow {
  /** the branch this row measures, when the quest has more than one */
  branch?: string;
}

export const OLDSMOKE_PACE: readonly OldsmokePaceRow[] = [
  {
    quest: 'm16', design: 45, floor: 18, rideLegs: 2, nodes: 40,
    route: ['npc-post.osgar.scorchhold', 'oldsmoke.pass.ambush.1', 'oldsmoke.pass.search.1', 'oldsmoke.pass.search.2', 'oldsmoke.pass.search.3', 'oldsmoke.gate.guard.1', 'oldsmoke.hall.court', 'oldsmoke.m16.brazier.2', 'oldsmoke.hall.court', 'npc-post.wenna.court', 'oldsmoke.hall.court'],
    beats: { killUnit: 4, note: 3, interact: 1, set: 1 },
  },
  {
    quest: 'r09', design: 35, floor: 14, nodes: 30, branch: 'stewards',
    route: ['npc-post.slagg.market', 'oldsmoke.market.nest.1', 'oldsmoke.market.nest.3', 'oldsmoke.market.nest.2', 'oldsmoke.market.chest.1', 'oldsmoke.market.office.2', 'oldsmoke.market.chest.3', 'oldsmoke.market.office.2', 'oldsmoke.market.chest.2', 'oldsmoke.market.office.2', 'oldsmoke.market.office.3', 'oldsmoke.gate.guard.1', 'npc-post.miner.2', 'npc-post.slagg.market'],
    beats: { killUnit: 9, carry: 3, note: 7 },
  },
  {
    quest: 'r10', design: 45, floor: 18, nodes: 46, branch: 'miners',
    route: ['npc-post.slagg.market', 'oldsmoke.r10.hall.miners', 'oldsmoke.r10.hall.stewards', 'oldsmoke.market.office.1', 'oldsmoke.market.stall.4', 'oldsmoke.r10.hall.stewards', 'oldsmoke.market.centre', 'npc-post.slagg.market'],
    beats: { note: 8, interact: 2 },
  },
  {
    quest: 'm21', design: 40, floor: 16, nodes: 46, branch: 'confront',
    route: ['npc-post.wenna.court', 'npc-post.steward-hall.1', 'oldsmoke.hall.door', 'oldsmoke.hall.court', 'oldsmoke.m16.brazier.1', 'oldsmoke.hall.court', 'npc-post.wenna.court'],
    beats: { interact: 3, note: 3, set: 1 },
  },
  {
    quest: 'm21', design: 40, floor: 16, nodes: 43, branch: 'spy',
    route: ['npc-post.wenna.court', 'npc-post.steward-hall.1', 'oldsmoke.hall.door', 'oldsmoke.hall.court', 'oldsmoke.m16.brazier.1', 'oldsmoke.hall.court', 'npc-post.wenna.court'],
    beats: { interact: 6, note: 3, stealthSection: 1 },
  },
  {
    quest: 'm22', design: 45, floor: 18, nodes: 56,
    route: ['harrowmark.keep-road.start', 'harrowmark.keep-hall.door', 'npc-post.grisel', 'harrowmark.keep-hall.door', 'npc-post.edric', 'harrowmark.square.fountain', 'harrowmark.square.market', 'harrowmark.keep-hall.door', 'npc-post.wystan'],
    beats: { note: 6, interact: 1, set: 1 },
  },
];
