// Plan Part 7.1 as data: each Act 4 row's travel metres per mode, planned nodes and beats on the shorter branch. Used only by
// act4Timing.test.ts to pin the estimator to the plan's own arithmetic (Phase G 313.2 of 590, Phase H 199.1 of 380, act
// 512.1 of 970) before any quest thread's measured row exists.
import type { Act4Beat, Act4Leg } from './act4Timing';

export interface Act4PlannedRow {
  quest: string;
  design: number;
  metres: Partial<Record<Exclude<Act4Leg, 'door'>, number>>;
  nodes: number;
  beats: Partial<Record<Act4Beat, number>>;
  /** the plan's estimate in minutes, to one decimal */
  planned: number;
}

export const ACT4_PLANNED_PACE: readonly Act4PlannedRow[] = [
  { quest: 'm35', design: 40, metres: { ride: 1400, foot: 500 }, nodes: 30, beats: { killUnit: 6, search: 3, interact: 4, set: 1 }, planned: 21.6 },
  { quest: 'm36', design: 55, metres: { foot: 1500, ride: 600 }, nodes: 42, beats: { killUnit: 4, search: 4, interact: 3, set: 1, stealthSection: 1 }, planned: 30.5 },
  { quest: 'r19', design: 40, metres: { foot: 700, ride: 800 }, nodes: 28, beats: { killUnit: 6, search: 2, interact: 3, duelRound: 1 }, planned: 20.6 },
  { quest: 'r20', design: 45, metres: { foot: 600, follow: 500 }, nodes: 38, beats: { search: 4, interact: 4, set: 1 }, planned: 22.1 },
  { quest: 'r21', design: 40, metres: { foot: 500, follow: 400 }, nodes: 26, beats: { stealthSection: 1, killUnit: 4, search: 2, interact: 3 }, planned: 22.0 },
  { quest: 'r22', design: 45, metres: { foot: 800, ride: 1600 }, nodes: 30, beats: { killUnit: 8, search: 3, interact: 4, rhythm: 2 }, planned: 25.6 },
  { quest: 'r23', design: 35, metres: { foot: 900 }, nodes: 34, beats: { search: 5, interact: 2, killUnit: 2 }, planned: 18.2 },
  { quest: 'd07', design: 60, metres: { foot: 600 }, nodes: 24, beats: { killUnit: 12, interact: 6, search: 4, puzzle: 1, boss: 1 }, planned: 29.6 },
  { quest: 'm37', design: 35, metres: { foot: 200 }, nodes: 46, beats: { set: 2, rhythm: 1, interact: 2 }, planned: 19.4 },
  { quest: 'm38', design: 60, metres: { foot: 300 }, nodes: 66, beats: { set: 3, killUnit: 6, search: 2, interact: 2 }, planned: 31.6 },
  { quest: 'm39', design: 50, metres: { foot: 150 }, nodes: 26, beats: { waveEnemy: 8, killUnit: 8, set: 3, interact: 2, search: 1 }, planned: 24.9 },
  { quest: 'm40', design: 50, metres: { follow: 900 }, nodes: 20, beats: { killUnit: 10, stealthSection: 1, interact: 5, search: 2, set: 1 }, planned: 28.2 },
  { quest: 'm41', design: 35, metres: { foot: 250 }, nodes: 44, beats: { search: 3, interact: 2, set: 2 }, planned: 18.9 },
  { quest: 'm42', design: 50, metres: { storm: 900 }, nodes: 28, beats: { shelterWait: 4, killUnit: 8, interact: 4, search: 2, set: 1 }, planned: 24.7 },
  { quest: 'm43', design: 55, metres: { foot: 900 }, nodes: 40, beats: { duelRound: 2, killUnit: 6, shelterWait: 2, rhythm: 1, search: 2, interact: 3 }, planned: 27.3 },
  { quest: 'm44', design: 40, metres: { foot: 1400 }, nodes: 30, beats: { search: 5, killUnit: 6, interact: 3, set: 1 }, planned: 22.9 },
  { quest: 'r25', design: 35, metres: { foot: 1800 }, nodes: 22, beats: { search: 4, interact: 3, killUnit: 4, carry: 3 }, planned: 18.5 },
  { quest: 'r24', design: 40, metres: { cart: 800, foot: 600 }, nodes: 24, beats: { killUnit: 8, interact: 4, shelterWait: 2, set: 1 }, planned: 23.8 },
  { quest: 'm45', design: 50, metres: { foot: 1500 }, nodes: 30, beats: { puzzle: 2, rhythm: 2, killUnit: 6, search: 3, set: 1, interact: 2 }, planned: 28.4 },
  { quest: 'd08', design: 60, metres: { foot: 700 }, nodes: 26, beats: { killUnit: 12, interact: 4, search: 4, structure: 1, boss: 1 }, planned: 29.3 },
  { quest: 'm46', design: 50, metres: {}, nodes: 30, beats: { waveEnemy: 6, killUnit: 8, interact: 2, set: 2, search: 4 }, planned: 24.2 },
];
