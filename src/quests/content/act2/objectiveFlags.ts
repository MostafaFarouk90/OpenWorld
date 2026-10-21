import type { ObjectiveFlag } from '../../objectiveFlags';

const ids = ['m11', 'm12', 'r06', 'r05', 'm13', 'r07', 'r11', 'm14', 'm15'] as const;

/** Story flags set by an objective or by the quest starting (src/quests/objectiveFlags.ts). `story.d03.started` is written when the keep objective becomes current (the wall harpooners are down). */
export const ACT2_OBJECTIVE_FLAGS: ObjectiveFlag[] = [
  ...ids.map((q): ObjectiveFlag => ({ quest: q, flag: `story.${q}.started` })),
  // R05: the fog hounds come once the tracks are read
  { quest: 'r05', objective: 'boy', flag: 'story.r05.tracksFound' },
  // R07: the den wakes at the last sign; the mother is out once the pack is down (kills count only on the current objective)
  { quest: 'r07', objective: 'signs', flag: 'story.r07.denWoke' },
  { quest: 'r07', objective: 'hounds', flag: 'story.r07.motherHere' },
  // R11: the hounds wake with the den scene
  { quest: 'r11', objective: 'den', flag: 'story.r11.denSeen' },
  // M11: the wraiths rise once the three blooms are lit
  { quest: 'm11', objective: 'blooms', flag: 'story.m11.wraithsOut' },
  // M14: golems after the third ledge, hounds after the golems
  { quest: 'm14', objective: 'ledge3', flag: 'story.m14.golemsOut' },
  { quest: 'm14', objective: 'golems', flag: 'story.m14.houndsOut' },
  // M15 and D03: the harpooners come out once their spearmen are down
  { quest: 'm15', objective: 'spearmen', flag: 'story.m15.harpsOut' },
  { quest: 'd03', objective: 'court', flag: 'story.d03.yardOut' },
  { quest: 'd03', objective: 'yard', flag: 'story.d03.perchOut' },
  // M15: the packs come out once the camp has been scouted
  { quest: 'm15', objective: 'scout', flag: 'story.m15.scouted' },
  // M15: the doubting hunter is at the camp once the packs are down
  { quest: 'm15', objective: 'harpooners', flag: 'story.m15.corwinHere' },
  // D03: the keep opens to the player once the courtyard and the walls are clear; the courtyard comes when the gate falls
  { quest: 'd03', objective: 'gate', flag: 'story.d03.gateDown' },
  { quest: 'd03', objective: 'perch', flag: 'story.d03.started' },
];
