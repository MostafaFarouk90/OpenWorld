/** The strider body's clips (StriderBody) and the active windows of its moves. Plain data, no THREE. */
export const STRIDER_CLIPS = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  back: 'Back',
  lunge: 'Lunge',
  blast: 'Blast',
  hit: 'Hit',
  trip: 'Trip',
  drink: 'Drink',
  death: 'Death',
} as const;

export type StriderClip = (typeof STRIDER_CLIPS)[keyof typeof STRIDER_CLIPS];

/** Clip lengths, seconds. Looping clips give their cycle length (the gait drives the legs; the clip sets the cadence). */
export const STRIDER_CLIP_DURATIONS: Readonly<Record<StriderClip, number>> = {
  Idle: 3,
  Walk: 1.1,
  Run: 0.75,
  Back: 1.3,
  Lunge: 1.2,
  Blast: 1.4,
  Hit: 0.35,
  Trip: 1,
  Drink: 1.5,
  Death: 1.6,
};

/** Names `Enemy.ts` asks for, mapped onto the strider's clips. */
export const STRIDER_CLIP_ALIASES: Readonly<Record<string, StriderClip>> = {
  Walking_A: 'Walk',
  Walking_B: 'Walk',
  Running_A: 'Run',
  Walking_Backwards: 'Back',
  Hit_A: 'Hit',
  Hit_B: 'Trip',
  Death_A: 'Death',
  Lie_StandUp: 'Idle',
  Lie_Idle: 'Trip',
  Blocking: 'Idle',
  Sit_Floor_Down: 'Trip',
  Sit_Floor_Idle: 'Trip',
  Use_Item: 'Idle',
};

/**
 * The windows (normalised in the clip). The 0.6 s draw-back is the wind-up before `activeStart`: the body scales the
 * pre-window part to the move's `windup` as every body does.
 */
export const STRIDER_ATTACKS = {
  lunge: { clip: 'Lunge', activeStart: 0.5, activeEnd: 0.62 },
  blast: { clip: 'Blast', activeStart: 0.43, activeEnd: 0.6 },
} as const;
