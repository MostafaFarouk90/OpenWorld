/** The swarm body's clips (SwarmBody) and its move window. Plain data, no THREE. */
export const GNAT_CLIPS = { idle: 'Hover', move: 'Drift', sting: 'Sting', hit: 'Scatter', death: 'Disperse' } as const;
export type GnatClip = (typeof GNAT_CLIPS)[keyof typeof GNAT_CLIPS];

export const GNAT_CLIP_DURATIONS: Readonly<Record<GnatClip, number>> = { Hover: 2, Drift: 1, Sting: 1.1, Scatter: 0.3, Disperse: 1 };

/** Every name `Enemy.ts` may ask for: a cloud has one look per state. */
export const GNAT_CLIP_ALIASES: Readonly<Record<string, GnatClip>> = {
  Idle: 'Hover',
  Walking_A: 'Drift',
  Walking_B: 'Drift',
  Running_A: 'Drift',
  Walking_Backwards: 'Drift',
  Hit_A: 'Scatter',
  Hit_B: 'Scatter',
  Death_A: 'Disperse',
  Lie_StandUp: 'Hover',
  Blocking: 'Hover',
  Sit_Floor_Down: 'Hover',
  Sit_Floor_Idle: 'Hover',
  Use_Item: 'Hover',
};

/** The contract fills the wind-up (0.8 s); the wash is the window. */
export const GNAT_ATTACKS = { sting: { clip: 'Sting', activeStart: 0.72, activeEnd: 0.85 } } as const;
