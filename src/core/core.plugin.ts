import { createPromptWidget } from '../interaction/PromptWidget';
import type { GamePlugin } from './plugins';
import { CORE_STRINGS_EN } from './strings.en';

/**
 * Built-in plugin, always first: strings, the world-state persistable, mercy into favour (and its
 * revocation when a mercied creature is struck), and the interaction prompt.
 */
const core: GamePlugin = {
  id: 'core',
  setup(ctx) {
    ctx.strings.register('en', CORE_STRINGS_EN);
    ctx.persist.register(ctx.state);

    ctx.events.on('mercy', (e) => ctx.state.recordMercy(e));
    ctx.events.on('damage.dealt', (r) => {
      // Only the player's side breaks a mercy: scripted kills, falls and hostile area hits do not.
      if (r.outcome !== 'hit' || r.kind === 'script' || !ctx.state.isMercied(r.targetId)) return;
      const attacker = r.attackerId ? ctx.actors.get(r.attackerId) : undefined;
      if (attacker && (attacker.team === 'player' || attacker.team === 'ally')) ctx.state.revokeMercy(r.targetId);
    });
    ctx.events.on('actor.despawned', (e) => ctx.state.forgetMercy(e.actorId));

    // Headless runs (tests) have no DOM to draw the prompt into.
    if (typeof document !== 'undefined') {
      ctx.hud.mount(
        'bottom-center',
        createPromptWidget({
          interaction: ctx.interaction,
          text: (key, params) => ctx.strings.t(key, params),
          glyph: () => ctx.input.bindings.glyph('interact'),
          mercyGlyph: () => ctx.input.bindings.glyph('mercy'),
        }),
      );
    }
  },
};

export default core;
