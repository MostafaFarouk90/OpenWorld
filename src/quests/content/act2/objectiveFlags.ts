import type { ObjectiveFlag } from '../../objectiveFlags';

const ids = ['m11', 'm12', 'r06', 'r05', 'm13', 'r07', 'r11', 'm14', 'm15'] as const;

/** Story flags set by an objective or by the quest starting (src/quests/objectiveFlags.ts). `story.d03.started` is written when the keep objective becomes current (the wall harpooners are down). */
export const ACT2_OBJECTIVE_FLAGS: ObjectiveFlag[] = [
  ...ids.map((q): ObjectiveFlag => ({ quest: q, flag: `story.${q}.started` })),
  // R05: the fog hounds come once the tracks are read
  { quest: 'r05', objective: 'tracks', flag: 'story.r05.tracksFound' },
  // R07: the den wakes at the last sign
  { quest: 'r07', objective: 'signs', flag: 'story.r07.denWoke' },
  // R11: the hounds wake with the den scene
  { quest: 'r11', objective: 'den', flag: 'story.r11.denSeen' },
  // M15: the packs come out once the camp has been scouted
  { quest: 'm15', objective: 'scout', flag: 'story.m15.scouted' },
  // M15: the doubting hunter is at the camp once the packs are down
  { quest: 'm15', objective: 'harpooners', flag: 'story.m15.corwinHere' },
  // D03: the keep opens to the player once the courtyard and the walls are clear; the courtyard comes when the gate falls
  { quest: 'd03', objective: 'gate', flag: 'story.d03.gateDown' },
  { quest: 'd03', objective: 'perch', flag: 'story.d03.started' },
];
