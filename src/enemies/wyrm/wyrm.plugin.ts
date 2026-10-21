import * as THREE from 'three';
import { samplesToWavUrl } from '../../audio/proceduralSounds';
import type { GamePlugin } from '../../core/plugins';
import { codexEntry } from '../../codex/entries';
import { heightAt } from '../../terrain/heightfield';
import { ActorMaterials } from '../../vfx/ActorMaterials';
import type { ActorId } from '../ports';
import { WyrmRig } from './builder/rig';
import { DiveMarkers } from './diveMarker';
import type { OrskPlayback, WyrmsService } from './events';
import { OrskScene, type OrskRequest } from './orsk';
import { WYRM_HUB } from './overlays';
import type { WyrmlingHandle } from './skittish';
import { WYRM_SOUND_KEYS, WYRM_SOUND_VOLUME, wyrmSoundSamples } from './sounds';
import { WYRM_STRINGS_EN } from './strings.en';
import { WyrmTethers } from './tethers';
import './events';

/** Bestiary kinds this plugin registers and unlocks (on aggro or a mercy). */
export const WYRM_KINDS = ['ember-wyrm', 'wyrmling'] as const;
const CODEX = WYRM_KINDS.map((k) => codexEntry('bestiary', k, k));
/** The Ember Wyrm's wingbeat is only heard this close. */
export const WINGBEAT_RANGE = 30;
/** The `wyrms` persistable (freed chains). */
export const WYRMS_PERSIST = { key: 'wyrms', version: 1 } as const;

type CodexLike = { register?(entries: unknown[]): () => void; unlock?(id: string): void };
type RendererLike = { compile?(object: THREE.Object3D, camera: THREE.Camera, scene?: THREE.Object3D): unknown };

/**
 * The wyrm runtime (plans/act2-A6a.md 1.4 to 1.7): the `wyrms` service (chains, fly-off, Orsk), the hub the wyrm
 * overlays call (dive marks, sounds, chains, the grounded event), the `wyrms` persistable, the bestiary entries, the
 * placeholder sounds and the shader warm-up. The overlays themselves are registered by `./overlays` on import, so
 * the enemies stack runs wyrms without this plugin (silent, unchained).
 */
const plugin: GamePlugin = {
  id: 'wyrms',
  dependsOn: ['core', 'enemies'],
  setup(ctx) {
    const warn = (m: string) => console.warn(`[wyrms] ${m}`);
    const offs: Array<() => void> = [];
    const tethers = new WyrmTethers({
      anchor: (id) => ctx.anchors.find(id)?.position,
      flag: (k) => ctx.state.getBool(k),
      warn,
    });
    const handles = new Map<ActorId, WyrmlingHandle>();
    const markers = new DiveMarkers(ctx.scene);
    let orsk: OrskScene | null = null;

    // ---- sounds (placeholders; a recording registered under the same key replaces one)
    const audio = ctx.services.get('audio');
    if (audio && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      for (const key of WYRM_SOUND_KEYS) {
        try {
          audio.register(`sfx.wyrm.${key}`, { src: [samplesToWavUrl(wyrmSoundSamples(key))], format: ['wav'], volume: WYRM_SOUND_VOLUME[key] });
        } catch (err) {
          warn(`sound ${key} not registered (${String(err)})`);
        }
      }
    }
    const at = new THREE.Vector3();
    const sfx = (key: string, p: { x: number; y: number; z: number }): void => {
      const a = ctx.services.get('audio');
      if (!a) return;
      if (key === 'wingbeat' && ctx.player.feet.distanceTo(at.set(p.x, p.y, p.z)) > WINGBEAT_RANGE) return;
      try {
        a.playAt(`sfx.wyrm.${key}`, at.set(p.x, p.y, p.z));
      } catch {
        // an unregistered key is silent
      }
    };

    // ---- the hub the overlays call
    Object.assign(WYRM_HUB, {
      diveLocked: (id: ActorId, p: { x: number; y: number; z: number }, seconds: number) => markers.show(id, p, seconds),
      diveEnded: (id: ActorId) => markers.hide(id),
      grounded: (id: ActorId, by: ActorId | null) => ctx.events.emit('wyrm.grounded', { actorId: id, by }),
      sfx,
      chainFor: (spawnerId: string | null, slot: number | null) => tethers.chainFor(spawnerId, slot),
      exitFor: (spawnerId: string | null) => tethers.exitFor(spawnerId),
      track: (id: ActorId, handle: WyrmlingHandle) => {
        handles.set(id, handle);
        return () => {
          if (handles.get(id) === handle) handles.delete(id);
          markers.hide(id);
        };
      },
    } satisfies typeof WYRM_HUB);
    offs.push(() => {
      for (const k of Object.keys(WYRM_HUB)) delete (WYRM_HUB as Record<string, unknown>)[k];
    });

    // ---- the service
    const service: WyrmsService = {
      tether: (spawnerId, posts, opts) => tethers.tether(spawnerId, posts, opts),
      unchain: (actorId) => {
        const h = handles.get(actorId);
        if (!h || h.spawnerId === null || h.slot === null || !tethers.chainFor(h.spawnerId, h.slot)) return false;
        tethers.free(h.spawnerId, h.slot);
        ctx.events.emit('wyrm.unchained', { actorId });
        return true;
      },
      flyAway: (actorId) => {
        const h = handles.get(actorId);
        if (!h) return false;
        h.flyAway();
        return true;
      },
      playOrsk: (req: OrskRequest): OrskPlayback | null => {
        if (orsk?.playing) {
          warn('playOrsk: already playing; refused');
          return null;
        }
        const scene = new OrskScene(
          {
            scene: ctx.scene,
            freezePlayer: (source) => ctx.player.addMoveModifier(source, { freeze: true }),
            cutscene: (source) => ctx.input.contexts.push('cutscene', source),
            camera: (shot) => ctx.cameraRig?.override(shot) ?? null,
            beat: (beat) => ctx.events.emit('wyrm.orsk', { beat }),
            sfx: (key, p) => sfx(key.replace(/^sfx\.wyrm\./, ''), p),
            shake: (strength, seconds) => ctx.services.get('vfx')?.shake(strength * 0.3, seconds),
          },
          req,
        );
        orsk = scene;
        void scene.done.then(() => {
          if (orsk === scene) orsk = null;
        });
        return { done: scene.done, skip: () => scene.skip() };
      },
    };
    ctx.services.provide('wyrms', service);
    ctx.persist.register({
      key: WYRMS_PERSIST.key,
      version: WYRMS_PERSIST.version,
      serialize: () => tethers.serialize(),
      load: (data) => tethers.load(data),
    });
    offs.push(() => {
      orsk?.dispose();
      orsk = null;
      markers.dispose();
      tethers.clear();
      handles.clear();
    });

    // ---- codex (bound lazily: the codex plugin may set up after this one)
    ctx.strings.register('en', WYRM_STRINGS_EN);
    let offCodex: (() => void) | null = null;
    const codex = (): CodexLike | undefined => ctx.services.get('codex') as CodexLike | undefined;
    const bindCodex = (): void => {
      if (offCodex) return;
      const c = codex();
      if (typeof c?.register === 'function') offCodex = c.register(CODEX);
    };
    offs.push(() => offCodex?.());
    const isWyrm = (k: unknown): k is (typeof WYRM_KINDS)[number] => (WYRM_KINDS as readonly unknown[]).includes(k);
    const unlock = (kind: unknown): void => {
      bindCodex();
      if (isWyrm(kind)) codex()?.unlock?.(kind);
    };
    offs.push(ctx.events.on('ai.aggro', (e) => unlock((ctx.actors.get(e.actorId) as { kind?: string } | undefined)?.kind)));
    offs.push(ctx.events.on('mercy', (e) => unlock(e.creature)));
    bindCodex();

    // ---- per tick: Orsk, the dive shadows, the dev hook
    const dev = devHook(ctx, service, warn);
    ctx.systems.add({
      id: 'wyrms.tick',
      fixedPhase: 'animation',
      order: 60,
      fixedUpdate: (dt) => {
        if (!offCodex) bindCodex();
        orsk?.fixedUpdate(dt);
        markers.update(dt);
        dev?.(dt);
      },
    });

    warmUp(ctx, warn);
    teardown = () => {
      for (const off of offs.splice(0).reverse()) off();
    };
  },
  dispose() {
    teardown?.();
    teardown = null;
  },
};

let teardown: (() => void) | null = null;

/** Compiles the wyrm programs (plain, then with the actor-fx patch) on a throwaway rig so the first spawn does not hitch. */
function warmUp(ctx: Parameters<GamePlugin['setup']>[0], warn: (m: string) => void): void {
  const renderer = (ctx.services.get('graphics') as { renderer?: RendererLike } | undefined)?.renderer;
  if (!renderer?.compile || !ctx.camera) return;
  const rig = new WyrmRig();
  const mats = new ActorMaterials();
  try {
    renderer.compile(rig.root, ctx.camera, ctx.scene);
    mats.ensure(rig.root);
    renderer.compile(rig.root, ctx.camera, ctx.scene);
  } catch (err) {
    warn(`shader warm-up failed (${String(err)})`);
  } finally {
    mats.restore(rig.root);
    rig.dispose();
  }
}

/**
 * Dev only, `?wyrms=1` (plans/act2-A6a.md 4): an Ember Wyrm 18 m ahead, two chained wyrmlings 8 m to the right, and
 * Orsk once, 30 m to the left, 6 s later. Returns the per-tick step, or null outside a dev build or without the flag.
 */
function devHook(ctx: Parameters<GamePlugin['setup']>[0], wyrms: WyrmsService, warn: (m: string) => void): ((dt: number) => void) | null {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return null;
  if (new URLSearchParams(window.location.search).get('wyrms') !== '1') return null;
  let t = 0;
  let spawned = false;
  let played = false;
  return (dt) => {
    t += dt;
    if (!spawned && t > 2) {
      spawned = true;
      const enemies = ctx.services.get('enemies');
      if (!enemies) return warn('?wyrms=1: no enemies service');
      const f = ctx.player.feet;
      const point = (dx: number, dz: number) => ({ x: f.x + dx, y: heightAt(f.x + dx, f.z + dz), z: f.z + dz });
      const define = (id: string, p: { x: number; y: number; z: number }) => ctx.anchors.define({ id, position: p, yaw: 0 });
      define('dev.wyrm.flier', point(0, -18));
      define('dev.wyrm.wyrmlings', point(8, 0));
      define('dev.wyrm.post-0', point(7, -1));
      define('dev.wyrm.post-1', point(9, 1));
      wyrms.tether('wyrm.dev.wyrmlings', [{ anchor: 'dev.wyrm.post-0' }, { anchor: 'dev.wyrm.post-1' }]);
      enemies.spawnGroup('wyrm.dev.flier');
      enemies.spawnGroup('wyrm.dev.wyrmlings');
    }
    if (!played && t > 8) {
      played = true;
      const f = ctx.player.feet;
      wyrms.playOrsk({ position: { x: f.x - 30, y: heightAt(f.x - 30, f.z), z: f.z }, yaw: Math.PI / 2, roofHeight: 8 });
    }
  };
}

export default plugin;
