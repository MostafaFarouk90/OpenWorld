// M20 and D04 pacing rows (plans/act2-A13.md section 5), the same pure estimate as ../pacing.ts, measured on A4's real anchors
// (`realAnchors.ts`: the Lower Galleries and the Deepdelve in their own local metres). Both are entered by a lift door, so the
// leg across it is not counted (the route restarts at the landing).
import type { AnchorPos, PaceRow } from '../../pacing';
import { mineAnchors } from './realAnchors';

export const M20D04_LOCAL_ANCHORS: AnchorPos = { ...mineAnchors('mine-lower-galleries'), ...mineAnchors('mine-deepdelve') };

export const M20D04_PACE: readonly PaceRow[] = [
  {
    // 32 nodes: Wenna 8, captain 8, keeper 6, aftermath 6 plus the 4 top-up nodes
    quest: 'm20', design: 45, floor: 18, nodes: 32,
    route: ['oldsmoke.lower.lift', 'oldsmoke.m19.nursery', 'oldsmoke.m20.captain', 'oldsmoke.m20.post.2', 'oldsmoke.m20.chain.1', 'oldsmoke.m20.chain.2', 'oldsmoke.m20.chain.3', 'oldsmoke.m20.chain.4', 'oldsmoke.m20.chain.5', 'oldsmoke.m20.roof', 'oldsmoke.m19.nursery'],
    beats: { killUnit: 8, interact: 5, note: 7, set: 1 },
  },
  {
    // 20 nodes: Slagg's briefing 8, the outcome 6, the hand-in 3 and the 3 top-up nodes
    quest: 'd04', design: 65, floor: 26, nodes: 20,
    route: ['npc-post.slagg.deepdelve', 'oldsmoke.deepdelve.stage.1', 'oldsmoke.deepdelve.stage.2', 'oldsmoke.deepdelve.valve.room.1', 'oldsmoke.deepdelve.pool.1', 'oldsmoke.deepdelve.valve.room.2', 'oldsmoke.deepdelve.pool.2', 'deepdelve.slagmaw.arena.door', 'deepdelve.slagmaw.arena.centre', 'oldsmoke.deepdelve.lift', 'npc-post.slagg.deepdelve'],
    beats: { lift: 2, killUnit: 14, note: 6, puzzle: 2, boss: 1 },
  },
];
