/**
 * Keyed grates (Act 1 side job j11, the quests thread; additive). A grate is a closed blocker that opens when its flag is on and
 * an interactable that turns the key: with the key in the pack, F on `openId` writes the flag (the blocker re-derives from it
 * through the flag blockers in locks.ts, and a load re-derives it again); without the key, `shutId` is the only thing in reach and
 * it only says so. The two never answer together, so a quest that counts `openId` is never credited by a refusal.
 */
export interface KeyedGrate {
  /** the interactable that opens it (enabled only with the key, while shut) */
  openId: string;
  /** the interactable that refuses (enabled only without the key, while shut) */
  shutId: string;
  /** interior anchor both stand at */
  anchor: string;
  /** the world flag the key turns (non-story: `world.` prefix) */
  openFlag: string;
  itemId: string;
  openPromptKey: string;
  shutPromptKey: string;
  refusedKey: string;
}

export const KEYED_GRATES: readonly KeyedGrate[] = [
  {
    openId: 'use:j11-grate', shutId: 'use:j11-grate-shut', anchor: 'j11.grate', openFlag: 'world.underways.cartway', itemId: 'sewer-master-key',
    openPromptKey: 'interior.j11.grate.open', shutPromptKey: 'interior.j11.grate.shut', refusedKey: 'interior.j11.grate.refused',
  },
];

/** Which of the two interactables answers now. */
export function grateAnswer(open: boolean, hasKey: boolean): 'none' | 'open' | 'shut' {
  if (open) return 'none';
  return hasKey ? 'open' : 'shut';
}
