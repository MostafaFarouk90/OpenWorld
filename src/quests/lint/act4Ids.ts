// The Act 4 quest ids (contracts v0.8 item 15): m35 to m46, d07, d08, r19 to r25. The lints never allow-list these.
export const ACT4_QUEST_IDS: readonly string[] = [
  ...Array.from({ length: 12 }, (_, i) => `m${35 + i}`),
  'd07', 'd08',
  ...Array.from({ length: 7 }, (_, i) => `r${19 + i}`),
];

/** Phase G (Harrowmark) and Phase H (the Ashen Waste) quests, plan Part 2. */
export const ACT4_PHASE_G: readonly string[] = ['m35', 'm36', 'r19', 'r20', 'r21', 'r22', 'r23', 'd07', 'm37', 'm38', 'm39', 'm40', 'm41'];
export const ACT4_PHASE_H: readonly string[] = ['m42', 'm43', 'm44', 'r25', 'r24', 'm45', 'd08', 'm46'];

const ID = new RegExp(`(?:^|[^a-z0-9])(?:${ACT4_QUEST_IDS.join('|')})(?![0-9])`);

/** True when a note, interactable, flag or quest id names an Act 4 quest (`note-m38-x`, `use:r20-y`, `story.d07.done`, `m40`). */
export const isAct4Id = (s: string): boolean => ID.test(s);
