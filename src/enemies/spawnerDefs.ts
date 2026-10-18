import type { SpawnerDef } from './types';

const ONE: { min: number; max: number } = { min: 1, max: 1 };

function beat(id: string, enemy: SpawnerDef['enemy'], count: number, anchor: string): SpawnerDef {
  return { id, enemy, count, anchor, band: ONE, activation: 'manual', respawn: 'never', leash: false };
}

/** The slice's spawners; anchor ids follow world-layout-and-npcs.md section 2 (anchors are thread 4's). */
export const SLICE_SPAWNERS: readonly SpawnerDef[] = [
  beat('t05.churchyard', 'ash-wraith', 3, 'spawn.t05.wraiths'),
  beat('t08.lane', 'ash-wraith', 4, 'spawn.t08.wraiths'),
  beat('t09.soldier', 'blighted-soldier', 1, 'spawn.t09.soldier'),
  beat('t10.sweeper', 'ash-wraith', 1, 'spawn.t10.wraith'),
  beat('t11.square', 'ash-wraith', 3, 'spawn.t11.wraiths'),
  beat('t15.gate', 'ash-wraith', 5, 'spawn.t15.wraiths'),
  {
    id: 'm01.lanes',
    tag: 'spawn.m01',
    enemy: 'ash-wraith',
    count: 4,
    anchor: 'spawn.m01.wraith-1',
    patrol: { tag: 'm01-lanes' },
    band: ONE,
    activation: { quest: 'm01' },
    respawn: 'never',
    leash: false,
  },
  {
    id: 'brightwater.north-patrol',
    enemy: 'ash-wraith',
    count: 3,
    anchor: 'spawn.brightwater.north-patrol',
    patrol: { tag: 'patrol.brightwater-north' },
    band: { min: 2, max: 3 },
    activation: 'auto',
    respawn: 'onRest',
    leash: true,
  },
];
