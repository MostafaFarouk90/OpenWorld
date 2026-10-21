import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { createFakeCore } from '../region/testing/fakeCore';
import { HALL_HOSTILE_FLAG } from './flags';
import { OLDSMOKE_NPC_DEFS } from './npcDefs';
import { OLDSMOKE_LAYOUT } from './oldsmoke.layout';
import { createOldsmokePlugin } from './oldsmoke.plugin';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

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
  return { fc, plugin: createOldsmokePlugin(), registered, removed };
}

describe('oldsmoke plugin', () => {
  it('defines every anchor and trigger once, builds the structures and registers the cast', () => {
    const { fc, plugin, registered } = setup();
    plugin.setup(fc.ctx);
    expect(fc.anchors.size).toBe(OLDSMOKE_LAYOUT.anchors.length);
    expect(fc.triggers.size).toBe(OLDSMOKE_LAYOUT.triggers.length);
    expect(registered).toHaveLength(1);
    expect(registered[0].specs).toEqual(OLDSMOKE_LAYOUT.npcs);
    expect(registered[0].defs).toBe(OLDSMOKE_NPC_DEFS);
    expect(fc.colliders.size).toBeGreaterThanOrEqual(OLDSMOKE_LAYOUT.structures.filter((s) => s.mode === 'solid').length);
    expect(fc.strings.get('npc.slagg.name')).toBeTruthy();
    expect(fc.strings.get('interior.enter.grisel-hall')).toBeTruthy();
    plugin.dispose?.();
  });

  it('defines the two waystones with the waystone tag', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    for (const id of ['waystone.deepgate', 'waystone.weeping-bellows']) expect(fc.anchors.get(id)?.tags, id).toContain('waystone');
    plugin.dispose?.();
  });

  it('derives the readers\' flags from the choices, live and on a load', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    fc.ctx.state.setFlag('story.m21.choice', 'confront');
    expect(fc.ctx.state.getBool(HALL_HOSTILE_FLAG)).toBe(true);
    fc.flags.clear();
    fc.fire('save.loaded');
    expect(fc.ctx.state.getBool(HALL_HOSTILE_FLAG)).toBe(false);
    plugin.dispose?.();
  });

  it('removes everything on dispose and can set up again', () => {
    const { fc, plugin, removed } = setup();
    plugin.setup(fc.ctx);
    plugin.dispose?.();
    expect(removed).toHaveBeenCalledTimes(1);
    expect(fc.anchors.size).toBe(0);
    expect(fc.triggers.size).toBe(0);
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    expect(() => plugin.setup(fc.ctx)).not.toThrow();
    plugin.dispose?.();
  });

  it('stops watching the choices after dispose', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    plugin.dispose?.();
    fc.ctx.state.setFlag('story.m21.choice', 'confront');
    expect(fc.ctx.state.getBool(HALL_HOSTILE_FLAG)).toBe(false);
  });

  it('keeps the places when the npcs service is missing or registration throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = setup(false);
    missing.plugin.setup(missing.fc.ctx);
    expect(missing.fc.anchors.size).toBe(OLDSMOKE_LAYOUT.anchors.length);
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
    const bad = { ...OLDSMOKE_LAYOUT, npcs: [...OLDSMOKE_LAYOUT.npcs, { id: 'ghost', post: 'npc-post.ghost' }] };
    expect(() => createOldsmokePlugin({ layout: bad }).setup(fc.ctx)).toThrow(/invalid layout/);
    expect(fc.anchors.size).toBe(0);
  });

  it('throws on a duplicate anchor and leaves nothing behind', () => {
    const { fc, plugin } = setup();
    fc.ctx.anchors.define({ id: 'waystone.deepgate', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
    expect(() => plugin.setup(fc.ctx)).toThrow(/duplicate anchor/);
    expect(fc.colliders.size).toBe(0);
  });

  it('throws when physics is not ready and registers nothing', () => {
    const fc = createFakeCore();
    expect(() => createOldsmokePlugin().setup(fc.ctx)).toThrow();
    expect(fc.anchors.size).toBe(0);
  });

  it('declares its dependencies without interiors', () => {
    expect(createOldsmokePlugin().dependsOn).toEqual(['core', 'region', 'npcs']);
  });
});
