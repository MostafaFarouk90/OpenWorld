// Act 4 L3 (plans/act4-L3.md): the Ashen Waste's weather. Provides the `weather` service (L0's port), runs the storm
// rules each fixed step, holds the weather clear through boss fights and scenes, sets the Ashmare down at the Waste's
// edge, persists the clock, and (with visuals) draws the storm. Rope-lines and shelters are L1's data, resolved from
// their anchors; until L1 lands the lists are empty (no rope is safe, no shelter shows) and the rules still run.
import * as THREE from 'three';
import type { GameContext as CoreContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { engineBox, REGION_IDS, REGION_INFO, type RegionId } from '../region/regions';
import { regionAt } from '../region/regionMask';
import { heightAt } from '../terrain/heightfield';
import { ASHMARE_DISMISSED_KEY, ASHMARE_EDGE, ASHMARE_POST_ANCHOR, AshmareEdge, outward } from './ashmareEdge';
import type { RopeLike, ShelterLike } from './lanes';
import { WEATHER_STRINGS_EN } from './strings.en';
import { STORM_EDGE, WEATHER_SEED } from './tuning';
import { insideDepth } from './weight';
import type { RopeLineDef, ShelterDef } from './types';
import { WeatherRuntime, type WeatherPorts } from './WeatherRuntime';
import { WEATHER_DATA } from './data';
import { installStormLook } from './stormLook';

export const WEATHER_PERSIST_KEY = 'weather';
export const WEATHER_PERSIST_VERSION = 1;
export const WEATHER_SYSTEM_ID = 'weather.rules';

export interface WeatherPluginOptions {
  /** Rope-lines and shelters (L1's `ROPE_LINES` and `SHELTERS`); defaults to `WEATHER_DATA`. */
  ropes?: readonly RopeLineDef[];
  shelters?: readonly ShelterDef[];
  /** Draw the storm (fog, sky, ash layer, particles, beacons). Tests pass false. */
  visuals?: boolean;
  seed?: number;
}

const STORM_REGIONS: readonly RegionId[] = REGION_IDS.filter((id) => REGION_INFO[id].weather === 'ash-storm');
const MOUNT_REFUSED: readonly RegionId[] = REGION_IDS.filter((id) => REGION_INFO[id].mount === 'refused');
const STORM_BOXES = STORM_REGIONS.map(engineBox);

/** Resolves L1's anchor-based defs to points (a missing anchor drops that point or shelter, with one warning). */
export function resolveWeatherData(
  find: (id: string) => { position: { x: number; z: number } } | undefined,
  ropes: readonly RopeLineDef[],
  shelters: readonly ShelterDef[],
  warn: (m: string) => void,
): { ropes: RopeLike[]; shelters: ShelterLike[] } {
  const missing: string[] = [];
  const at = (id: string) => {
    const a = find(id);
    if (!a) missing.push(id);
    return a ? { x: a.position.x, z: a.position.z } : null;
  };
  const outRopes = ropes.map((r) => ({ id: r.id, points: r.points.map(at).filter((p): p is { x: number; z: number } => p !== null) }));
  const outShelters: ShelterLike[] = [];
  for (const s of shelters) {
    const p = at(s.at);
    if (p) outShelters.push({ id: s.id, at: p, radius: s.radius });
  }
  if (missing.length) warn(`weather: ${missing.length} rope or shelter anchors are missing (first: ${missing[0]})`);
  return { ropes: outRopes, shelters: outShelters };
}

export function createWeatherPlugin(opts: WeatherPluginOptions = {}): GamePlugin {
  const cleanups: Array<() => void> = [];

  const teardown = (): void => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('weather: teardown step failed', err);
      }
    }
  };

  return {
    id: 'weather',
    dependsOn: ['core'],
    setup(ctx: CoreContext) {
      try {
        ctx.strings.register('en', WEATHER_STRINGS_EN);
        const warned = new Set<string>();
        const warn = (m: string) => {
          if (warned.has(m)) return;
          warned.add(m);
          console.warn(m);
        };
        const ports: WeatherPorts = {
          player: () => ({ x: ctx.player.feet.x, y: ctx.player.feet.y, z: ctx.player.feet.z, yaw: ctx.player.facingYaw }),
          // Only a current interior counts: a door's transition step must not flap the weather (and its toasts).
          indoors: () => {
            const i = ctx.services.get('interiors') as { current: string | null } | undefined;
            return !!i && i.current !== null;
          },
          stormRegion: (x, z) => {
            const r = regionAt(x, z);
            return r !== null && STORM_REGIONS.includes(r.id);
          },
          stormBand: (x, z) => STORM_BOXES.some((b) => insideDepth(b, x, z) > -STORM_EDGE.outside),
          dialogue: () => ctx.services.get('dialogue')?.active === true || ctx.input.contexts.top() === 'dialogue',
          gameplay: () => ctx.input.contexts.top() === 'gameplay',
          vitals: () => ({ health: ctx.player.actor.health, max: ctx.player.actor.maxHealth, dead: ctx.player.actor.dead }),
          damage: (amount) => {
            ctx.damage.apply({ attackerId: null, targetId: ctx.player.actor.id, amount, poise: 0, kind: 'script', unblockable: true });
          },
          heal: (amount) => {
            ctx.damage.heal(ctx.player.actor.id, amount);
          },
          emit: ((name: string, payload: unknown) => (ctx.events.emit as (n: string, p: unknown) => void)(name, payload)) as WeatherPorts['emit'],
          toast: (textKey) => ctx.events.emit('hud.toast', { textKey }),
          pushMode: (mode, sp) => {
            const m = ctx.services.get('movementMode');
            return m ? m.push(mode, sp) : () => {};
          },
          addMoveModifier: (source, mod) => ctx.player.addMoveModifier(source, mod),
          groundAt: (x, z) => heightAt(x, z),
          warn,
        };
        const rt = new WeatherRuntime(ports, { ropes: [], shelters: [] }, opts.seed ?? WEATHER_SEED);
        // L1's anchors may be defined by a plugin that sets up after this one: resolve on the first step, and again on
        // every load (a load can follow a teardown and rebuild of the world plugins).
        let resolved = false;
        const resolveData = (): void => {
          resolved = true;
          rt.setData(resolveWeatherData((id) => ctx.anchors.find(id), opts.ropes ?? WEATHER_DATA.ropes, opts.shelters ?? WEATHER_DATA.shelters, warn));
        };
        cleanups.push(() => rt.dispose());
        ctx.services.provide('weather', rt);

        // Boss fights and scenes hold the weather clear (L0's rule 1); escort hand-ins call holdClear themselves (L4).
        const holds = new Map<string, () => void>();
        const hold = (key: string) => {
          if (!holds.has(key)) holds.set(key, rt.holdClear(key));
        };
        const release = (key: string) => {
          holds.get(key)?.();
          holds.delete(key);
        };
        cleanups.push(() => {
          for (const off of holds.values()) off();
          holds.clear();
        });
        const ev = ctx.events as unknown as { on(n: string, fn: (p: { bossId?: string; id?: string }) => void): () => void };
        cleanups.push(
          ev.on('boss.started', (e) => hold(`boss:${e.bossId}`)),
          ev.on('boss.defeated', (e) => release(`boss:${e.bossId}`)),
          ev.on('boss.released', (e) => release(`boss:${e.bossId}`)),
          ev.on('boss.spared', (e) => release(`boss:${e.bossId}`)),
          ev.on('boss.ended', (e) => release(`boss:${e.bossId}`)),
          ev.on('scene.started', (e) => hold(`scene:${e.id}`)),
          ev.on('scene.ended', (e) => release(`scene:${e.id}`)),
        );

        // The Ashmare at the Waste's edge.
        const edge = new AshmareEdge(MOUNT_REFUSED.map(engineBox));
        // The Ashgate post only for a rider at the Waste's south face (Ashgate's side); on any other face she stays
        // just outside, where the rider was set down.
        const setDown = (box: Parameters<typeof outward>[0], x: number, z: number): THREE.Vector3 => {
          const o = outward(box, x, z, ASHMARE_EDGE.fallbackStep);
          const post = o.z < z ? ctx.anchors.find(ASHMARE_POST_ANCHOR) : undefined;
          if (post) return new THREE.Vector3(post.position.x, post.position.y, post.position.z);
          return new THREE.Vector3(o.x, heightAt(o.x, o.z), o.z);
        };

        cleanups.push(
          ctx.systems.add({
            id: WEATHER_SYSTEM_ID,
            fixedPhase: 'rules',
            order: 420,
            fixedUpdate: (dt) => {
              if (!resolved) resolveData();
              rt.update(dt);
              const mount = ctx.services.get('mount');
              const f = ctx.player.feet;
              const due = edge.step(mount?.mounted() === true, f.x, f.z);
              if (due.dismount && due.box && mount) {
                mount.dismount('script', setDown(due.box, f.x, f.z));
                if (due.toast) ctx.events.emit('hud.toast', { textKey: ASHMARE_DISMISSED_KEY });
              }
            },
          }),
        );

        // A save without a `weather` entry never reaches `load`: put the defaults back on `save.loaded` then.
        let loadedEntry = false;
        ctx.persist.register({
          key: WEATHER_PERSIST_KEY,
          version: WEATHER_PERSIST_VERSION,
          serialize: () => rt.serialize(),
          load: (d) => {
            loadedEntry = true;
            rt.load(d);
          },
        });
        cleanups.push(
          ctx.events.on('save.loaded', () => {
            rt.loadDefaultsIfMissing(loadedEntry);
            loadedEntry = false;
            resolveData();
          }),
        );

        if (opts.visuals ?? true) cleanups.push(installWeatherVisuals(ctx, rt));
        installDevHook(ctx, rt, cleanups);
      } catch (err) {
        teardown();
        throw err;
      }
    },
    dispose: teardown,
  };
}

/** The storm's look (render only; a no-op headless). */
function installWeatherVisuals(ctx: CoreContext, rt: WeatherRuntime): () => void {
  return installStormLook(ctx, rt);
}

/** `?storm=on|off` forces or holds the weather for real-game runs; dev builds also get `window.__weatherDev`. */
function installDevHook(_ctx: CoreContext, rt: WeatherRuntime, cleanups: Array<() => void>): void {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search).get('storm');
  if (p === 'on') cleanups.push(rt.forceStorm('dev:url'));
  if (p === 'off') cleanups.push(rt.holdClear('dev:url'));
  const dev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true || new URLSearchParams(window.location.search).has('dev');
  if (!dev) return;
  const w = window as unknown as { __weatherDev?: unknown };
  w.__weatherDev = {
    runtime: rt,
    force: (reason = 'dev:console') => rt.forceStorm(reason),
    hold: (reason = 'dev:console') => rt.holdClear(reason),
  };
  cleanups.push(() => {
    delete w.__weatherDev;
  });
}


export default createWeatherPlugin();
