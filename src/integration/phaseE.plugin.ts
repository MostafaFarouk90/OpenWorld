// Plugin `phase-e`: the "peaks are next" card after D05 (K16, logic and text in phaseECard.ts).
import type { GamePlugin } from '../core/plugins';
import { ActEndingCard, type KeySource } from '../hud/ActEndingCard';
import { asHtml, hudDocument } from '../hud/soft';
import {
  PEAKS_CARD_ID, PEAKS_CARD_SEEN_FLAG, PEAKS_CARD_TRIGGER_FLAG, PEAKS_CARD_WIDGET, PHASE_E_STRINGS_EN, peaksLineKey,
} from './phaseECard';
import { DRAGONSPINE_OPEN_FLAG } from '../quests/act3Jump';

/** The card under `__phaseECard` for smoke runs and tests. */
export type PhaseECardHandle = ActEndingCard;

const plugin: GamePlugin = {
  id: 'phase-e',
  dependsOn: ['core', 'hud'],
  setup(ctx) {
    ctx.strings.register('en', PHASE_E_STRINGS_EN);
    const t = (key: string, params?: Record<string, string | number>): string => ctx.strings.t(key, params);
    const keys = typeof globalThis.addEventListener === 'function' ? (globalThis as unknown as KeySource) : null;
    const card = new ActEndingCard(hudDocument(), {
      widgetId: PEAKS_CARD_WIDGET,
      ending: { act: 3, endingId: PEAKS_CARD_ID, titleKey: 'hud.phaseE.peaks.title' },
      t,
      keys,
      // Waits out the D05 hand-in dialogue, any modal and an act-ending card.
      modalOpen: () =>
        ctx.hud.modalOpen !== null || ctx.services.get('dialogue')?.active === true || ctx.services.get('actEndingCard')?.active() === true,
      seen: () => ctx.state.getBool(PEAKS_CARD_SEEN_FLAG),
      markSeen: () => ctx.state.setFlag(PEAKS_CARD_SEEN_FLAG, true),
      recap: () => [t(peaksLineKey(ctx.state.getBool(DRAGONSPINE_OPEN_FLAG)))],
    });
    ctx.events.on('save.loaded', () => card.onLoaded());
    ctx.gates.flag(PEAKS_CARD_TRIGGER_FLAG, (open) => card.onGate(open));
    ctx.hud.mount('center', { id: card.id, element: asHtml(card.element), order: 3, update: (dt) => card.update(dt), dispose: () => card.dispose() });
    (globalThis as { __phaseECard?: PhaseECardHandle }).__phaseECard = card;
  },
  dispose() {
    delete (globalThis as { __phaseECard?: unknown }).__phaseECard;
  },
};

export default plugin;
