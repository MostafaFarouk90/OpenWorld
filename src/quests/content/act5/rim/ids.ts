// The Rim quests (Act 5 N10, plans/act5-N10.md), in plan 2.1's play order: PR 1 M47 to M51, R26 and R29; PR 2 M52.
export const RIM_A5_IDS = ['m47', 'm48', 'm49', 'r26', 'r29', 'm50', 'm51', 'm52'] as const;
export type RimQuestId = (typeof RIM_A5_IDS)[number];
/** My anchors (inside v0.9's reserved `caldera.` prefix) and triggers (`trg.caldera.`). */
export const Q = 'caldera.q';
export const TQ = 'trg.caldera.q';
/** The M48 stand-in sites agreed with N1 (N1 PR 2 builds the channels, vents and gantries on these ids). */
export const STAIR = 'caldera.stair';
export const TSTAIR = 'trg.caldera.stair';
/** Cooling Hall anchors are N2's (`caldera.int.cooling.*`, src/caldera/interiors/coolingHall.ts). */
export const COOL = 'caldera.int.cooling';
export const TCOOL = 'trg.caldera.int.cooling';
