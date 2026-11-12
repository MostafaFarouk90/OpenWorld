// "The Rim holds" (N12 PR 1, Phase I; plan 2.1, Q11): once M52 is done, a one-off card says the gate held and Vey has
// fallen back into the Foundry. It reuses the act-ending card widget under its own id and once-flag, so it waits behind any
// modal, dialogue, running scene or act-ending card, is re-derived on load and never shows twice. PR 1's line ended "That
// door stays shut for now" while the Phase I hold stood; PR 2 retired the hold and dropped that sentence, so the card says
// what is true.
export const RIM_CARD_ID = 'the-rim-holds';
export const RIM_CARD_WIDGET = 'phase-i-rim-card';
/** N12-owned once-flag (ACT5_FLAG_OWNERS). */
export const RIM_CARD_SEEN_FLAG = 'story.a5.rimCardSeen';
/** Shows once this is set (the quests service writes `story.<id>.complete` on completion). */
export const RIM_CARD_TRIGGER_FLAG = 'story.m52.complete';

export const RIM_TITLE_KEY = 'hud.phaseI.rim.title';
export const RIM_LINE_KEY = 'hud.phaseI.rim.line';

export const PHASE_I_STRINGS_EN: Readonly<Record<string, string>> = {
  [RIM_TITLE_KEY]: 'The Rim holds',
  [RIM_LINE_KEY]:
    "The gate held and Vey's warhost broke on the stairs. He has fallen back behind the Inner Gate, into the Foundry.",
};
