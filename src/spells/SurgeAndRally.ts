import type { ActorsLike, ClockLike, DamageLike, EventsLike, PlayerLike, ServicesLike, Vec3 } from '../vfx/ports';
import { BURN, RALLY, SURGE } from '../vfx/tuning';
import type { Burn } from './Burn';
import { actorsInRadius } from './areas';
import { RALLY_DEF, SURGE_DEF } from './spellDefs';
import type { ReleaseContext, SpellCaster } from './SpellCaster';
import { RALLY_FX, RALLY_SKILL_ID, SURGE_FX } from './tuning';
import { abilitiesOf } from './types';

/** What the spell effects need from the game (a subset of SpellHost plus the core services). */
export interface SpellEffectHost {
  events: EventsLike;
  player: PlayerLike;
  actors: ActorsLike;
}
export interface SpellEffectDeps {
  damage: DamageLike;
  clock: ClockLike;
  services: ServicesLike;
  burn: Burn;
}

function horizontalDir(from: Vec3, to: Vec3, fallbackYaw: number): Vec3 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: Math.sin(fallbackYaw), y: 0, z: Math.cos(fallbackYaw) };
  return { x: dx / len, y: 0, z: dz / len };
}

function feetOf(host: SpellEffectHost): Vec3 {
  const f = host.player.feet;
  return { x: f.x, y: f.y, z: f.z };
}

/** Registers the Heartshard Surge on the caster. Returns the unregister function. */
export function registerSurge(host: SpellEffectHost, caster: SpellCaster, deps: SpellEffectDeps): () => void {
  const { services, damage, burn, clock } = deps;
  const offCast = host.events.on('spell.cast', (e) => {
    if (e.spellId === SURGE_DEF.id && SURGE_DEF.soundCharge) services.get('audio')?.play(SURGE_DEF.soundCharge);
  });

  const offDef = caster.register(SURGE_DEF, (ctx: ReleaseContext) => {
    const feet = feetOf(host);
    const zone = burn.zone();
    const radius = SURGE.zoneRadius[zone];
    const scale = radius / SURGE.radius;
    const poise = zone === 'cinder' ? SURGE.cinderPoise : SURGE.poise;

    // One damage.apply per hostile target; direction lets the damage thread knock back.
    for (const hit of actorsInRadius(host.actors, feet, radius, { team: 'hostile', alive: true })) {
      damage.apply({
        attackerId: ctx.casterId,
        targetId: hit.actor.id,
        amount: SURGE.damage,
        poise,
        kind: 'spell',
        attackId: SURGE.spellId,
        point: hit.position,
        direction: horizontalDir(feet, hit.position, host.player.facingYaw),
      });
    }

    const me = host.actors.get(ctx.casterId);
    if (me) damage.heal(ctx.casterId, me.maxHealth * SURGE.healFraction);
    burn.add(BURN.surgeGain, 'surge');

    const vfx = services.get('vfx');
    vfx?.spawnEffect('surge', { position: feet, scale }, { zone });
    vfx?.pulseScreen(SURGE_FX.pulse[zone], SURGE_FX.pulseSeconds, SURGE_FX.pulseColor[zone]);
    clock.hitStop(SURGE.hitStop);
    vfx?.shake(SURGE_FX.shake[zone], SURGE_FX.shakeSeconds[zone]);
    if (SURGE_DEF.soundRelease) services.get('audio')?.play(SURGE_DEF.soundRelease, { position: feet });
  });

  return () => {
    offCast();
    offDef();
  };
}

export interface RallyRegistration {
  /** Registers the abilities handler if the service exists and it is not registered yet. */
  bindAbilities(): boolean;
  dispose(): void;
}

/** Registers Rally Cry on the caster, and (when present) as the abilities handler of RALLY_SKILL_ID. */
export function registerRally(host: SpellEffectHost, caster: SpellCaster, deps: Pick<SpellEffectDeps, 'services'>): RallyRegistration {
  const { services } = deps;
  const playerId = (): string => host.player.actor.id;
  const offDef = caster.register(RALLY_DEF, (ctx: ReleaseContext) => {
    const feet = feetOf(host);
    const seen = new Set<string>();
    const targets = [
      ...actorsInRadius(host.actors, feet, RALLY.radius, { team: ['player', 'ally'], alive: true }).map((h) => h.actor),
    ];
    const me = host.actors.get(ctx.casterId);
    if (me && !me.dead && !targets.includes(me)) targets.push(me);
    for (const a of targets) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      a.restoreStamina(a.maxStamina * RALLY.staminaFraction);
    }
    // The 'skill-q' effect multiplies scale by params.radius, so the scale stays 1.
    services.get('vfx')?.spawnEffect('skill-q', { position: feet, scale: 1 }, { radius: RALLY.radius, color: RALLY_FX.color });
    if (RALLY_DEF.soundRelease) services.get('audio')?.play(RALLY_DEF.soundRelease, { position: feet });
  });

  let offHandler: (() => void) | null = null;
  let bindFailed = false;
  const bindAbilities = (): boolean => {
    if (offHandler) return true;
    if (bindFailed) return false;
    const abilities = abilitiesOf(services);
    if (!abilities) return false;
    try {
      // Thread 5 spends the cost and starts the cooldown after this returns ok, so the cast itself is free.
      offHandler = abilities.registerHandler(RALLY_SKILL_ID, ({ caster: actor }) => {
        const r = caster.cast(actor?.id ?? playerId(), RALLY_DEF.id);
        return r.ok ? { ok: true } : { ok: false, reason: r.reason };
      });
    } catch (err) {
      // A second registration for the skill throws. Retrying every second cannot succeed, so log once and stop.
      bindFailed = true;
      console.warn(`[spells] could not register the ${RALLY_SKILL_ID} handler`, err);
      return false;
    }
    return true;
  };
  bindAbilities();

  return {
    bindAbilities,
    dispose() {
      offHandler?.();
      offHandler = null;
      offDef();
    },
  };
}
