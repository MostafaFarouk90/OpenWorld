import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import type { GameEventMap } from '../../core/events';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../core/plugins';
import { InputManager } from '../../input/InputManager';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import { DIVE_MARKER, DiveMarkers } from './diveMarker';
import { WYRM_HUB } from './overlays';
import { WYRM_SOUND_KEYS, wyrmSoundSamples } from './sounds';
import { WYRM_STRINGS_EN } from './strings.en';
import wyrmPlugin, { WYRM_KINDS, WYRMS_PERSIST } from './wyrm.plugin';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});
beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

/** The `enemies` id with nothing behind it (the wyrm plugin only depends on its being set up first). */
const enemiesStub: GamePlugin = { id: 'enemies', dependsOn: ['core'], setup() {} };

function codexStub() {
  const registered: string[] = [];
  const unlocked: string[] = [];
  let removed = 0;
  const plugin: GamePlugin = {
    id: 'codex',
    dependsOn: ['core'],
    setup(ctx) {
      ctx.services.provide('codex', {
        unlock: (id: string) => void unlocked.push(id),
        has: () => false,
        open: () => {},
        register: (entries: { id: string }[]) => {
          registered.push(...entries.map((e) => e.id));
          return () => void removed++;
        },
      } as never);
    },
  };
  return { plugin, registered, unlocked, removed: () => removed };
}

async function boot(opts: { codex?: boolean } = {}) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: null, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: unknown }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const codex = codexStub();
  const plugins = [corePlugin, enemiesStub, wyrmPlugin];
  if (opts.codex !== false) plugins.push(codex.plugin);
  const statuses = await game.loadPlugins(modules(...plugins));
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) game.fixedUpdate();
  };
  return { game, ctx: game.ctx, scene, moveModifiers, codex, of, run, statuses };
}

describe('wyrm.plugin', () => {
  it('sets up headless: the service, the persistable, the hub; the codex entries registered and unlocked on a mercy', async () => {
    const h = await boot();
    expect(h.statuses.find((s) => s.id === 'wyrms')?.state).toBe('ok');
    const svc = h.ctx.services.get('wyrms')!;
    expect(typeof svc.playOrsk).toBe('function');
    expect(h.ctx.persist.get(WYRMS_PERSIST.key)?.version).toBe(1);
    expect(typeof WYRM_HUB.chainFor).toBe('function');
    expect(h.ctx.strings.t('codex.bestiary.ember-wyrm.name')).toBe(WYRM_STRINGS_EN['codex.bestiary.ember-wyrm.name']);
    h.run(0.1);
    expect(h.codex.registered).toEqual([...WYRM_KINDS]);
    h.ctx.events.emit('mercy', { verb: 'calm', tier: 'normal', track: 'dragons', creature: 'wyrmling' });
    h.ctx.events.emit('mercy', { verb: 'calm', tier: 'normal', track: 'dragons', creature: 'fixture-hound' });
    expect(h.codex.unlocked).toEqual(['wyrmling']);
    h.game.dispose();
    expect(h.codex.removed()).toBe(1);
    expect(Object.keys(WYRM_HUB)).toEqual([]);
  });

  it('chains through the service: unchain frees a tracked wyrmling for good (saved), flyAway reaches its handle', async () => {
    const h = await boot();
    const svc = h.ctx.services.get('wyrms')!;
    h.ctx.anchors.define({ id: 'test.post', position: { x: 1, y: 0, z: 1 }, yaw: 0 });
    const remove = svc.tether('nursery', [{ anchor: 'test.post' }]);
    const flown: string[] = [];
    const untrack = WYRM_HUB.track!('w-1', { spawnerId: 'nursery', slot: 0, flyAway: () => flown.push('w-1') > 0 });
    expect(WYRM_HUB.chainFor!('nursery', 0)).not.toBeNull();
    expect(svc.unchain('w-1')).toBe(true);
    expect(WYRM_HUB.chainFor!('nursery', 0)).toBeNull();
    expect(h.of('wyrm.unchained')).toEqual([{ actorId: 'w-1' }]);
    // Already free, or unknown: false.
    expect(svc.unchain('w-1')).toBe(false);
    expect(svc.unchain('nobody')).toBe(false);
    expect(h.ctx.persist.get('wyrms')!.serialize()).toEqual({ freed: ['nursery#0'] });
    expect(svc.flyAway('w-1')).toBe(true);
    expect(flown).toEqual(['w-1']);
    untrack();
    expect(svc.flyAway('w-1')).toBe(false);
    // A load restores the freed set.
    h.ctx.persist.get('wyrms')!.load({ freed: [] }, 1);
    h.ctx.events.emit('save.loaded', { slot: 'test' });
    expect(WYRM_HUB.chainFor!('nursery', 0)).not.toBeNull();
    // A save with no `wyrms` entry: nothing freed in the loaded world.
    svc.unchain('w-2');
    WYRM_HUB.track!('w-2', { spawnerId: 'nursery', slot: 0, flyAway: () => true });
    expect(svc.unchain('w-2')).toBe(true);
    h.ctx.events.emit('save.loaded', { slot: 'test' });
    expect(WYRM_HUB.chainFor!('nursery', 0)).not.toBeNull();
    remove();
    expect(WYRM_HUB.chainFor!('nursery', 0)).toBeNull();
    h.game.dispose();
  });

  it('playOrsk: beats as events, the player frozen in a cutscene context until gone; a second play is refused', async () => {
    const h = await boot();
    const svc = h.ctx.services.get('wyrms')!;
    const play = svc.playOrsk({ position: { x: 0, y: 0, z: -20 }, yaw: 0, roofHeight: 8 })!;
    expect(play).not.toBeNull();
    expect(svc.playOrsk({ position: { x: 0, y: 0, z: -20 }, yaw: 0, roofHeight: 8 })).toBeNull();
    expect(h.moveModifiers.state().freeze).toBe(true);
    expect(h.ctx.input.contexts.top()).toBe('cutscene');
    h.run(7);
    await play.done;
    expect(h.of('wyrm.orsk').map((e) => e.beat)).toEqual(['started', 'chainsBroken', 'roar', 'roofBurst', 'gone']);
    expect(h.moveModifiers.state().freeze).toBeFalsy();
    expect(h.ctx.input.contexts.top()).toBe('gameplay');
    expect(h.scene.getObjectByName('orsk')).toBeUndefined();
    // Over: a new play is allowed again, and teardown mid-play undoes it.
    const again = svc.playOrsk({ position: { x: 0, y: 0, z: -20 }, yaw: 0, roofHeight: 8 })!;
    h.run(1);
    h.game.dispose();
    await again.done;
    expect(h.moveModifiers.state().freeze).toBeFalsy();
  });

  it('the grounded hub call emits wyrm.grounded; the dive marks follow diveLocked and diveEnded', async () => {
    const h = await boot();
    WYRM_HUB.grounded!('wyrm-1', 'player');
    expect(h.of('wyrm.grounded')).toEqual([{ actorId: 'wyrm-1', by: 'player' }]);
    WYRM_HUB.diveLocked!('wyrm-1', { x: 3, y: 0, z: 4 }, 0.9);
    const marks = () => {
      const out: THREE.Object3D[] = [];
      h.scene.traverse((o) => o.name === 'wyrm-dive-marker' && out.push(o));
      return out;
    };
    expect(marks()).toHaveLength(2);
    expect(marks()[0]!.position.x).toBe(3);
    WYRM_HUB.diveEnded!('wyrm-1');
    expect(marks()).toHaveLength(0);
    h.game.dispose();
  });

  it('without a codex plugin it still sets up', async () => {
    const h = await boot({ codex: false });
    expect(h.statuses.find((s) => s.id === 'wyrms')?.state).toBe('ok');
    h.run(0.1);
    h.ctx.events.emit('mercy', { verb: 'calm', tier: 'normal', track: 'dragons', creature: 'wyrmling' });
    h.game.dispose();
  });
});

describe('DiveMarkers', () => {
  it('the circle centre is the locked point; the shadow grows to fill it over the fall', () => {
    const parent = new THREE.Group();
    const m = new DiveMarkers(parent);
    m.show('a', { x: 5, y: 2, z: -7 }, 1);
    expect(m.centre('a')!.toArray()).toEqual([5, 2 + DIVE_MARKER.lift, -7]);
    const shadow = parent.children[1]!;
    expect(shadow.scale.x).toBeCloseTo(DIVE_MARKER.shadowStart, 5);
    m.update(0.5);
    const mid = shadow.scale.x;
    m.update(2);
    expect(mid).toBeGreaterThan(DIVE_MARKER.shadowStart);
    expect(shadow.scale.x).toBeCloseTo(1, 5);
    // A second show for the same id replaces the first.
    m.show('a', { x: 0, y: 0, z: 0 }, 1);
    expect(parent.children).toHaveLength(2);
    m.hide('a');
    m.hide('a');
    expect(m.size).toBe(0);
    m.dispose();
  });
});

describe('wyrm sounds', () => {
  it('every key renders finite samples within [-1, 1], deterministic', () => {
    for (const k of WYRM_SOUND_KEYS) {
      const s = wyrmSoundSamples(k);
      expect(s.length).toBeGreaterThan(1000);
      let peak = 0;
      let finite = true;
      for (const v of s) {
        finite &&= Number.isFinite(v);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(finite).toBe(true);
      expect(peak).toBeGreaterThan(0.01);
      expect(peak).toBeLessThanOrEqual(1);
      expect(wyrmSoundSamples(k).every((v, i) => v === s[i])).toBe(true);
    }
  });
});
