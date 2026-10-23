import type { SpawnerDef } from '../../../../../enemies/types';
import { M17_SWARM_FLAG } from './m17.quest';
import { R08_BELL_FLAG } from './r08.quest';

const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
const common = { band: 'oldsmoke', respawn: 'never' as const };

/** Quest-scoped groups of M17 and R08. Anchors are A4's PR 2 mine anchors. */
export const M17R08_SPAWNERS: readonly SpawnerDef[] = [
  // M17: twelve crawlers hang in the shaft roof (the kind hangs by default) and drop around the vents once the first is cleared
  {
    id: 'q13.m17.drop', tag: 'm17.drop', enemy: 'slag-crawler', count: 12, anchor: 'oldsmoke.shaft.drop.1',
    memberAnchors: range('oldsmoke.shaft.drop.', 1, 12), activation: { quest: 'm17', flag: M17_SWARM_FLAG }, leash: true, ...common,
  },
  // R08: the wraith shift rises when the bell tolls (three spawn points, the last two members ring the first)
  {
    id: 'q13.r08.shift', tag: 'r08.shift', enemy: 'ash-wraith', count: 5, anchor: 'oldsmoke.old.spawn.1',
    memberAnchors: range('oldsmoke.old.spawn.', 1, 3), activation: { quest: 'r08', flag: R08_BELL_FLAG }, leash: true, ...common,
  },
];
