import type { SpawnerDef } from './types';

/**
 * Act 1 side jobs (quests thread; anchors in src/region/side.layout.ts). Each group is armed by a flag a quest writes, never
 * respawns, and stands outside every patrol and trigger box and clear of the environment pass's props
 * (src/quests/content/side/side.test.ts proves it for every anchor named here).
 */
export const SIDE_SPAWNERS: readonly SpawnerDef[] = [
  // j03: the barrow pair on the Dead Road, armed once the job has begun (either stone read). `story.j03.started` is the
  // quest-level objective flag in src/quests/content/side/index.ts.
  {
    id: 'side.j03.barrow', tag: 'j03.barrow', enemy: 'ash-wraith', count: 2,
    anchor: 'spawn.j03.barrow-1', memberAnchors: ['spawn.j03.barrow-1', 'spawn.j03.barrow-2'],
    band: { min: 3, max: 4 }, activation: { flag: 'story.j03.started' }, respawn: 'never', leash: true,
  },
];
