import * as THREE from 'three';
import type { GamePlugin } from '../../core/plugins';
import { samplesToWavUrl } from '../proceduralSounds';
import { ACT4_SFX_KEYS, ACT4_SFX_VOLUME, act4SfxSamples, isAct4Loop, type Act4SfxKey } from './act4Sfx';
import { setAct4SfxEnsure } from './act4SfxEnsure';
import { Act4SfxRouter, type StormKind } from './act4SfxRouter';
import '../../weather/types';

let teardown: (() => void) | null = null;

/** Scene cues others play by name, rendered only when asked for (the music box alone is about 12 s). */
export const ON_DEMAND_KEYS: ReadonlySet<Act4SfxKey> = new Set(['sfx.ebba.musicbox', 'sfx.dream.hum', 'sfx.m38.betrayal', 'sfx.eormen.release']);
/** Rendered once per key: a reload or a second Game in one page reuses the samples. */
const rendered = new Map<string, Float32Array<ArrayBuffer>>();
const samples = (key: Act4SfxKey) => {
  let s = rendered.get(key);
  if (!s) rendered.set(key, (s = act4SfxSamples(key)));
  return s;
};

/** The skin id an actor was spawned with (L0's `SpawnerDef.skin`, carried as the read-only `actor.skin`), if any. */
export function skinOf(actor: object): string | null {
  const skin = (actor as { skin?: unknown }).skin;
  return typeof skin === 'string' ? skin : null;
}

/**
 * The Act 4 sound pass: registers the synthesized placeholder sounds (`./act4Sfx`) under their stable keys and plays them
 * from the events the Waste and Harrowmark systems emit (creatures, bosses, the weather). A recording registered under the
 * same key replaces one. Keys that other threads play by name (glass pillars and `sfx.glass.wrong`, the Last Gong,
 * `sfx.engine.valve`, `sfx.huskknight.ember`, M38's sting, Ebba's music box, the dream hum) are registered here too; those
 * callers ask `ensureAct4Sfx(key)` first. Without an audio service it
 * registers and plays nothing.
 */
const plugin: GamePlugin = {
  id: 'act4-sfx',
  dependsOn: ['core'],
  setup(ctx) {
    const offs: Array<() => void> = [];
    const audio = ctx.services.get('audio');
    // Lazy rendering exactly as in `act3-sfx`: one key per idle slice after setup, a key about to be played rendered at once.
    const urls: string[] = [];
    const done = new Set<string>();
    const ensure = (key: Act4SfxKey) => {
      const a = ctx.services.get('audio');
      if (!a || done.has(key)) return;
      done.add(key);
      try {
        const url = samplesToWavUrl(samples(key));
        urls.push(url);
        a.register(key, { src: [url], format: ['wav'], volume: ACT4_SFX_VOLUME[key], loop: isAct4Loop(key) });
      } catch (err) {
        console.warn(`[act4-sfx] sound ${key} not registered (${String(err)})`);
      }
    };
    const canRender = !!audio && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
    if (canRender) {
      let i = 0;
      type G = { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
      const g = globalThis as unknown as G;
      let cancel: (() => void) | null = null;
      const later = (cb: () => void) => {
        if (typeof g.requestIdleCallback === 'function') {
          const id = g.requestIdleCallback(cb, { timeout: 2000 });
          cancel = () => g.cancelIdleCallback?.(id);
        } else {
          const id = setTimeout(cb, 0);
          cancel = () => clearTimeout(id);
        }
      };
      const slice = () => {
        cancel = null;
        let key = ACT4_SFX_KEYS[i++];
        // The long scene cues are rendered on demand (`ensureAct4Sfx`), so the idle prefetch never holds one long task.
        while (key !== undefined && ON_DEMAND_KEYS.has(key)) key = ACT4_SFX_KEYS[i++];
        if (key === undefined) return;
        ensure(key);
        later(slice);
      };
      later(slice);
      setAct4SfxEnsure((k) => {
        if ((ACT4_SFX_KEYS as readonly string[]).includes(k)) ensure(k as Act4SfxKey);
      });
      offs.push(() => {
        setAct4SfxEnsure(null);
        cancel?.();
        cancel = null;
        i = ACT4_SFX_KEYS.length;
        for (const u of urls.splice(0)) URL.revokeObjectURL(u);
      });
    }

    const tmp = new THREE.Vector3();
    const router = new Act4SfxRouter({
      audio: () => ctx.services.get('audio'),
      actorAt: (id) => {
        const a = ctx.actors.get(id);
        return a?.root ? a.worldPosition(tmp) : undefined;
      },
      object: (id) => ctx.actors.get(id)?.root ?? undefined,
      playerObject: () => ctx.player.actor.root ?? undefined,
      ensure: (key) => {
        if (canRender) ensure(key);
      },
    });
    const ev = ctx.events;
    // Survivors of a load are re-adopted on the next tick (the enemy manager keeps live enemies and emits no new spawn).
    let adoptNextTick = false;
    const living = function* () {
      try {
        for (const a of ctx.actors.all()) if (a.alive !== false) yield { actorId: a.id, kind: a.kind, skin: skinOf(a) };
      } catch {
        // no registry: nothing to adopt
      }
    };
    /** The weather service's kind now; no provider (or a throwing one) is clear weather. */
    const weatherNow = (): StormKind => {
      try {
        return ctx.services.get('weather')?.state().kind ?? 'clear';
      } catch {
        return 'clear';
      }
    };
    router.restore(weatherNow());
    offs.push(
      ev.on('weather.changed', (e) => router.weatherChanged(e)),
      ev.on('shelter.entered', (e) => router.shelterEntered(e)),
      ev.on('shelter.left', (e) => router.shelterLeft(e)),
      ev.on('telegraph', (e) => router.telegraph(e)),
      ev.on('actor.spawned', (e) => router.spawned({ actorId: e.actor.id, kind: e.actor.kind, skin: skinOf(e.actor) })),
      ev.on('actor.died', (e) => router.died(e)),
      ev.on('actor.despawned', (e) => router.gone(e.actorId)),
      ev.on('boss.phase', (e) => router.bossPhase(e)),
      ev.on('boss.released', (e) => router.bossReleased(e)),
      ev.on('save.loaded', () => {
        router.saveLoaded();
        router.restore(weatherNow());
        adoptNextTick = true;
      }),
      () => router.stopAll(),
      ctx.systems.add({
        id: 'act4-sfx',
        fixedPhase: 'late',
        order: 901,
        fixedUpdate: (dt) => {
          if (adoptNextTick) {
            adoptNextTick = false;
            router.adopt(living());
          }
          router.tick(dt);
        },
      }),
    );

    teardown = () => {
      for (const off of offs.splice(0).reverse()) off();
    };
  },
  dispose() {
    teardown?.();
    teardown = null;
  },
};

export default plugin;
