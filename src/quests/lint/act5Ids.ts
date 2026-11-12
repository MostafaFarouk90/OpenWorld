// The Act 5 quest ids (contracts v0.9 item 14): m47 to m56, d09, d10, r26 to r30. The lints never allow-list these.
export const ACT5_QUEST_IDS: readonly string[] = [
  ...Array.from({ length: 10 }, (_, i) => `m${47 + i}`),
  'd09', 'd10',
  ...Array.from({ length: 5 }, (_, i) => `r${26 + i}`),
];

/** Phase I (the Rim) and Phase J (the Foundry and the Anvil), plan embers-act-5.md Part 2. */
export const ACT5_PHASE_I: readonly string[] = ['m47', 'm48', 'm49', 'r26', 'r29', 'm50', 'm51', 'm52'];
export const ACT5_PHASE_J: readonly string[] = ['r27', 'r28', 'r30', 'm53', 'd09', 'm54', 'm55', 'd10', 'm56'];

const ID = new RegExp(`(?:^|[^a-z0-9])(?:${ACT5_QUEST_IDS.join('|')})(?![0-9])`);

/** True when a note, interactable, flag or quest id names an Act 5 quest (`note-m52-x`, `story.d09.done`, `r30`). */
export const isAct5Id = (s: string): boolean => ID.test(s);
