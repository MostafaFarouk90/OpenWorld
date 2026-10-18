import * as THREE from 'three';
import type { ActorsLike, ClockLike, DamageLike, EventsLike, PlayerLike, ServicesLike, Vec3 } from '../vfx/ports';
import { BURN, RALLY, SURGE } from '../vfx/tuning';
import type { Burn, BurnZone } from './Burn';
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
  /** The single shard-use path (Scar decision and its side effects); defaults to the Burn's own. */
  useShard?: (gain: number, source: string) => unknown;
  /** Class forms; defaults to a registry holding only the Knight's. */
  forms?: SurgeForms;
  /** The player's class id; null or undefined (no class chosen) plays as the Knight. */
  classId?: () => string | null | undefined;
}

export const DEFAULT_CLASS_ID = 'knight';

/** What a class's Surge form receives: the shared numbers for the zone, resolved before the Burn gain. */
export interface SurgeFormContext {
  casterId: string;
  zone: BurnZone;
  feet: Vec3;
  facingYaw: number;
  radius: number;
  poise: number;
  host: SpellEffectHost;
  damage: DamageLike;
}
export type SurgeFormImpl = (ctx: SurgeFormContext) => void;
export type RegisterFormResult = { ok: true; dispose(): void } | { ok: false; reason: 'duplicate' | 'bad-class' | 'bad-zone' | 'bad-impl' };

const ZONES: readonly BurnZone[] = ['warm', 'blaze', 'cinder'];

/**
 * Per-class Surge forms (design 9.7). The shared handler does what is class-independent (heal, Burn, feedback);
 * a form only decides who is hit and how. An unregistered class or zone plays the Knight's form, with one warning.
 */
export class SurgeForms {
  private readonly forms = new Map<string, SurgeFormImpl>();
  private readonly warned = new Set<string>();

  register(classId: string, zone: BurnZone, impl: SurgeFormImpl): RegisterFormResult {
    if (typeof classId !== 'string' || classId.length === 0) return { ok: false, reason: 'bad-class' };
    if (!ZONES.includes(zone)) return { ok: false, reason: 'bad-zone' };
    if (typeof impl !== 'function') return { ok: false, reason: 'bad-impl' };
    const key = `${classId}/${zone}`;
    if (this.forms.has(key)) return { ok: false, reason: 'duplicate' };
    this.forms.set(key, impl);
    return {
      ok: true,
      dispose: () => {
        if (this.forms.get(key) === impl) this.forms.delete(key);
      },
    };
  }

  has(classId: string, zone: BurnZone): boolean {
    return this.forms.has(`${classId}/${zone}`);
  }

  resolve(classId: string, zone: BurnZone): SurgeFormImpl | undefined {
    const own = this.forms.get(`${classId}/${zone}`);
    if (own) return own;
    const key = `${classId}/${zone}`;
    if (!this.warned.has(key)) {
      this.warned.add(key);
      console.warn(`[spells] no Surge form for ${key}, using ${DEFAULT_CLASS_ID}`);
    }
    return this.forms.get(`${DEFAULT_CLASS_ID}/${zone}`);
  }
}

/** The Knight's Surge: one damage.apply per hostile in range; direction lets the damage thread knock back. */
const knightForm: SurgeFormImpl = (c) => {
  for (const hit of actorsInRadius(c.host.actors, c.feet, c.radius, { team: 'hostile', alive: true })) {
    c.damage.apply({
      attackerId: c.casterId,
      targetId: hit.actor.id,
      amount: SURGE.damage,
      poise: c.poise,
      kind: 'spell',
      attackId: SURGE.spellId,
      point: new THREE.Vector3(hit.position.x, hit.position.y, hit.position.z),
      direction: toVector3(horizontalDir(c.feet, hit.position, c.facingYaw)),
    });
  }
};

export function createSurgeForms(): SurgeForms {
  const forms = new SurgeForms();
  for (const zone of ZONES) forms.register(DEFAULT_CLASS_ID, zone, knightForm);
  return forms;
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
    if (e.spellId === SURGE_DEF.id && SURGE_DEF.soundCharge) sfx(services, SURGE_DEF.soundCharge);
  });

  const forms = deps.forms ?? createSurgeForms();
  const useShard = deps.useShard ?? ((gain: number, source: string) => burn.useShard(gain, source));
  const offDef = caster.register(SURGE_DEF, (ctx: ReleaseContext) => {
    const feet = feetOf(host);
    const zone = burn.zone();
    const radius = SURGE.zoneRadius[zone];
    const scale = radius / SURGE.radius;
    const poise = zone === 'cinder' ? SURGE.cinderPoise : SURGE.poise;

    const form = forms.resolve(deps.classId?.() ?? DEFAULT_CLASS_ID, zone);
    form?.({ casterId: ctx.casterId, zone, feet, facingYaw: host.player.facingYaw, radius, poise, host, damage });

    const me = host.actors.get(ctx.casterId);
    if (me) damage.heal(ctx.casterId, me.maxHealth * SURGE.healFraction);
    useShard(BURN.surgeGain, 'surge');

    const vfx = services.get('vfx');
    vfx?.spawnEffect('surge', { position: feet, scale }, { zone });
    vfx?.pulseScreen(SURGE_FX.pulse[zone], SURGE_FX.pulseSeconds, SURGE_FX.pulseColor[zone]);
    clock.hitStop(SURGE.hitStop);
    vfx?.shake(SURGE_FX.shake[zone], SURGE_FX.shakeSeconds[zone]);
    if (SURGE_DEF.soundRelease) sfx(services, SURGE_DEF.soundRelease, feet);
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
    host.events.emit('buff.applied', { id: RALLY.skillId, nameKey: 'skill.knight.rallyCry.name', seconds: RALLY.buffSeconds });
    services.get('vfx')?.spawnEffect('skill-q', { position: feet, scale: 1 }, { radius: RALLY.radius, color: RALLY_FX.color });
    if (RALLY_DEF.soundRelease) sfx(services, RALLY_DEF.soundRelease, feet);
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
      const reg = abilities.registerHandler(RALLY_SKILL_ID, ({ caster: actor }) => {
        const r = caster.cast(actor?.id ?? playerId(), RALLY_DEF.id);
        return r.ok ? { ok: true } : { ok: false, reason: r.reason };
      });
      if (!reg.ok) {
        // Someone else owns the skill id. Retrying cannot succeed, so log once and stop.
        bindFailed = true;
        console.warn(`[spells] could not register the ${RALLY_SKILL_ID} handler`, reg.reason);
        return false;
      }
      offHandler = reg.dispose;
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

function toVector3(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

/** Plays a sound key if the audio service exists; a key thread 8 has not registered yet must not break the cast. */
function sfx(services: ServicesLike, key: string, at?: Vec3): void {
  const audio = services.get('audio');
  if (!audio) return;
  try {
    if (at) audio.playAt(key, at);
    else audio.play(key);
  } catch (e) {
    console.warn(`spells: sound '${key}' unavailable`, e instanceof Error ? e.message : e);
  }
}
