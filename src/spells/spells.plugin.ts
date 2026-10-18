import type { ActorId, GamePlugin, PluginContext } from '../vfx/ports';
import { BURN, EMBER } from '../vfx/tuning';
import { Burn } from './Burn';
import { Ember } from './Ember';
import { ProjectileSystem } from './Projectile';
import { SpellCaster, type SpellHost } from './SpellCaster';
import { SURGE_DEF } from './spellDefs';
import { registerRally, registerSurge, type RallyRegistration } from './SurgeAndRally';
import { LATE_BIND_RETRY_SECONDS, PLAYER_STAGGER_LOCK_SECONDS } from './tuning';
import type { SpellsService } from './types';

// Importing types.ts for its `declare module` augmentation of ServiceMap.
export type { SpellsService } from './types';

let cleanup: (() => void) | null = null;

const plugin = {
  id: 'spells',
  dependsOn: ['core'],

  setup(ctx: PluginContext): void {
    cleanup?.();
    const offs: Array<() => void> = [];
    const playerId = (): ActorId => ctx.player.actor.id;

    const burn = new Burn();
    const ember = new Ember();
    burn.onChange = (value, previous) => ctx.events.emit('burn.changed', { value, previous });
    ember.onChange = (value, previous) => ctx.events.emit('ember.changed', { value, previous });

    // ---- sim-time state tracked from events
    let simTime = 0;
    let lastCombat = -Infinity;
    let staggeredUntil = -Infinity;
    let blockers = 0;
    let pendingCancel: string | null = null;
    const aggro = new Set<ActorId>();

    const host: SpellHost = {
      events: ctx.events,
      player: ctx.player,
      actors: ctx.actors,
      ember,
      playClip(clip, opts) {
        const controller = ctx.player.avatar?.controller;
        // Without a controller (or before thread 1 lands playOneShot) the cast still runs, just unanimated.
        if (!controller?.playOneShot) return true;
        return controller.playOneShot(clip, opts);
      },
      isStaggered: (id) => id === playerId() && simTime < staggeredUntil,
      isBusy(id) {
        if (id !== playerId()) return false;
        const c = ctx.player.avatar?.controller;
        return !!c && (c.busy === true || c.activeAttack() !== null);
      },
      inputBlocked: () => blockers > 0,
      cancelRequested() {
        const r = pendingCancel;
        pendingCancel = null;
        return r;
      },
    };
    const caster = new SpellCaster(host);
    // Only a running cast can be cancelled; a stale request must not kill the next one.
    const requestCancel = (reason: string): void => { if (caster.state !== 'idle') pendingCancel = reason; };
    const projectiles = new ProjectileSystem({ actors: ctx.actors, heightAt: ctx.heightAt });

    const effectHost = { events: ctx.events, player: ctx.player, actors: ctx.actors };
    const offSurge = registerSurge(effectHost, caster, { damage: ctx.damage, clock: ctx.clock, services: ctx.services, burn });
    const rally: RallyRegistration = registerRally(effectHost, caster, { services: ctx.services });

    const service: SpellsService = {
      get burn() { return burn.value; },
      get scars() { return burn.scars; },
      get ember() { return ember.value; },
      get maxEmber() { return EMBER.max; },
      spendEmber: (n) => ember.spend(n),
      addBurn: (n, source) => void burn.add(n, source),
      clearBurn: (reason) => burn.clear(reason),
      cast: (id) => caster.cast(playerId(), id),
      canCast: (id) => caster.canCast(playerId(), id),
      cooldown: (id) => caster.cooldown(id),
      def: (id) => caster.def(id),
    };
    offs.push(ctx.services.provide('spells', service));

    // ---- persistables (closures, so the registry can call them detached)
    offs.push(ctx.persist.register({ key: burn.key, version: burn.version, serialize: () => burn.serialize(), load: (d, v) => burn.load(d, v) }));
    offs.push(ctx.persist.register({ key: ember.key, version: ember.version, serialize: () => ember.serialize(), load: (d, v) => ember.load(d, v) }));

    // ---- events
    const touchCombat = (): void => { lastCombat = simTime; };
    offs.push(
      ctx.events.on('rest', () => { burn.clear('rest'); requestCancel('rest'); }),
      ctx.events.on('waystone.rekindled', (e) => { if (e.cause === 'player') burn.add(BURN.rekindleGain, 'rekindle'); }),
      ctx.events.on('damage.dealt', (e) => { if (e.attackerId === playerId() || e.targetId === playerId()) touchCombat(); }),
      ctx.events.on('ai.aggro', (e) => {
        if (e.targetId !== playerId()) return;
        aggro.add(e.actorId);
        touchCombat();
      }),
      ctx.events.on('ai.calm', (e) => void aggro.delete(e.actorId)),
      ctx.events.on('actor.died', (e) => void aggro.delete(e.actorId)),
      ctx.events.on('actor.despawned', (e) => void aggro.delete(e.actorId)),
      ctx.events.on('actor.staggered', (e) => { if (e.actorId === playerId()) staggeredUntil = simTime + PLAYER_STAGGER_LOCK_SECONDS; }),
      ctx.events.on('dialogue.started', () => { blockers++; requestCancel('dialogue'); }),
      ctx.events.on('dialogue.ended', () => { blockers = Math.max(0, blockers - 1); }),
      ctx.events.on('cutscene.started', () => { blockers++; requestCancel('cutscene'); }),
      ctx.events.on('cutscene.ended', () => { blockers = Math.max(0, blockers - 1); }),
    );

    // ---- late binding of progression (max-health modifier) and abilities (Rally handler)
    let offModifier: (() => void) | null = null;
    let retryTimer = 0;
    const bindLate = (): void => {
      if (!offModifier) {
        // Returns base * 1 while BURN_MAX_HEALTH_PENALTY_ENABLED is false (deferred, see Burn.ts).
        offModifier = ctx.services.get('progression')?.addMaxHealthModifier('burn', (base) => base * burn.healthMultiplier()) ?? null;
      }
      rally.bindAbilities();
    };
    bindLate();

    // ---- systems
    offs.push(
      ctx.systems.add({
        id: 'spells-input',
        fixedPhase: 'intent',
        order: 100,
        fixedUpdate(_dt, c) {
          if (c.input?.actions.pressed('surge')) caster.cast(playerId(), SURGE_DEF.id);
        },
      }),
      ctx.systems.add({
        id: 'spells-update',
        fixedPhase: 'afterCombat',
        order: 100,
        fixedUpdate(dt) {
          if (!(dt > 0)) return;
          simTime += dt;
          const inCombat = aggro.size > 0 || simTime - lastCombat < BURN.combatHysteresisSeconds;
          burn.decay(dt, inCombat);
          ember.regen(dt);
          caster.update(dt);
          projectiles.update(dt);
          retryTimer += dt;
          if (retryTimer >= LATE_BIND_RETRY_SECONDS) {
            retryTimer = 0;
            bindLate();
          }
        },
      }),
    );

    cleanup = () => {
      cleanup = null;
      caster.cancel('dispose');
      projectiles.clear();
      for (const off of offs.splice(0).reverse()) off();
      offSurge();
      rally.dispose();
      offModifier?.();
      offModifier = null;
      caster.dispose();
    };
  },

  dispose(): void {
    cleanup?.();
  },
} satisfies GamePlugin;

export default plugin;
