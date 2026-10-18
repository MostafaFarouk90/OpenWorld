import type { ChaseDef } from './ChaseDirector';

/** Minimum class stamina (Emberwright 80, plans/slice-2-class-system.md): the par runner's budget. */
export const MIN_CLASS_STAMINA = 80;

/** M10's rooftop chase on thread 17's `chase.m10.0..15`; `timer` is filled from the par time when the route loads. */
export const M10_CHASE: Omit<ChaseDef, 'timer'> & { routePrefix: string } = {
  id: 'm10.rooftops',
  quest: { id: 'm10', liveFrom: 'o2', liveUntil: 'o3' },
  start: { anchor: 'chase.m10.0', radius: 4 },
  restartAnchor: 'chase.m10.0',
  routePrefix: 'chase.m10',
};

/** The objective after the catch (the orders handover): o3 done and this not done means he waits cornered. */
export const M10_AFTER_CATCH = 'o4';
