import type { SpawnerDef } from './types';

const members = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);

/**
 * Act 1 density pass, batch 1 (quests thread; anchors in src/region/density.layout.ts). Each group is live only while
 * its quest is active and the flag of the beat before it is on (src/quests/content/objectiveFlags.ts), never respawns.
 */
export const DENSITY_SPAWNERS_A: readonly SpawnerDef[] = [
  // M01: four wraiths circle the mill while Aldwin holds the door.
  {
    id: 'density.m01.mill', tag: 'm01.mill', enemy: 'ash-wraith', count: 4,
    anchor: 'spawn.m01.mill-1', memberAnchors: members('spawn.m01.mill', 4),
    band: { min: 1, max: 1 }, activation: { quest: 'm01', flag: 'tutorial.complete' }, respawn: 'never', leash: true,
  },
  // M02: three wraiths in the oven yard, drawn by the bakery's heat once the hearth is dug out.
  {
    id: 'density.m02.oven-yard', tag: 'm02.oven-yard', enemy: 'ash-wraith', count: 3,
    anchor: 'spawn.m02.oven-1', memberAnchors: members('spawn.m02.oven', 3),
    band: { min: 1, max: 2 }, activation: { quest: 'm02', flag: 'story.m02.rubbleCleared' }, respawn: 'never', leash: true,
  },
  // M04: the Toll Sergeant on the bridge, once his four Footmen are beaten.
  {
    id: 'density.m04.sergeant', tag: 'm04.sergeant', enemy: 'toll-sergeant', count: 1,
    anchor: 'spawn.ford.sergeant', memberAnchors: ['spawn.ford.sergeant'],
    band: { min: 4, max: 4 }, activation: { quest: 'm04', flag: 'story.m04.sergeantCalled' }, respawn: 'never', leash: true,
  },
  // R01: two more scarecrows in the east field (eight in all).
  {
    id: 'r01.scarecrows-east', enemy: 'ash-scarecrow', count: 2,
    anchor: 'r01.scarecrow.7', memberAnchors: ['r01.scarecrow.7', 'r01.scarecrow.8'],
    band: { min: 2, max: 3 }, activation: { quest: 'r01' }, respawn: 'never', leash: false,
  },
  // R01: the root under the barley wakes as three wraiths once the scarecrows are gone.
  {
    id: 'density.r01.root', tag: 'r01.root', enemy: 'ash-wraith', count: 3,
    anchor: 'spawn.r01.root-1', memberAnchors: members('spawn.r01.root', 3),
    band: { min: 2, max: 3 }, activation: { quest: 'r01', flag: 'story.r01.rootWoke' }, respawn: 'never', leash: true,
  },
];
