// The Act 3 quest ids (contracts v0.7 item 19): m23 to m34, d05, d06, r12 to r18. The lints never allow-list these.
export const ACT3_QUEST_IDS: readonly string[] = [
  ...Array.from({ length: 12 }, (_, i) => `m${23 + i}`),
  'd05', 'd06',
  ...Array.from({ length: 7 }, (_, i) => `r${12 + i}`),
];

const ID = new RegExp(`(?:^|[^a-z0-9])(?:${ACT3_QUEST_IDS.join('|')})(?![0-9])`);

/** True when a note, interactable, flag or quest id names an Act 3 quest (`note-m27-x`, `use:r15-y`, `story.d05.done`, `m30`). */
export const isAct3Id = (s: string): boolean => ID.test(s);
