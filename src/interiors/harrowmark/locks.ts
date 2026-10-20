/**
 * Which flag opens each Harrowmark door (plans/slice-2-interiors-nav-phase-b.md section 5, settled 17:23 and 17:27 UTC). A door is
 * locked from outside while its flag is unset; exits are never locked. All four flags are set once and never cleared, so the
 * Counting-House stays open for later acts. Read through `ctx.gates`, so a load re-derives them with no `flag.changed`.
 */
export const HARROWMARK_DOOR_LOCKS: Readonly<Record<string, string>> = {
  // Thread 19 writes it on M07 o4 (the back room is earned).
  'tilted-anvil-back': 'world.harrowmark.inn.room',
  // Thread 6 writes these at quest start or o1.
  'keep-hall': 'story.m08.keepOpen',
  'counting-house': 'story.m09.houseOpen',
  underways: 'story.d02.underwaysOpen',
  // Act 1 density pass, batch 2 (quests thread; additive): the chapel vault stays shut until D01 is taken.
  vault: 'story.d01.vaultOpen',
};

/** Blockers closed while their flag is unset: the corridor to the back room follows the back door. */
export const HARROWMARK_FLAG_BLOCKERS: Readonly<Record<string, string>> = {
  'tilted-anvil.backroom.gate': 'world.harrowmark.inn.room',
  // Density pass, batch 2: the vault's arena gate opens once the antechamber's wraiths are down (the Prior's arena still
  // closes and reopens it during his fight).
  'vault.arena.gate': 'story.d01.antechamberClear',
  // Batch 3: the Archive stacks open with Whitlock's key in R04 (and stay open after).
  'archive.stacks.gate': 'story.r04.stacksOpen',
};

/** M09's invoices (thread 6 counts `use:m09-invoice-<n>` and writes `story.m09.invoice.<n>` when one is taken). */
export const M09_INVOICES = [1, 2, 3].map((n) => ({
  id: `use:m09-invoice-${n}`,
  anchor: `m09.invoice-${n}`,
  takenFlag: `story.m09.invoice.${n}`,
}));
