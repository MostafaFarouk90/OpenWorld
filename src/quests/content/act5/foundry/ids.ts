// Act 5 N11 (plans/act5-N11.md): the Foundry and Anvil quests' ids and prefixes. Anchors this block adds start `caldera.q.f.`
// (inside N0's `caldera.` prefix), triggers `trg.caldera.q.f.`, prompt keys `quest.prompt.a5f.`, strings `quest.<id>.`.
export const FOUNDRY_A5_PHASE_J = ['r27', 'r28', 'r30', 'm53', 'd09'] as const;
export const FOUNDRY_A5_DESCENT = ['m54', 'm55', 'd10', 'm56'] as const;
/** The quests this block owns, in plan 2.2's play order. */
export const FOUNDRY_A5_IDS = [...FOUNDRY_A5_PHASE_J, ...FOUNDRY_A5_DESCENT] as const;
export type FoundryQuestId = (typeof FOUNDRY_A5_IDS)[number];
/** The anchor prefix of this block's own anchors. */
export const F = 'caldera.q.f';
/** The trigger prefix. */
export const FT = 'trg.caldera.q.f';
