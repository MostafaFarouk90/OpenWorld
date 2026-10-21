import * as THREE from 'three';
import { AllyEngagement } from '../actors/allyEngage';
import { PlayerPull } from '../actors/pull';
import { FIXED_TIMESTEP } from '../config/constants';
import { heightAt } from '../terrain/heightfield';
import { Platforms } from '../physics/platforms';
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

    // Moving platforms: Game.fixedUpdate steps them just before the world (controller + physics step), so each frame delta is ready for the carry.
    const carry = (collider: Parameters<Platforms['delta']>[0]) => platforms.delta(collider);
    const platforms: Platforms = new Platforms({
      onArrived: (id, stop) => ctx.events.emit('platform.arrived', { id, stop }),
      // The carry (and its ground ray) runs only while a platform exists; nothing in Act 1 registers one.
      onCountChanged: (n) => ctx.world?.player?.controller?.setPlatformSource?.(n > 0 ? carry : undefined),
      // A save on a platform loads at its last stop: hold every platform still until the load has placed the player.
      paused: () => ctx.services.get('save')?.loading === true,
    });
    ctx.services.provide('platforms', platforms);
    ctx.persist.register({
      key: 'platforms',
      version: 1,
      serialize: () => platforms.serialize(),
      load: (data) => platforms.load(data),
    });

    ctx.events.on('mercy', (e) => ctx.state.recordMercy(e));
    ctx.events.on('damage.dealt', (r) => {
      // Only the player breaks a mercy: scripted kills, falls, hostile area hits and (v0.6) allies' hits do not.
      if (r.outcome !== 'hit' || r.kind === 'script' || !ctx.state.isMercied(r.targetId)) return;
      const attacker = r.attackerId ? ctx.actors.get(r.attackerId) : undefined;
      if (attacker && attacker.team === 'player') ctx.state.revokeMercy(r.targetId);
    });
    ctx.events.on('actor.despawned', (e) => ctx.state.forgetMercy(e.actorId));
    ctx.services.provide('allyEngagement', new AllyEngagement(ctx.events, ctx.actors));

    // v0.6 pull on the player: held through the combat verbs' forced move (walls stop it), before they apply it.
    const at = new THREE.Vector3();
    const pull = new PlayerPull(
      {
        playerId: () => ctx.player.actor.id,
        invulnerable: () => ctx.player.actor.invulnerable,
        playerFeet: () => ctx.player.feet,
        sourcePosition: (id) => {
          const a = ctx.actors.get(id);
          return a ? a.worldPosition(at) : null;
        },
        heightAt,
        hold: (move) => ctx.services.get('combatVerbs')?.holdForcedMove('core.pull', move),
      },
      FIXED_TIMESTEP,
    );
    ctx.events.on('actor.pulled', (e) => pull.onPulled(e));
    ctx.events.on('save.loaded', () => pull.stop());
    ctx.systems.add({ id: 'core.pull', fixedPhase: 'intent', order: 5, fixedUpdate: () => pull.fixedUpdate() });

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
