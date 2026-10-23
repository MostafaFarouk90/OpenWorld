// The Deepgate lift's stop table (pure). Each stop is a mine interior reached by exit-then-enter at black (plan section 11,
// ruling 1); unlock conditions are ordinary quest `Condition`s read through `evalCondition`, so A13 can change the table without
// touching the ride code.
import type { ConditionEnv } from '../../quests/ports';
import { evalCondition } from '../../quests/conditions';
import type { Condition } from '../../quests/types';
import { LIFT_RESTORED_FLAG } from '../flags';
import { MINE_DOOR_IDS, MINE_IDS, type MineId } from './kit';

/** A13 writes this once the lift is mended; nothing rides, and the surface interactable stays dead, until it is set. */
export const LIFT_ARMED_FLAG = LIFT_RESTORED_FLAG;

export type LiftStopId = 'surface' | MineId;

export interface LiftStop {
  id: LiftStopId;
  /** String key of the stop's name. */
  labelKey: string;
  /** String key of why the stop is locked (shown greyed in the menu). */
  lockedKey: string;
  /** Interior and door to enter; null for the surface. */
  interiorId: string | null;
  doorId: string | null;
  when: Condition;
}

const armed: Condition = { flag: LIFT_ARMED_FLAG };
const quest = (id: string, state: 'active' | 'completed' | 'both'): Condition => ({ quest: id, state: state === 'both' ? ['active', 'completed'] : state });

const stop = (id: MineId, when: Condition): LiftStop => ({
  id,
  labelKey: `oldsmoke.lift.stop.${id}`,
  lockedKey: `oldsmoke.lift.locked.${id}`,
  interiorId: MINE_IDS[id],
  doorId: MINE_DOOR_IDS[id],
  when,
});

/** Top to bottom. The surface is always a stop (riding up is plain exit). */
export const LIFT_STOPS: readonly LiftStop[] = [
  { id: 'surface', labelKey: 'oldsmoke.lift.stop.surface', lockedKey: 'oldsmoke.lift.locked.surface', interiorId: null, doorId: null, when: { all: [] } },
  // The quest flags are A13's (agreed 2026-10-23): each quest writes its `started` flag when it is accepted.
  stop('shaft', { all: [armed, { flag: 'story.m17.started' }] }),
  stop('old', { all: [armed, { flag: 'story.r08.started' }] }),
  stop('lower', { all: [armed, { flag: 'story.m19.started' }] }),
  stop('bellows', { all: [armed, { flag: 'story.m18.started' }] }),
  stop('deepdelve', { all: [armed, quest('d04', 'both')] }),
];

export interface StopState {
  stop: LiftStop;
  unlocked: boolean;
}

export const stopById = (id: LiftStopId): LiftStop => LIFT_STOPS.find((s) => s.id === id)!;

/** The stop the player is at: the mine whose interior id is `interiorId`, else the surface. */
export function stopOfInterior(interiorId: string | null, table: readonly LiftStop[] = LIFT_STOPS): LiftStop {
  return table.find((s) => s.interiorId !== null && s.interiorId === interiorId) ?? table[0];
}

/** Every stop with its lock state, in table order. */
export function availableStops(read: ConditionEnv, table: readonly LiftStop[] = LIFT_STOPS): StopState[] {
  return table.map((s) => ({ stop: s, unlocked: evalCondition(s.when, read) }));
}

/** The next unlocked stop below `current` (table order), or null at the bottom or when none is open. */
export function nextStopLabel(current: LiftStopId, read: ConditionEnv, table: readonly LiftStop[] = LIFT_STOPS): string | null {
  const i = table.findIndex((s) => s.id === current);
  for (const s of availableStops(read, table).slice(i + 1)) if (s.unlocked) return s.stop.labelKey;
  return null;
}
