// Plan Part 7.1 as data: each Act 5 row's travel metres per mode, planned nodes and beats on the shorter branch. Used by
// act5Timing.test.ts to pin the estimator to the plan's own arithmetic (Phase I 197.4 of 355, Phase J 244.8 of 450, act
// 442.2 of 805) before any quest thread's measured row exists. Notes are search beats (the rim inscription in M47, the
// four murals in M54), never nodes.
import type { Act5Beat, Act5Leg } from './act5Timing';

export interface Act5PlannedRow {
  quest: string;
  design: number;
  metres: Partial<Record<Exclude<Act5Leg, 'door'>, number>>;
  nodes: number;
  beats: Partial<Record<Act5Beat, number>>;
  notes?: string[];
  /** the plan's estimate in minutes, to one decimal */
  planned: number;
}

export const ACT5_PLANNED_PACE: readonly Act5PlannedRow[] = [
  { quest: 'm47', design: 40, metres: { foot: 800 }, nodes: 26, beats: { killUnit: 8, search: 3, interact: 4, set: 1 }, notes: ['rim-inscription'], planned: 20.3 },
  { quest: 'm48', design: 45, metres: { foot: 900 }, nodes: 26, beats: { killUnit: 8, crossing: 6, interact: 4, search: 3, set: 1 }, planned: 23.7 },
  { quest: 'm49', design: 40, metres: { foot: 900 }, nodes: 52, beats: { interact: 4, search: 2, set: 2 }, planned: 24.0 },
  { quest: 'r26', design: 40, metres: { cart: 1500, foot: 300 }, nodes: 24, beats: { killUnit: 8, interact: 4, search: 2, set: 1 }, planned: 23.3 },
  { quest: 'r29', design: 35, metres: { foot: 1200 }, nodes: 24, beats: { search: 3, carry: 3, killUnit: 6, rhythm: 1, interact: 2, set: 1 }, planned: 21.0 },
  { quest: 'm50', design: 50, metres: { foot: 600 }, nodes: 26, beats: { puzzle: 3, killUnit: 8, interact: 6, search: 3, set: 1 }, planned: 25.9 },
  { quest: 'm51', design: 50, metres: { foot: 1100 }, nodes: 46, beats: { set: 3, killUnit: 6, search: 2, interact: 2 }, planned: 27.9 },
  { quest: 'm52', design: 55, metres: { foot: 300 }, nodes: 26, beats: { waveEnemy: 16, structure: 2, order: 4, killUnit: 4, set: 3 }, planned: 31.3 },
  { quest: 'r27', design: 45, metres: { foot: 900 }, nodes: 28, beats: { waveEnemy: 9, interact: 4, search: 2, structure: 1, set: 1 }, planned: 22.8 },
  { quest: 'r28', design: 40, metres: { foot: 900 }, nodes: 32, beats: { carry: 4, search: 4, interact: 4, killUnit: 4, set: 1 }, planned: 21.0 },
  { quest: 'r30', design: 40, metres: { foot: 1400 }, nodes: 48, beats: { search: 3, rhythm: 1, interact: 2, set: 1 }, notes: ['r30-page-1', 'r30-page-2', 'r30-page-3'], planned: 24.5 },
  { quest: 'm53', design: 45, metres: { foot: 1300 }, nodes: 46, beats: { killUnit: 4, set: 2, interact: 2, search: 3 }, planned: 26.5 },
  { quest: 'd09', design: 70, metres: { foot: 900 }, nodes: 32, beats: { killUnit: 16, interact: 6, search: 4, structure: 1, puzzle: 1, boss: 1, set: 1 }, planned: 38.4 },
  { quest: 'm54', design: 45, metres: { foot: 900 }, nodes: 30, beats: { killUnit: 8, interact: 4, search: 4, set: 2 }, notes: ['mural-1', 'mural-2', 'mural-3', 'mural-4'], planned: 23.3 },
  { quest: 'm55', design: 40, metres: { foot: 300 }, nodes: 42, beats: { duelRound: 3, interact: 2, search: 2, set: 1 }, planned: 21.6 },
  { quest: 'd10', design: 80, metres: { foot: 800 }, nodes: 34, beats: { killUnit: 14, interact: 4, search: 4, structure: 1, boss: 1, bossphase: 2, set: 2 }, planned: 41.9 },
  { quest: 'm56', design: 45, metres: { foot: 200 }, nodes: 60, beats: { set: 3, interact: 2, search: 2 }, planned: 24.7 },
];
