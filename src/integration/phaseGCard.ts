// "The Waste is next" (L13, Phase G; plan 2.2, Q8, Q11): once M41 is done, a one-off card says Harrowmark has fallen to Vey
// and the Ashen Waste is next. It reuses the act-ending card widget under its own id and once-flag, so it waits behind any
// modal, dialogue, running scene or act-ending card, is re-derived on load and never shows twice. While the Phase G hold
// stood the line ended "the way in is not yet open" (coordinator change C); PR 2 retired the hold and dropped that clause, so
// the card says what is true once M41 is done: the Waste waits, and M42 opens it.
export const WASTE_CARD_ID = 'the-waste-is-next';
export const WASTE_CARD_WIDGET = 'phase-g-waste-card';
/** L13-owned once-flag (coordinator ruling B, 2026-11-06). */
export const WASTE_CARD_SEEN_FLAG = 'story.a4.wasteCardSeen';
/** Shows once this is set (the quests service writes `story.<id>.complete` on completion). */
export const WASTE_CARD_TRIGGER_FLAG = 'story.m41.complete';

export const PHASE_G_STRINGS_EN: Readonly<Record<string, string>> = {
  'hud.phaseG.waste.title': 'The Waste is next',
  'hud.phaseG.waste.line': 'Harrowmark is Vey\'s. Edric has named Ashgate, and past it the Ashen Waste waits.',
};

/** The card's body line. */
export const WASTE_LINE_KEY = 'hud.phaseG.waste.line';
