import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { createFakeCore } from '../region/testing/fakeCore';
import { createDragonspinePlugin } from './dragonspine.plugin';
import { buildDragonspine } from './layout';
import { DRAGONSPINE_NPC_DEFS } from './npcDefs';
import { registerDragonspineKinds } from './structureKinds';
import { stubInputs } from './testing/fixture';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

const inputs = stubInputs();
const build = buildDragonspine(inputs);
const layout = build.layout;
/** The layout's triggers plus the walker catch's volumes (registered by the plugin, absolute, not layout data). */
const triggerCount = layout.triggers.length + build.catchVolumes.length;

function setup(withNpcs = true) {
  const fc = createFakeCore();
  fc.useRapier(physics.rapier);
  const registered: Array<{ specs: unknown; defs: unknown }> = [];
  const removed = vi.fn();
  if (withNpcs) {
    fc.services.set('npcs', {
      register(specs: unknown, defs: unknown) {
        registered.push({ specs, defs });
        return removed;
      },
    });
  }
  return { fc, plugin: createDragonspinePlugin({ inputs }), registered, removed };
}

describe('dragonspine plugin', () => {
  it('defines every anchor, trigger and waystone once, builds the structures and registers the cast', () => {
    const { fc, plugin, registered } = setup();
    plugin.setup(fc.ctx);
    expect(fc.anchors.size).toBe(layout.anchors.length);
    expect(fc.triggers.size).toBe(triggerCount);
    for (const a of layout.anchors) expect(fc.anchors.has(a.id), a.id).toBe(true);
    for (const t of layout.triggers) expect(fc.triggers.has(t.id), t.id).toBe(true);
    for (const v of build.catchVolumes) expect(fc.triggers.has(v.id), v.id).toBe(true);
    for (const id of ['waystone.wyrmwatch-lodge', 'waystone.rime-pass', 'waystone.last-anvil', 'waystone.wyrms-hearth', 'waystone.frostfang-aerie']) expect(fc.anchors.get(id)?.tags, id).toContain('waystone');
    expect(registered).toHaveLength(1);
    expect(registered[0]!.specs).toEqual(layout.npcs);
    expect(registered[0]!.defs).toBe(DRAGONSPINE_NPC_DEFS);
    expect(fc.colliders.size).toBeGreaterThanOrEqual(layout.structures.filter((s) => s.mode === 'solid').length);
    expect(fc.strings.get('npc.thorgar.name')).toBe('Thorgar Skyhold');
    expect(fc.strings.get('interior.enter.wyrmwatch-hall')).toBeTruthy();
    expect(fc.strings.get('interior.enter.collapsed-cave')).toBeTruthy();
    plugin.dispose?.();
  });

  it('never defines K1\'s camp hearth anchor or any dragonspine.wyrmwatch.* id', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    expect(fc.anchors.has('dragonspine.wyrmwatch.hearth')).toBe(false);
    expect([...fc.anchors.keys()].filter((id) => id.startsWith('dragonspine.wyrmwatch.'))).toEqual([]);
    plugin.dispose?.();
  });

  it('rejects a duplicate define (K1\'s or another thread\'s) and leaves nothing behind', () => {
    const { fc, plugin } = setup();
    fc.ctx.anchors.define({ id: 'waystone.last-anvil', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
    expect(() => plugin.setup(fc.ctx)).toThrow(/duplicate anchor/);
    expect(fc.colliders.size).toBe(0);
    expect(fc.anchors.size).toBe(1);
    expect(fc.triggers.size).toBe(0);
  });

  it('removes everything on dispose and can set up again without duplicate errors', () => {
    const { fc, plugin, removed } = setup();
    plugin.setup(fc.ctx);
    plugin.dispose?.();
    expect(removed).toHaveBeenCalledTimes(1);
    expect(fc.anchors.size).toBe(0);
    expect(fc.triggers.size).toBe(0);
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    expect(() => plugin.setup(fc.ctx)).not.toThrow();
    expect(fc.anchors.size).toBe(layout.anchors.length);
    plugin.dispose?.();
  });

  it('keeps the places when the npcs service is missing or registration throws (it costs the cast only)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = setup(false);
    missing.plugin.setup(missing.fc.ctx);
    expect(missing.fc.anchors.size).toBe(layout.anchors.length);
    expect(missing.fc.colliders.size).toBeGreaterThan(0);
    missing.plugin.dispose?.();
    const broken = setup();
    broken.fc.services.set('npcs', { register() { throw new Error('home anchor missing'); } });
    broken.plugin.setup(broken.fc.ctx);
    expect(broken.fc.colliders.size).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledTimes(2);
    broken.plugin.dispose?.();
    warn.mockRestore();
  });

  it('rejects a broken layout in test builds and sets nothing up', () => {
    const { fc } = setup();
    const bad = { ...layout, npcs: [...layout.npcs, { id: 'ghost', post: 'npc-post.ghost' }] };
    expect(() => createDragonspinePlugin({ inputs, layout: bad }).setup(fc.ctx)).toThrow(/invalid layout/);
    expect(fc.anchors.size).toBe(0);
  });

  it('throws when physics is not ready and registers nothing', () => {
    const fc = createFakeCore();
    expect(() => createDragonspinePlugin({ inputs }).setup(fc.ctx)).toThrow();
    expect(fc.anchors.size).toBe(0);
  });

  it('declares its dependencies without interiors and has the id dragonspine', () => {
    const p = createDragonspinePlugin();
    expect(p.id).toBe('dragonspine');
    expect(p.dependsOn).toEqual(['core', 'region', 'npcs']);
  });

  it('shares the structure kinds by reference count: a second plugin and a test next to it do not throw', () => {
    const release = registerDragonspineKinds();
    const { fc, plugin } = setup();
    expect(() => plugin.setup(fc.ctx)).not.toThrow();
    plugin.dispose?.();
    expect(() => registerDragonspineKinds()()).not.toThrow();
    release();
  });
});
