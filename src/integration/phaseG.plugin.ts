// Plugin `phase-g`: the "Waste is next" card after M41 (L13, logic and text in phaseGCard.ts).
import type { GamePlugin } from '../core/plugins';
import { ActEndingCard, type KeySource } from '../hud/ActEndingCard';
import { asHtml, hudDocument } from '../hud/soft';
import {
  PHASE_G_STRINGS_EN, WASTE_CARD_ID, WASTE_CARD_SEEN_FLAG, WASTE_CARD_TRIGGER_FLAG, WASTE_CARD_WIDGET, WASTE_LINE_KEY,
} from './phaseGCard';

/** The card under `__phaseGCard` for smoke runs and tests. */
export type PhaseGCardHandle = ActEndingCard;

const plugin: GamePlugin = {
  id: 'phase-g',
  dependsOn: ['core', 'hud'],
  setup(ctx) {
    ctx.strings.register('en', PHASE_G_STRINGS_EN);
    const t = (key: string, params?: Record<string, string | number>): string => ctx.strings.t(key, params);
    const keys = typeof globalThis.addEventListener === 'function' ? (globalThis as unknown as KeySource) : null;
    const card = new ActEndingCard(hudDocument(), {
      widgetId: WASTE_CARD_WIDGET,
      ending: { act: 4, endingId: WASTE_CARD_ID, titleKey: 'hud.phaseG.waste.title' },
      t,
      keys,
      // Waits out M41's camp dialogue, a running scene, any modal and an act-ending card.
      modalOpen: () =>
        ctx.hud.modalOpen !== null ||
        ctx.services.get('dialogue')?.active === true ||
        (ctx.services.get('scenes')?.active ?? null) !== null ||
        ctx.services.get('actEndingCard')?.active() === true,
      seen: () => ctx.state.getBool(WASTE_CARD_SEEN_FLAG),
      markSeen: () => ctx.state.setFlag(WASTE_CARD_SEEN_FLAG, true),
      recap: () => [t(WASTE_LINE_KEY)],
    });
    ctx.events.on('save.loaded', () => card.onLoaded());
    ctx.gates.flag(WASTE_CARD_TRIGGER_FLAG, (open) => card.onGate(open));
    ctx.hud.mount('center', { id: card.id, element: asHtml(card.element), order: 3, update: (dt) => card.update(dt), dispose: () => card.dispose() });
    (globalThis as { __phaseGCard?: PhaseGCardHandle }).__phaseGCard = card;
  },
  dispose() {
    delete (globalThis as { __phaseGCard?: unknown }).__phaseGCard;
  },
};

export default plugin;
