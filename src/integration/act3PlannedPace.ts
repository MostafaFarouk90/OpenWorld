// Plan Part 7.1 as data: each Act 3 row's travel metres per mode, planned nodes and beats on the shorter branch. Used only
// by act3Timing.test.ts to pin the estimator to the plan's own arithmetic (Greyfen 222 of 420, act 499 of 980) before any
// quest thread's measured row exists.
import type { Act3Beat, Act3Leg } from './act3Timing';

export interface Act3PlannedRow {
  quest: string;
  design: number;
  metres: Partial<Record<Exclude<Act3Leg, 'door'>, number>>;
  nodes: number;
  beats: Partial<Record<Act3Beat, number>>;
  /** the plan's estimate in minutes, to one decimal */
  planned: number;
}

export const ACT3_PLANNED_PACE: readonly Act3PlannedRow[] = [
  { quest: 'm23', design: 45, metres: { ride: 1000, foot: 500, wade: 300 }, nodes: 32, beats: { killUnit: 9, search: 4, interact: 2, set: 1 }, planned: 25.8 },
  { quest: 'm24', design: 40, metres: { ride: 300, foot: 300, wade: 200 }, nodes: 33, beats: { search: 5, dive: 2, killUnit: 4, interact: 2, set: 1 }, planned: 20.6 },
  { quest: 'r12', design: 35, metres: { ride: 500, foot: 400, wade: 300 }, nodes: 28, beats: { interact: 5, killUnit: 6, search: 3 }, planned: 19.5 },
  { quest: 'm25', design: 50, metres: { ride: 1000, foot: 400, wade: 200 }, nodes: 39, beats: { search: 7, killUnit: 6, interact: 3, set: 1 }, planned: 25.6 },
  { quest: 'r14', design: 45, metres: { ride: 1400, foot: 400, wade: 200 }, nodes: 36, beats: { search: 8, killUnit: 7, interact: 1 }, planned: 25.1 },
  { quest: 'r13', design: 45, metres: { ride: 500, foot: 200, wade: 100 }, nodes: 31, beats: { dive: 4, search: 5, killUnit: 5, rhythm: 2, set: 1 }, planned: 22.9 },
  { quest: 'm26', design: 55, metres: { ride: 500, foot: 300, wade: 200 }, nodes: 38, beats: { killUnit: 8, search: 5, interact: 5, set: 2 }, planned: 26.2 },
  { quest: 'm27', design: 45, metres: { ride: 600, foot: 500, wade: 200 }, nodes: 30, beats: { stealthSection: 1, killUnit: 8, search: 4, interact: 3, set: 1 }, planned: 26.7 },
  { quest: 'd05', design: 60, metres: { ride: 300, foot: 300, wade: 200 }, nodes: 26, beats: { dive: 4, killUnit: 12, search: 4, interact: 2, boss: 1 }, planned: 30.0 },
  { quest: 'm28', design: 50, metres: { ride: 1200, foot: 1000 }, nodes: 32, beats: { killUnit: 8, search: 4, leap: 2, set: 1 }, planned: 25.4 },
  { quest: 'r15', design: 40, metres: { ride: 600, foot: 1000 }, nodes: 26, beats: { sled: 3, killUnit: 6, interact: 1 }, planned: 22.6 },
  { quest: 'm29', design: 40, metres: { ride: 600, foot: 300 }, nodes: 40, beats: { search: 5, interact: 2, killUnit: 2, set: 1 }, planned: 20.1 },
  { quest: 'r16', design: 40, metres: { ride: 700, foot: 500 }, nodes: 30, beats: { search: 6, killUnit: 5, interact: 2, leap: 1 }, planned: 19.5 },
  { quest: 'm30', design: 50, metres: { ride: 1100, foot: 400 }, nodes: 36, beats: { search: 8, killUnit: 6, interact: 4, set: 1 }, planned: 24.4 },
  { quest: 'r17', design: 35, metres: { ride: 1800, foot: 200 }, nodes: 22, beats: { interact: 6, carry: 6, killUnit: 4 }, planned: 16.9 },
  { quest: 'r18', design: 40, metres: { ride: 600, foot: 800 }, nodes: 27, beats: { search: 4, carry: 3, stealthSection: 1, interact: 3 }, planned: 19.7 },
  { quest: 'm31', design: 60, metres: { ride: 1000, foot: 800 }, nodes: 44, beats: { duelRound: 2, leap: 3, killUnit: 4, search: 3, set: 1 }, planned: 28.2 },
  { quest: 'm32', design: 45, metres: { foot: 300 }, nodes: 54, beats: { search: 3, set: 2, interact: 1 }, planned: 22.3 },
  { quest: 'm33', design: 50, metres: { ride: 800, foot: 700 }, nodes: 32, beats: { killUnit: 8, interact: 6, search: 5, set: 1 }, planned: 24.4 },
  { quest: 'm34', design: 45, metres: { foot: 600 }, nodes: 50, beats: { interact: 2, set: 2, search: 2 }, planned: 21.9 },
  { quest: 'd06', design: 65, metres: { glide: 700, foot: 600 }, nodes: 32, beats: { killUnit: 12, search: 6, interact: 2, boss: 1 }, planned: 31.4 },
];
