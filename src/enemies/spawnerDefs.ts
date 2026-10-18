import type { SpawnerDef } from './types';

const ONE: { min: number; max: number } = { min: 1, max: 1 };

/** One-shot manual group: one member per anchor in `members` (the layout defines per-member anchors). */
function beat(id: string, enemy: SpawnerDef['enemy'], members: readonly string[]): SpawnerDef {
  return { id, enemy, count: members.length, anchor: members[0], memberAnchors: members, band: ONE, activation: 'manual', respawn: 'never', leash: false };
}

const replay = beat;
const numbered = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);

/** The slice's spawners; anchor ids follow world-layout-and-npcs.md section 2 (anchors are thread 4's). */
export const SLICE_SPAWNERS: readonly SpawnerDef[] = [
  beat('t05.churchyard', 'ash-wraith', numbered('spawn.t05.wraith', 3)),
  beat('t08.lane', 'ash-wraith', numbered('spawn.t08.wraith', 3)),
  beat('t09.soldier', 'blighted-soldier', ['spawn.t09.soldier-1']),
  beat('t10.sweeper', 'ash-wraith', ['spawn.t10.wraith-1']),
  beat('t11.square', 'ash-wraith', numbered('spawn.t11.wraith', 3)),
  beat('t15.gate', 'ash-wraith', numbered('spawn.t15.wave', 4)),
  {
    id: 'm01.lanes',
    tag: 'm01',
    enemy: 'ash-wraith',
    count: 5,
    anchor: 'spawn.m01.wraith-1',
    memberAnchors: [1, 2, 3, 4, 5].map((i) => `spawn.m01.wraith-${i}`),
    band: ONE,
    activation: { quest: 'm01', flag: 'tutorial.complete' },
    respawn: 'never',
    leash: false,
  },
  {
    id: 'brightwater.north-patrol',
    enemy: 'ash-wraith',
    count: 3,
    anchor: 'spawn.patrol.wraith-1',
    patrol: ['patrol.north.1', 'patrol.north.2', 'patrol.north.3', 'patrol.north.4'],
    band: { min: 2, max: 3 },
    activation: 'auto',
    // Resting respawns no enemies (design ruling), so a dead patrol stays dead, across reloads too.
    respawn: 'never',
    leash: true,
  },
  // The Replay board's yard (manual; thread 9 spawns them per lesson).
  replay('replay.blocker', 'blighted-soldier', ['yard.blocker']),
  replay('replay.dodge', 'ash-wraith', ['yard.dodge-lane']),
  replay('replay.lockon', 'ash-wraith', ['yard.pole-1', 'yard.pole-2']),
];
