// The "peaks are next" card (K16, Phase E): once D05 is done, a one-off card says the Greyfen is settled and the
// Dragonspine is next. It reuses the act-ending card widget under its own id and once-flag, so it waits behind any modal,
// dialogue or act-ending card, is re-derived on load, and never shows twice. While the Phase E hold keeps the Dragonspine
// shut, its line says the way up opens in a later update; once the Dragonspine is open, the line drops that clause.
export const PEAKS_CARD_ID = 'the-peaks-are-next';
export const PEAKS_CARD_WIDGET = 'phase-e-peaks-card';
/** K16-owned once-flag (coordinator ruling B, 2026-10-30). */
export const PEAKS_CARD_SEEN_FLAG = 'story.a3.peaksCardSeen';
/** Shows once this is set (the quests service writes `story.<id>.complete` on completion). */
export const PEAKS_CARD_TRIGGER_FLAG = 'story.d05.complete';

export const PHASE_E_STRINGS_EN: Readonly<Record<string, string>> = {
  'hud.phaseE.peaks.title': 'The peaks are next',
  'hud.phaseE.peaks.line.held': "Hathren's fen breathes again. Above the Spine Road, Ysmeryth's peaks wait; the way up opens in a later update.",
  'hud.phaseE.peaks.line.open': "Hathren's fen breathes again. Above the Spine Road, Ysmeryth's peaks wait.",
};

/** The card's body line for the current state of the Phase E hold. */
export const peaksLineKey = (dragonspineOpen: boolean): string =>
  dragonspineOpen ? 'hud.phaseE.peaks.line.open' : 'hud.phaseE.peaks.line.held';
