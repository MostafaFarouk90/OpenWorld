// Plugin `phase-i`: "The Rim holds" card after M52 (N12 PR 1, logic and text in phaseICard.ts; the Phase G card's pattern).
import type { GamePlugin } from '../core/plugins';
import { ActEndingCard, type KeySource } from '../hud/ActEndingCard';
import { asHtml, hudDocument } from '../hud/soft';
import {
  PHASE_I_STRINGS_EN, RIM_CARD_ID, RIM_CARD_SEEN_FLAG, RIM_CARD_TRIGGER_FLAG, RIM_CARD_WIDGET, RIM_LINE_KEY, RIM_TITLE_KEY,
} from './phaseICard';

/** The card under `__phaseICard` for smoke runs and tests. */
export type PhaseICardHandle = ActEndingCard;

const plugin: GamePlugin = {
  id: 'phase-i',
  dependsOn: ['core', 'hud'],
  setup(ctx) {
    ctx.strings.register('en', PHASE_I_STRINGS_EN);
    const t = (key: string, params?: Record<string, string | number>): string => ctx.strings.t(key, params);
    const keys = typeof globalThis.addEventListener === 'function' ? (globalThis as unknown as KeySource) : null;
    const card = new ActEndingCard(hudDocument(), {
      widgetId: RIM_CARD_WIDGET,
      ending: { act: 5, endingId: RIM_CARD_ID, titleKey: RIM_TITLE_KEY },
      t,
      keys,
      // Waits out M52's hand-in, a running scene, any modal and an act-ending card.
      modalOpen: () =>
        ctx.hud.modalOpen !== null ||
        ctx.services.get('dialogue')?.active === true ||
        (ctx.services.get('scenes')?.active ?? null) !== null ||
        ctx.services.get('actEndingCard')?.active() === true,
      seen: () => ctx.state.getBool(RIM_CARD_SEEN_FLAG),
      markSeen: () => ctx.state.setFlag(RIM_CARD_SEEN_FLAG, true),
      recap: () => [t(RIM_LINE_KEY)],
    });
    ctx.events.on('save.loaded', () => card.onLoaded());
    ctx.gates.flag(RIM_CARD_TRIGGER_FLAG, (open) => card.onGate(open));
    ctx.hud.mount('center', { id: card.id, element: asHtml(card.element), order: 3, update: (dt) => card.update(dt), dispose: () => card.dispose() });
    (globalThis as { __phaseICard?: PhaseICardHandle }).__phaseICard = card;
  },
  dispose() {
    delete (globalThis as { __phaseICard?: unknown }).__phaseICard;
  },
};

export default plugin;
