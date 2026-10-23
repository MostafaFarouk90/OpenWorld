// M20 and D04 pacing rows (plans/act2-A13.md section 5), the same pure estimate as ../pacing.ts. A4's mines are not on this
// branch yet, so the routes read LOCAL position constants below: a plausible layout of each interior in its own frame
// (the mines' defs fit local x [-70, 70], z [-130, 10], Deepdelve to x 220). Both interiors are entered by a lift door, so the
// legs inside one interior are measured in its own frame and the leg across the door is not counted (the route restarts at the
// landing). When A4's anchors merge, swap `M20D04_LOCAL_ANCHORS` for the layout's and rerun the test.
import type { AnchorPos, PaceRow } from '../../pacing';

export const M20D04_LOCAL_ANCHORS: AnchorPos = {
  // Lower Galleries (M20)
  'oldsmoke.lower.lift': { x: 0, z: 0 },
  'oldsmoke.m19.nursery': { x: -30, z: -35 },
  'oldsmoke.m20.captain': { x: 0, z: -60 },
  'oldsmoke.m20.post.1': { x: -24, z: -64 },
  'oldsmoke.m20.post.2': { x: -12, z: -72 },
  'oldsmoke.m20.post.3': { x: 0, z: -76 },
  'oldsmoke.m20.post.4': { x: 12, z: -72 },
  'oldsmoke.m20.post.5': { x: 24, z: -64 },
  'oldsmoke.m20.chain.1': { x: -30, z: -90 },
  'oldsmoke.m20.chain.2': { x: -15, z: -96 },
  'oldsmoke.m20.chain.3': { x: 0, z: -100 },
  'oldsmoke.m20.chain.4': { x: 15, z: -96 },
  'oldsmoke.m20.chain.5': { x: 30, z: -90 },
  'oldsmoke.m20.roof': { x: 0, z: -112 },
  'oldsmoke.lower.spawn.1': { x: -8, z: -20 },
  // Deepdelve (D04)
  'npc-post.slagg.deepdelve': { x: 0, z: 0 },
  'oldsmoke.deepdelve.lift': { x: 0, z: 0 },
  'oldsmoke.deepdelve.stage.1': { x: 0, z: -30 },
  'oldsmoke.deepdelve.stage.2': { x: 0, z: -70 },
  'oldsmoke.deepdelve.valve.room.1': { x: -50, z: -90 },
  'oldsmoke.deepdelve.pool.1': { x: -56, z: -96 },
  'oldsmoke.deepdelve.valve.room.2': { x: 50, z: -90 },
  'oldsmoke.deepdelve.pool.2': { x: 56, z: -96 },
  'deepdelve.slagmaw.arena.door': { x: 100, z: -90 },
  'deepdelve.slagmaw.arena.centre': { x: 140, z: -90 },
};

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
