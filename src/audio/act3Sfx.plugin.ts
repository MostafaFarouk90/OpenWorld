import * as THREE from 'three';
import type { GamePlugin } from '../core/plugins';
import { YSMERYTH_TRIAL_ID } from '../music/act3Tracks';
import { ACT3_SFX_KEYS, ACT3_SFX_VOLUME, act3SfxSamples, isAct3Loop, type Act3SfxKey } from './act3Sfx';
import { setAct3SfxEnsure } from './act3SfxEnsure';
import { Act3SfxRouter } from './act3SfxRouter';
import { samplesToWavUrl } from './proceduralSounds';
import '../companions/events';
import './act3SfxEvents';

/** How long a `trial.ended` waits before the trial mix is dropped, so a restart (M31) that follows at once keeps it. */
export const TRIAL_RELEASE_MS = 1000;

let teardown: (() => void) | null = null;
/** Rendered once per key: a reload or a second Game in one page reuses the samples. */
const rendered = new Map<string, Float32Array<ArrayBuffer>>();
const samples = (key: Act3SfxKey) => {
  let s = rendered.get(key);
  if (!s) rendered.set(key, (s = act3SfxSamples(key)));
  return s;
};

/**
 * The Act 3 sound pass: registers the synthesized placeholder sounds (`./act3Sfx`) under their stable keys and plays them
 * from the events the Greyfen and Dragonspine systems emit (enemies, water, dive, glide, ferry, the dragons). A recording
 * registered under the same key replaces one. It also holds the Ysmeryth trial's music hook: `trial.started` for
 * `ysmeryth-trial` turns the trial mix on, and `trial.ended` turns it off a second later unless a new start came first.
 * Without an audio service it registers and plays nothing.
 */
const plugin: GamePlugin = {
  id: 'act3-sfx',
  dependsOn: ['core'],
  setup(ctx) {
    const offs: Array<() => void> = [];
    const audio = ctx.services.get('audio');
    // Lazy rendering exactly as in `act2-sfx`: one key per idle slice after setup, a key about to be played rendered at once.
    const urls: string[] = [];
    const done = new Set<string>();
    const ensure = (key: Act3SfxKey) => {
      const a = ctx.services.get('audio');
      if (!a || done.has(key)) return;
      done.add(key);
      try {
        const url = samplesToWavUrl(samples(key));
        urls.push(url);
        a.register(key, { src: [url], format: ['wav'], volume: ACT3_SFX_VOLUME[key], loop: isAct3Loop(key) });
      } catch (err) {
        console.warn(`[act3-sfx] sound ${key} not registered (${String(err)})`);
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
        const key = ACT3_SFX_KEYS[i++];
        if (key === undefined) return;
        ensure(key);
        later(slice);
      };
      later(slice);
      setAct3SfxEnsure((k) => {
        if ((ACT3_SFX_KEYS as readonly string[]).includes(k)) ensure(k as Act3SfxKey);
      });
      offs.push(() => {
        setAct3SfxEnsure(null);
        cancel?.();
        cancel = null;
        i = ACT3_SFX_KEYS.length;
        for (const u of urls.splice(0)) URL.revokeObjectURL(u);
      });
    }

    const tmp = new THREE.Vector3();
    const router = new Act3SfxRouter({
      audio: () => ctx.services.get('audio'),
      actor: (id) => {
        const a = ctx.actors.get(id);
        if (!a) return undefined;
        return { kind: a.kind, position: a.root ? a.worldPosition(tmp) : null };
      },
      object: (id) => ctx.actors.get(id)?.root ?? ctx.scene.getObjectByName(id) ?? undefined,
      playerObject: () => ctx.player.actor.root ?? undefined,
      ensure: (key) => {
        if (canRender) ensure(key);
      },
    });
    const ev = ctx.events;
    offs.push(
      ev.on('telegraph', (e) => router.telegraph(e)),
      ev.on('actor.died', (e) => router.died(e)),
      ev.on('water.entered', (e) => router.waterEntered(e)),
      ev.on('water.left', (e) => router.waterLeft(e)),
      ev.on('dive.started', () => router.diveStarted()),
      ev.on('dive.surfaced', () => router.diveSurfaced()),
      ev.on('breath.changed', (e) => router.breathChanged(e)),
      ev.on('glide.started', () => router.glideStarted()),
      ev.on('glide.landed', () => router.glideLanded()),
      ev.on('glide.ended', () => router.glideEnded()),
      ev.on('ferry.boarded', () => router.ferryBoarded()),
      ev.on('ferry.arrived', () => router.ferryArrived()),
      ev.on('movement.mode', (e) => router.movementMode(e)),
      ev.on('wyrm.hathren', (e) => router.hathren(e)),
      ev.on('dragon.flight', (e) => router.dragonFlight(e)),
      ev.on('wyrm.drake.chainStruck', () => router.drakeChainStruck()),
      ev.on('wyrm.drake.freed', () => router.drakeFreed()),
      ev.on('save.loaded', () => router.saveLoaded()),
      () => router.stopAll(),
    );

    // Set by a load or a respawn (the music director resets its bosses on both): the next tick re-asserts the trial mix.
    let recheckTrial = false;
    // The wade slosh follows the player's speed: polled each tick from the feet (water service state says whether wading).
    let lastX = NaN;
    let lastZ = NaN;
    offs.push(
      ctx.systems.add({
        id: 'act3-sfx',
        fixedPhase: 'late',
        order: 900,
        fixedUpdate: (dt) => {
          const f = ctx.player.feet;
          const speed = Number.isNaN(lastX) || !(dt > 0) ? 0 : Math.hypot(f.x - lastX, f.z - lastZ) / dt;
          lastX = f.x;
          lastZ = f.z;
          router.wadeStep(dt, speed, ctx.services.get('water')?.state === 'wading');
          if (recheckTrial) {
            recheckTrial = false;
            reassertTrial();
          }
        },
      }),
    );

    // The Ysmeryth trial's music: the trial mix while it runs, dropped a second after it ends unless it restarts first.
    let bossOn = false;
    let release: ReturnType<typeof setTimeout> | null = null;
    const clearRelease = () => {
      if (release !== null) clearTimeout(release);
      release = null;
    };
    /** After the director's reset: the trials service, not this plugin's memory, says whether the trial still runs. */
    const reassertTrial = () => {
      let running = false;
      try {
        running = ctx.services.get('trials')?.state()?.id === YSMERYTH_TRIAL_ID;
      } catch {
        // no trials service: nothing to restore
      }
      clearRelease();
      bossOn = running;
      if (!running) return; // the director was reset already, so no setBoss(false) is needed
      try {
        ctx.services.get('music')?.setBoss(true, YSMERYTH_TRIAL_ID); // idempotent for an id already held
      } catch {
        // as above
      }
    };
    offs.push(
      ev.on('save.loaded', () => void (recheckTrial = true)),
      ev.on('actor.revived', (e) => {
        if (e.actorId === ctx.actors.player.id && e.reason === 'respawn') recheckTrial = true;
      }),
      ev.on('trial.started', (e) => {
        if (e.trialId !== YSMERYTH_TRIAL_ID) return;
        clearRelease();
        if (bossOn) return; // a restart inside the grace second: the mix never dropped
        bossOn = true;
        try {
          ctx.services.get('music')?.setBoss(true, YSMERYTH_TRIAL_ID);
        } catch {
          // music is not worth a failed trial
        }
      }),
      ev.on('trial.ended', (e) => {
        if (e.trialId !== YSMERYTH_TRIAL_ID || !bossOn) return;
        clearRelease();
        release = setTimeout(() => {
          release = null;
          bossOn = false;
          try {
            ctx.services.get('music')?.setBoss(false, YSMERYTH_TRIAL_ID);
          } catch {
            // as above
          }
        }, TRIAL_RELEASE_MS);
      }),
      clearRelease,
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
