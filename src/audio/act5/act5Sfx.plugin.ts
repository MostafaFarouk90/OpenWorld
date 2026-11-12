import * as THREE from 'three';
import type { GamePlugin } from '../../core/plugins';
import { samplesToWavUrl } from '../proceduralSounds';
import { ACT5_SFX_KEYS, ACT5_SFX_VOLUME, ACT5_ON_DEMAND_KEYS, act5SfxSamples, isAct5Loop, type Act5SfxKey } from './act5Sfx';
import { setAct5SfxEnsure } from './act5SfxEnsure';
import { Act5MusicRouter } from './act5MusicRouter';
import { Act5SfxRouter } from './act5SfxRouter';
import { RAM_SFX_ACT5 } from './act5SfxEvents';
import '../../caldera/events';

let teardown: (() => void) | null = null;

/** Rendered once per key: a reload or a second Game in one page reuses the samples. */
const rendered = new Map<string, Float32Array<ArrayBuffer>>();
const samples = (key: Act5SfxKey) => {
  let s = rendered.get(key);
  if (!s) rendered.set(key, (s = act5SfxSamples(key)));
  return s;
};

type Named = (name: string, fn: (e: never) => void) => () => void;

/**
 * The Act 5 sound pass: registers the synthesized placeholder sounds (`./act5Sfx`) under their stable keys, plays them from
 * the events the Caldera systems emit (lava, vents, the siege, the arena, bosses), and runs the Caldera's music cues that
 * are more than one key (the siege mix and lull, Ulthred's phase 3 steps; `./act5MusicRouter`). A recording registered
 * under the same key replaces one. Keys that other threads play by name are registered too; callers `ensureAct5Sfx(key)`
 * first. Without an audio service it registers and plays nothing.
 */
const plugin: GamePlugin = {
  id: 'act5-sfx',
  dependsOn: ['core'],
  setup(ctx) {
    const offs: Array<() => void> = [];
    const audio = ctx.services.get('audio');
    const urls: string[] = [];
    const done = new Set<string>();
    const ensure = (key: Act5SfxKey) => {
      const a = ctx.services.get('audio');
      if (!a || done.has(key)) return;
      done.add(key);
      try {
        const url = samplesToWavUrl(samples(key));
        urls.push(url);
        a.register(key, { src: [url], format: ['wav'], volume: ACT5_SFX_VOLUME[key], loop: isAct5Loop(key) });
      } catch (err) {
        console.warn(`[act5-sfx] sound ${key} not registered (${String(err)})`);
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
        let key = ACT5_SFX_KEYS[i++];
        while (key !== undefined && (ACT5_ON_DEMAND_KEYS as readonly string[]).includes(key)) key = ACT5_SFX_KEYS[i++];
        if (key === undefined) return;
        ensure(key);
        later(slice);
      };
      later(slice);
      setAct5SfxEnsure((k) => {
        if ((ACT5_SFX_KEYS as readonly string[]).includes(k)) ensure(k as Act5SfxKey);
      });
      offs.push(() => {
        setAct5SfxEnsure(null);
        cancel?.();
        cancel = null;
        i = ACT5_SFX_KEYS.length;
        for (const u of urls.splice(0)) URL.revokeObjectURL(u);
      });
    }

    const lazy = (name: string): unknown => (ctx.services as unknown as { get(n: string): unknown }).get(name);
    const tmp = new THREE.Vector3();
    const playerPos = new THREE.Vector3();
    /** N3's `lava` service, when it exists: `nearest(x, z)` gives the distance to the nearest volume. */
    const lavaNearest = (): number | null => {
      const lava = lazy('lava') as { nearest?(x: number, z: number): { distance: number } | null } | undefined;
      const f = ctx.player.feet;
      return lava?.nearest?.(f.x, f.z)?.distance ?? null;
    };
    const ventNearest = (): number | null => {
      const lava = lazy('lava') as { vents?(): ReadonlyArray<{ at: { x: number; z: number }; state: string }> } | undefined;
      const f = ctx.player.feet;
      let best: number | null = null;
      for (const v of lava?.vents?.() ?? []) {
        if (v.state !== 'open') continue;
        const d = Math.hypot(v.at.x - f.x, v.at.z - f.z);
        if (best === null || d < best) best = d;
      }
      return best;
    };
    const router = new Act5SfxRouter({
      audio: () => ctx.services.get('audio'),
      actorAt: (id) => {
        const a = ctx.actors.get(id);
        return a?.root ? a.worldPosition(tmp) : undefined;
      },
      playerObject: () => ctx.player.actor.root ?? undefined,
      lavaDistance: lavaNearest,
      ventDistance: ventNearest,
      ensure: (key) => {
        if (canRender) ensure(key);
      },
    });
    void playerPos;
    const music = new Act5MusicRouter({
      setBoss: (on, id) => ctx.services.get('music')?.setBoss(on, id),
      onBeat: (cb) => ctx.services.get('music')?.onBeat(cb) ?? (() => {}),
    });

    let recheck = false;
    const ev = ctx.events;
    const named = ev.on as unknown as Named;
    offs.push(
      ev.on('lava.entered', () => router.lavaEntered()),
      ev.on('lava.thrown', () => router.lavaThrown()),
      ev.on('vent.opened', () => router.ventOpened()),
      ev.on('vent.closed', () => router.ventClosed()),
      named('vent.closing', () => router.ventClosing()),
      ev.on('siege.wave.started', (e) => {
        router.waveStarted(e);
        music.waveStarted();
      }),
      ev.on('siege.wave.cleared', () => {
        router.waveCleared();
        music.waveCleared();
      }),
      ev.on('siege.gate.damaged', (e) => router.gateDamaged(e)),
      ev.on('siege.gate.breached', () => router.gateBreached()),
      ev.on('siege.order', () => router.order()),
      ev.on('siege.ally.arrived', (e) => router.allyArrived(e)),
      ...Object.keys(RAM_SFX_ACT5).map((name) => named(name, () => router.ram(name))),
      named('siege.dragon.breath', () => router.dragonBreath()),
      named('siege.gong', () => router.gong()),
      named('enemies.shieldLine.broken', () => router.lineBroken()),
      named('dragon.flight', ((e: { actorId: string; on: boolean }) => router.dragonFlight(e)) as (e: never) => void),
      ev.on('telegraph', (e) => router.telegraph(e)),
      ev.on('arena.piece', (e) => router.arenaPiece(e)),
      ev.on('arena.reset', () => router.arenaReset()),
      ev.on('movement.mode', (e) => music.modeChanged(e)),
      ev.on('boss.phase', (e) => music.bossPhase(e)),
      ev.on('boss.defeated', (e) => music.bossOver(e.bossId)),
      ev.on('boss.released', (e) => music.bossOver(e.bossId)),
      ev.on('boss.ended', (e) => music.bossOver(e.bossId)),
      // The music plugin resets its director on a load or respawn, and plugins set up in id order, so the siege mix is
      // re-derived on the next tick, after that reset (not synchronously here).
      ev.on('save.loaded', () => {
        router.saveLoaded();
        recheck = true;
      }),
      ev.on('actor.revived', (e) => {
        if (e.reason === 'respawn' && e.actorId === ctx.player.actor.id) recheck = true;
      }),
      () => {
        router.stopAll();
        music.dispose();
      },
      ctx.systems.add({
        id: 'act5-sfx',
        fixedPhase: 'late',
        order: 902,
        fixedUpdate: (dt) => {
          if (recheck) {
            recheck = false;
            let siege = false;
            try {
              siege = (ctx.services as unknown as { get(n: string): { current?: string } | undefined }).get('movementMode')?.current === 'siege';
            } catch {
              siege = false;
            }
            music.saveLoaded(siege);
          }
          router.tick(dt);
          music.tick(dt);
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
