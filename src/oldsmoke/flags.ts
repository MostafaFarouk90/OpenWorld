// The `world.oldsmoke.*` namespace is split by owner: this thread (A4) derives `.market.*` and `.hall.*` below (quest threads
// never write them); A13 writes `world.oldsmoke.lift.restored` once, as a quest effect, and A4 only reads it (PR 2's lift); A9
// owns `world.bellows.*`. The derived flags are booleans because `story.<id>.choice` values are strings and flag conditions test
// truthiness.
export const MARKET_MINERS_FLAG = 'world.oldsmoke.market.miners';
export const MARKET_COMPROMISE_FLAG = 'world.oldsmoke.market.compromise';
export const MARKET_MINER_GUARD_FLAG = 'world.oldsmoke.market.minerGuard';
export const MARKET_STEWARD_GUARD_FLAG = 'world.oldsmoke.market.stewardGuard';
export const HALL_HOSTILE_FLAG = 'world.oldsmoke.hall.hostile';
/** Set by the Act 2 camp scene (A16, `scene-act2-camp`): Wenna is at the camp from then on. */
export const WENNA_AT_CAMP_FLAG = 'story.a2.wennaAtCamp';

/** Written by A13, read by PR 2's lift. */
export const LIFT_RESTORED_FLAG = 'world.oldsmoke.lift.restored';
/** Written by A9; the Bellows stone stays locked until it is true (A9 adds the lock). */
export const BELLOWS_SOLVED_FLAG = 'world.bellows.solved';

export interface DerivedFlag {
  derived: string;
  /** Flag keys the derivation reads; any change re-derives. */
  sources: readonly string[];
  /** The value the derived flag should hold. */
  want(get: (key: string) => unknown): boolean;
}

const choiceIs = (key: string, values: readonly string[]) => (get: (k: string) => unknown) => {
  const v = get(key);
  return typeof v === 'string' && values.includes(v);
};

/** R10 sets who guards the market: stewards until it is settled, miners if they won, both after a compromise. */
export const DERIVED_FLAGS: readonly DerivedFlag[] = [
  { derived: MARKET_MINERS_FLAG, sources: ['story.r10.choice'], want: choiceIs('story.r10.choice', ['miners']) },
  { derived: MARKET_COMPROMISE_FLAG, sources: ['story.r10.choice'], want: choiceIs('story.r10.choice', ['compromise']) },
  { derived: MARKET_MINER_GUARD_FLAG, sources: ['story.r10.choice'], want: choiceIs('story.r10.choice', ['miners', 'compromise']) },
  { derived: MARKET_STEWARD_GUARD_FLAG, sources: ['story.r10.choice'], want: (get) => !choiceIs('story.r10.choice', ['miners'])(get) },
  // M21 confront turns the hall's stewards into the fight A13 spawns, unless the persuasion pass skipped it.
  {
    derived: HALL_HOSTILE_FLAG,
    sources: ['story.m21.choice', 'story.m21.persuaded'],
    want: (get) => choiceIs('story.m21.choice', ['confront'])(get) && get('story.m21.persuaded') !== true,
  },
];
