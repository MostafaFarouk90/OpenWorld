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
  // j08: the cutpurse pair in the Forge Row alley, armed once the second remark has been heard (`story.j08.alleyWoke`, an
  // objective flag). Like M07's thieves they may rob and run; a thief that escapes leaves its slot to refill while the group lives.
  {
    id: 'side.j08.cutpurses', tag: 'j08.cutpurse', enemy: 'alley-cutpurse', count: 2,
    anchor: 'spawn.j08.cutpurse-1', memberAnchors: ['spawn.j08.cutpurse-1', 'spawn.j08.cutpurse-2'],
    band: { min: 4, max: 5 }, activation: { quest: 'j08', flag: 'story.j08.alleyWoke' }, respawn: 'never', leash: false,
  },
  // j11: the two hounds at the end of the cart tracks (anchors in the Underways def), armed once the grate is open and the job running.
  {
    id: 'side.j11.hounds', tag: 'j11.hounds', enemy: 'ember-hound', count: 2,
    anchor: 'j11.spawn.hound-1', memberAnchors: ['j11.spawn.hound-1', 'j11.spawn.hound-2'],
    band: { min: 6, max: 7 }, activation: { quest: 'j11', flag: 'world.underways.cartway' }, respawn: 'never', leash: true,
  },
  // j09: Stane's three bouts on the Bastion yard's R02 anchors (the same yard veteran and the same spots as R02's bout), one per
  // bout flag Stane's dialogue writes while j09 is running, and the repeat bout he offers after it. Their tags pay no kill XP
  // (NO_KILL_XP_TAGS in src/progression/tuning.ts), no gold and no Halvard favour (a yard veteran's yield carries none).
  ...([1, 2, 3] as const).map((n): SpawnerDef => ({
    id: `side.j09.bout-${n}`, tag: `j09.b${n}`, enemy: 'yard-veteran', count: 1,
    anchor: 'spawn.r02.bastion-bout', memberAnchors: ['spawn.r02.bastion-bout'],
    band: { min: 2, max: 3 }, activation: { quest: 'j09', flag: `story.j09.b${n}` }, respawn: 'never', leash: true,
  })),
  {
    id: 'side.j09.repeat', tag: 'j09.repeat', enemy: 'yard-veteran', count: 1,
    anchor: 'spawn.r02.bastion-bout', memberAnchors: ['spawn.r02.bastion-bout'],
    band: { min: 2, max: 3 }, activation: { flag: 'story.j09.repeat' }, respawn: 'never', leash: true,
  },
];
