import * as THREE from 'three';
import type { GamePlugin } from '../core/plugins';
import { ACT2_SFX_KEYS, ACT2_SFX_VOLUME, act2SfxSamples } from './act2Sfx';
import { Act2SfxRouter } from './act2SfxRouter';
import { setAct2SfxEnsure } from './act2SfxEnsure';
import { samplesToWavUrl } from './proceduralSounds';
import '../enemies/ground/events';

let teardown: (() => void) | null = null;
/** Rendered once per key: a reload or a second Game in one page reuses the samples. */
const rendered = new Map<string, Float32Array<ArrayBuffer>>();
const samples = (key: (typeof ACT2_SFX_KEYS)[number]) => {
  let s = rendered.get(key);
  if (!s) rendered.set(key, (s = act2SfxSamples(key)));
  return s;
};

/**
 * The Act 2 sound pass: registers the synthesized placeholder sounds (`./act2Sfx`) under their stable keys and plays them
 * from the events the ground enemies (A6b), the raid carts and barricade (A7) and the Weeping Bellows (A9) already emit.
 * A recording registered under the same key replaces one. Without an audio service it registers and plays nothing.
 */
const plugin: GamePlugin = {
  id: 'act2-sfx',
  dependsOn: ['core'],
  setup(ctx) {
    const offs: Array<() => void> = [];
    const audio = ctx.services.get('audio');
    // The sounds render lazily (about a second of synthesis in all): one key per slice after setup (in browser idle time where
    // `requestIdleCallback` exists, else on a zero timeout), and a key about to be played, by the router or by the Slagmaw
    // through `ensureAct2Sfx`, is rendered at once if its slice has not come yet.
    const urls: string[] = [];
    const done = new Set<string>();
    const ensure = (key: (typeof ACT2_SFX_KEYS)[number]) => {
      const a = ctx.services.get('audio');
      if (!a || done.has(key)) return;
      done.add(key);
      try {
        const url = samplesToWavUrl(samples(key));
        urls.push(url);
        a.register(key, { src: [url], format: ['wav'], volume: ACT2_SFX_VOLUME[key] });
      } catch (err) {
        console.warn(`[act2-sfx] sound ${key} not registered (${String(err)})`);
      }
    };
    const canRender = !!audio && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
    if (canRender) {
      let i = 0;
      type G = { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
      const g = globalThis as unknown as G;
      let cancel: (() => void) | null = null;
      const later = (cb: () => void) => {
        if (typeof g.requestIdleCallback === 'function') {
          const id = g.requestIdleCallback(cb);
          cancel = () => g.cancelIdleCallback?.(id);
        } else {
          const id = setTimeout(cb, 0);
          cancel = () => clearTimeout(id);
        }
      };
      const slice = () => {
        cancel = null;
        const key = ACT2_SFX_KEYS[i++];
        if (key === undefined) return;
        ensure(key);
        later(slice);
      };
      later(slice);
      setAct2SfxEnsure((k) => {
        if ((ACT2_SFX_KEYS as readonly string[]).includes(k)) ensure(k as (typeof ACT2_SFX_KEYS)[number]);
      });
      offs.push(() => {
        setAct2SfxEnsure(null);
        cancel?.();
        cancel = null;
        i = ACT2_SFX_KEYS.length;
        for (const u of urls.splice(0)) URL.revokeObjectURL(u);
      });
    }

    const tmp = new THREE.Vector3();
    const router = new Act2SfxRouter({
      audio: () => ctx.services.get('audio'),
      actor: (id) => {
        const a = ctx.actors.get(id);
        if (!a) return undefined;
        return { kind: a.kind, position: a.root ? a.worldPosition(tmp) : null };
      },
      structure: (id) => ctx.services.get('waves')?.structure(id),
      ensure: (key) => {
        if (canRender) ensure(key);
      },
    });
    const ev = ctx.events;
    offs.push(
      ev.on('telegraph', (e) => router.telegraph(e)),
      ev.on('actor.died', (e) => router.died(e)),
      ev.on('actor.staggered', (e) => router.staggered(e)),
      ev.on('cooling.hit', (e) => router.cooled(e)),
      ev.on('structure.damaged', (e) => router.structureDamaged(e)),
      ev.on('structure.destroyed', (e) => router.structureDestroyed(e)),
      ev.on('interact', (e) => router.interact(e)),
      ev.on('puzzle.state', (e) => router.puzzleState(e)),
      ev.on('puzzle.solved', (e) => router.puzzleSolved(e)),
      ev.on('puzzle.failed', (e) => router.puzzleFailed(e)),
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
