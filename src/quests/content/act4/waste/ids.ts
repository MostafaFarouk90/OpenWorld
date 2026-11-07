// The Ashen Waste quests (L11, plans/act4-L11.md), in plan 2.3's play order.
export const WASTE_A4_IDS = ['m42', 'm43', 'm44', 'r25', 'r24', 'm45', 'd08', 'm46'] as const;
export type WasteQuestId = (typeof WASTE_A4_IDS)[number];
/** My anchors (inside L0's reserved `waste.` prefix) and triggers. */
export const W = 'waste.q';
export const TW = 'trg.waste.q';
