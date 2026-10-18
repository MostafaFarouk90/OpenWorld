import { heightAt } from '../terrain/heightfield';
import { looseService, type ActorId, type GamePlugin, type PluginContext } from '../vfx/ports';
import { BURN, EMBER } from '../vfx/tuning';
import { Burn, type BurnZone } from './Burn';
import { createBanner } from './BannerPlant';
import { LeapController } from './Leap';
import { Ember } from './Ember';
import { ProjectileSystem } from './Projectile';
import { SpellCaster, type SpellHost } from './SpellCaster';
import { SURGE_DEF } from './spellDefs';
import { createSurgeForms, registerRally, registerSurge, type RallyRegistration, type SurgeFormImpl } from './SurgeAndRally';
import { onLoose } from './looseEvents';
import { BANNER, LATE_BIND_RETRY_SECONDS, LEAP, LEAP_ABILITY_ID, PLAYER_STAGGER_LOCK_SECONDS } from './tuning';
import { abilitiesOf, type SpellsService } from './types';

/** Thread 1's controller additions (playOneShot, busy); absent until it merges. */
interface OneShotController {
  playOneShot?(clip: string, opts?: { lockMove?: boolean }): boolean;
  readonly busy?: boolean;
  /** The running action (block, dodge, hit reaction, death), or null. */
  readonly currentAction?: string | null;
  activeAttack(): unknown;
}

// Importing types.ts for its `declare module` augmentation of ServiceMap.
export type { SpellsService } from './types';

let cleanup: (() => void) | null = null;

const plugin = {
  id: 'spells',
  dependsOn: ['core'],

  setup(ctx: PluginContext): void {
    cleanup?.();
    const offs: Array<() => void> = [];
    try {
      build(ctx, offs);
    } catch (err) {
      // A failed setup (for example persist.register throwing) must leave no listeners, systems or services behind.
      for (const off of offs.splice(0).reverse()) off();
      cleanup = null;
      throw err;
    }
  },

  dispose(): void {
    cleanup?.();
  },
} satisfies GamePlugin;

function build(ctx: PluginContext, offs: Array<() => void>): void {
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
        const controller = ctx.player.avatar?.controller as unknown as OneShotController | undefined;
        // Without a controller (or before thread 1 lands playOneShot) the cast still runs, just unanimated.
        if (!controller?.playOneShot) return true;
        return controller.playOneShot(clip, opts);
      },
      isStaggered: (id) => id === playerId() && simTime < staggeredUntil,
      isBusy(id) {
        if (id !== playerId()) return false;
        const c = ctx.player.avatar?.controller as unknown as OneShotController | undefined;
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
    const projectiles = new ProjectileSystem({ actors: ctx.actors, heightAt });
    offs.push(() => caster.dispose());

    // ---- the single shard-use path (Surge, Leap, rekindle, Release): decides the Scar and its consequences
    const setScarFlag = (): void => {
      const state = ctx.state as { getFlag?(k: string): unknown; setFlag?(k: string, v: number): void } | undefined;
      if (!state?.setFlag) return;
      if (burn.scars === 0 && state.getFlag?.('story.f10.scars') === undefined) return;
      state.setFlag('story.f10.scars', burn.scars);
    };
    const onScar = (source: string): void => {
      ctx.events.emit('scar.added', { total: burn.scars, source });
      setScarFlag();
      // A Scar at an unchanged Burn (a Surge at 100) fires no burn.changed, so refresh max health here.
      looseService(ctx.services, 'progression')?.refreshMaxHealth?.();
      const feet = ctx.player.feet;
      const vfx = ctx.services.get('vfx');
      vfx?.spawnEffect('ember-burst', { position: { x: feet.x, y: feet.y + 1.2, z: feet.z } });
      vfx?.pulseScreen(0.5, 0.4, 0xff4020);
    };
    const useShard = (gain: number, source: string, scarred?: boolean): { gained: number; scarred: boolean } => {
      const r = burn.useShard(gain, source, scarred);
      if (r.scarred) onScar(source);
      return r;
    };

    const forms = createSurgeForms();
    const effectHost = { events: ctx.events, player: ctx.player, actors: ctx.actors };
    const offSurge = registerSurge(effectHost, caster, {
      damage: ctx.damage,
      clock: ctx.clock,
      services: ctx.services,
      burn,
      useShard: (gain, source) => useShard(gain, source),
      forms,
      classId: () => looseService(ctx.services, 'progression')?.classId,
    });
    offs.push(offSurge);

    // ---- the Surge Leap
    const learnedLeap = (): boolean => (ctx.state as { getFlag?(k: string): unknown } | undefined)?.getFlag?.(`ability.${LEAP_ABILITY_ID}.learned`) === true;
    const controller = (): OneShotController | undefined => ctx.player.avatar?.controller as unknown as OneShotController | undefined;
    const leap = new LeapController({
      learned: learnedLeap,
      alive: () => !ctx.player.actor.dead,
      busyReason() {
        if (host.isStaggered(playerId())) return 'staggered';
        if (host.inputBlocked()) return 'blocked';
        if (caster.state !== 'idle') return 'casting';
        const c = controller();
        if (host.isBusy(playerId()) || (c?.currentAction ?? null) !== null) return 'busy';
        return null;
      },
      zone: (): BurnZone => burn.zone(),
      feetY: () => ctx.player.feet.y,
      startLeap: (o) => ctx.player.leap(o),
      useShard: (g, s, scarred) => void useShard(g, s, scarred),
      onLaunch() {
        const f = ctx.player.feet;
        const vfx = ctx.services.get('vfx');
        vfx?.spawnEffect('shockwave-ring', { position: { x: f.x, y: f.y, z: f.z }, scale: 0.5 });
        vfx?.fovPunch(LEAP.fovPunch, LEAP.fovSeconds);
        vfx?.pulseScreen(LEAP.pulse, LEAP.pulseSeconds, 0xffb040);
      },
    });
    offs.push(ctx.events.on('player.leap', (e) => leap.onPhase(e.phase, simTime)));

    // ---- Banner Plant
    const banner = createBanner({ events: ctx.events, scene: ctx.scene, services: ctx.services, player: ctx.player });
    offs.push(() => banner.dispose());
    const damageHost = ctx.damage as unknown as { addModifier?(id: string, fn: (req: never, target: never) => void, order?: number): () => void };
    const offBannerMod = damageHost.addModifier?.('banner-plant', (req, target) => banner.modify(req as never, target as never), 50);
    if (offBannerMod) offs.push(offBannerMod);
    const rally: RallyRegistration = registerRally(effectHost, caster, { services: ctx.services });
    offs.push(() => rally.dispose());

    const service: SpellsService = {
      get burn() { return burn.value; },
      get scars() { return burn.scars; },
      get ember() { return ember.value; },
      get maxEmber() { return EMBER.max; },
      spendEmber: (n) => ember.spend(n),
      addBurn: (n, source) => void burn.add(n, source),
      useShard: (gain, source) => useShard(gain, source),
      registerSurgeForm: (classId, zone, impl: SurgeFormImpl) => forms.register(classId, zone, impl),
      leap: {
        get learned() { return learnedLeap(); },
        cooldown: () => ({ remaining: leap.remaining(simTime), total: LEAP.cooldownSeconds }),
      },
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
    const unaggro = (id: ActorId): void => {
      if (aggro.delete(id) && aggro.size === 0) touchCombat();
    };
    offs.push(
      ctx.events.on('rest', () => {
        burn.clear('rest');
        requestCancel('rest');
        // The rest healed to the Burn-reduced maximum before this ran; clearing Burn raised it, so top up to the new one.
        const me = ctx.actors.player;
        if (!me.dead) me.health = me.maxHealth;
      }),
      // The single charger of a rekindle (shrines and waystones alike): +10, and a Scar at Burn 75 or more.
      ctx.events.on('waystone.rekindled', (e) => { if (e.cause === 'player') useShard(BURN.rekindleGain, 'rekindle'); }),
      // Same definition as the music director: combat while a hostile targets the player, plus a hysteresis window
      // after the last aggro or damage to the player, and after the aggro set empties.
      ctx.events.on('damage.dealt', (e) => { if (e.targetId === playerId()) touchCombat(); }),
      ctx.events.on('ai.aggro', (e) => {
        if (e.targetId !== playerId()) return;
        aggro.add(e.actorId);
        touchCombat();
      }),
      ctx.events.on('ai.calm', (e) => unaggro(e.actorId)),
      ctx.events.on('actor.died', (e) => unaggro(e.actorId)),
      ctx.events.on('actor.despawned', (e) => unaggro(e.actorId)),
      onLoose<{ actorId: ActorId }>(ctx.events, 'mercy', (e) => unaggro(e.actorId)),
      onLoose<{ id: string; open: boolean }>(ctx.events, 'ui.modal', (e) => { if (e.open) requestCancel('modal'); }),
      ctx.events.on('save.loaded', () => { requestCancel('load'); aggro.clear(); lastCombat = -Infinity; leap.reset(); banner.clear(); setScarFlag(); }),
      ctx.events.on('actor.staggered', (e) => { if (e.actorId === playerId()) staggeredUntil = simTime + PLAYER_STAGGER_LOCK_SECONDS; }),
      ctx.events.on('dialogue.started', () => { blockers++; requestCancel('dialogue'); }),
      ctx.events.on('dialogue.ended', () => { blockers = Math.max(0, blockers - 1); }),
      ctx.events.on('cutscene.started', () => { blockers++; requestCancel('cutscene'); }),
      ctx.events.on('cutscene.ended', () => { blockers = Math.max(0, blockers - 1); }),
    );

    // ---- late binding of progression (max-health modifier) and abilities (Rally handler)
    let offModifier: (() => void) | null = null;
    offs.push(() => { offModifier?.(); offModifier = null; });
    let retryTimer = 0;
    let offBannerHandler: (() => void) | null = null;
    offs.push(() => { offBannerHandler?.(); offBannerHandler = null; });
    let bannerBindFailed = false;
    const bindBanner = (): void => {
      if (offBannerHandler || bannerBindFailed) return;
      const abilities = abilitiesOf(ctx.services);
      if (!abilities) return;
      try {
        const reg = abilities.registerHandler(BANNER.skillId, () => {
          banner.plant(simTime);
          return { ok: true };
        });
        if (reg.ok) offBannerHandler = reg.dispose;
        else bannerBindFailed = true;
      } catch (err) {
        // A second registration for the skill cannot succeed on retry: stop trying.
        bannerBindFailed = true;
        console.warn(`[spells] could not register the ${BANNER.skillId} handler`, err);
      }
    };
    const bindLate = (): void => {
      if (!offModifier) {
        // Returns base * 1 while BURN_MAX_HEALTH_PENALTY_ENABLED is false (deferred, see Burn.ts).
        offModifier = looseService(ctx.services, 'progression')?.addMaxHealthModifier('burn', () => burn.healthMultiplier()) ?? null;
      }
      rally.bindAbilities();
      bindBanner();
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
          if (c.input?.actions.pressed('surgeLeap')) leap.press(simTime);
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
          leap.update(simTime);
          banner.update(simTime, looseService(ctx.services, 'progression')?.learned(BANNER.skillId) ?? false);
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
    };
}

export default plugin;
