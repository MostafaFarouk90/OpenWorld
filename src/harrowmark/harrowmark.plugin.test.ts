import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { createFakeCore } from '../region/testing/fakeCore';
import { createHarrowmarkPlugin } from './harrowmark.plugin';
import { HARROWMARK_LAYOUT, HARROWMARK_NPCS, INSIDE_HOMES } from './harrowmark.layout';
import { HARROWMARK_NPC_DEFS } from './npcDefs';
import type { HarrowmarkService } from './types';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

function setup(withNpcs = true) {
  const fc = createFakeCore();
  fc.useRapier(physics.rapier);
  const add = fc.ctx.physics.addStaticCollider.bind(fc.ctx.physics);
  fc.ctx.physics.addStaticCollider = (desc) => Object.assign(add(desc), { enabledFlag: true, setEnabled(on: boolean) { (this as { enabledFlag: boolean }).enabledFlag = on; } });
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
  return { fc, plugin: createHarrowmarkPlugin(), registered, removed };
}

describe('harrowmark plugin', () => {
  it('defines every anchor and trigger, builds the walls and registers the cast through npcs.register', () => {
    const { fc, plugin, registered } = setup();
    plugin.setup(fc.ctx);
    expect(fc.anchors.size).toBe(HARROWMARK_LAYOUT.anchors.length);
    expect(fc.triggers.size).toBe(HARROWMARK_LAYOUT.triggers.length);
    expect(fc.anchors.get('harrowmark.gate.south')!.position.x).toBeCloseTo(8500, 3);
    expect(registered).toHaveLength(1);
    expect(registered[0].specs).toEqual(HARROWMARK_LAYOUT.npcs);
    expect(registered[0].defs).toBe(HARROWMARK_NPC_DEFS);
    expect(HARROWMARK_NPCS).toBe(HARROWMARK_LAYOUT.npcs);
    expect(fc.colliders.size).toBe(HARROWMARK_LAYOUT.structures.filter((s) => s.mode === 'solid').length);
    plugin.dispose?.();
  });

  it('merges the static greybox into a small number of draw calls', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    const svc = fc.services.get('harrowmark') as HarrowmarkService;
    expect(svc.drawCalls()).toBeGreaterThan(0);
    expect(svc.drawCalls()).toBeLessThan(40);
    plugin.dispose?.();
  });

  it('closes the South Gate until M06 starts, leaves it open but guarded, then fully open', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    const svc = fc.services.get('harrowmark') as HarrowmarkService;
    const portcullis = () => [...fc.colliders].filter((c) => (c as { enabledFlag?: boolean }).enabledFlag === false).length;
    expect(svc.southGate.state()).toBe('closed');
    expect(portcullis()).toBe(0);
    fc.ctx.state.setFlag('story.m06.started', true);
    expect(svc.southGate.state()).toBe('guarded');
    expect(portcullis()).toBe(1);
    fc.ctx.state.setFlag('story.m06.route', 'stealth');
    expect(svc.southGate.state()).toBe('open');
    expect(portcullis()).toBe(1);
    plugin.dispose?.();
  });

  it('re-derives the gate and the world change from a loaded save', () => {
    const { fc, plugin } = setup();
    fc.flags.set('story.m06.started', true);
    fc.flags.set('story.gate.a2', true);
    plugin.setup(fc.ctx);
    const svc = fc.services.get('harrowmark') as HarrowmarkService;
    expect(svc.southGate.state()).toBe('guarded');
    expect(svc.worldChange()).toMatchObject({ active: true, banners: 10, braziers: 21 });
    fc.flags.clear();
    fc.fire('save.loaded');
    expect(svc.southGate.state()).toBe('closed');
    expect(svc.worldChange().active).toBe(false);
    plugin.dispose?.();
  });

  it('lets the story gate override the South Gate', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    const svc = fc.services.get('harrowmark') as HarrowmarkService;
    svc.southGate.override('open');
    expect(svc.southGate.state()).toBe('open');
    svc.southGate.override(null);
    expect(svc.southGate.state()).toBe('closed');
    plugin.dispose?.();
  });

  it('keeps the city when the npcs service is missing or registration throws (the cast is best effort)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = setup(false);
    missing.plugin.setup(missing.fc.ctx);
    expect(missing.fc.anchors.size).toBe(HARROWMARK_LAYOUT.anchors.length);
    expect(missing.fc.services.has('harrowmark')).toBe(true);
    missing.plugin.dispose?.();

    const broken = setup();
    broken.fc.services.set('npcs', { register() { throw new Error('home anchor missing'); } });
    broken.plugin.setup(broken.fc.ctx);
    expect(broken.fc.colliders.size).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledTimes(2);
    broken.plugin.dispose?.();
    warn.mockRestore();
  });

  it('homes the interior NPCs at their inside posts when thread 3a has defined them, and at the porch otherwise', () => {
    const { fc, plugin, registered } = setup();
    for (const post of Object.values(INSIDE_HOMES)) fc.ctx.anchors.define({ id: post, position: { x: 0, y: 150, z: 0 }, yaw: 0 });
    plugin.setup(fc.ctx);
    const specs = registered[0].specs as Array<{ id: string; post: string }>;
    for (const [id, post] of Object.entries(INSIDE_HOMES)) expect(specs.find((n) => n.id === id)!.post).toBe(post);
    expect(specs.find((n) => n.id === 'rook')!.post).toBe('npc-post.rook');
    plugin.dispose?.();

    const none = setup();
    none.plugin.setup(none.fc.ctx);
    const porch = none.registered[0].specs as Array<{ id: string; post: string }>;
    for (const id of Object.keys(INSIDE_HOMES)) expect(porch.find((n) => n.id === id)!.post).toBe(HARROWMARK_LAYOUT.npcs.find((n) => n.id === id)!.post);
    none.plugin.dispose?.();
  });

  it('depends on core, region, npcs and interiors', () => {
    expect(createHarrowmarkPlugin().dependsOn).toEqual(['core', 'region', 'npcs', 'interiors']);
  });

  it('rejects a broken layout in test builds and sets nothing up', () => {
    const { fc } = setup();
    const bad = { ...HARROWMARK_LAYOUT, npcs: [...HARROWMARK_LAYOUT.npcs, { id: 'ghost', post: 'npc-post.ghost' }] };
    const plugin = createHarrowmarkPlugin({ layout: bad });
    expect(() => plugin.setup(fc.ctx)).toThrow(/invalid layout/);
    expect(fc.anchors.size).toBe(0);
  });

  it('removes its NPCs, anchors, colliders and service on dispose, and can set up again', () => {
    const { fc, plugin, removed } = setup();
    plugin.setup(fc.ctx);
    plugin.dispose?.();
    expect(removed).toHaveBeenCalledTimes(1);
    expect(fc.anchors.size).toBe(0);
    expect(fc.colliders.size).toBe(0);
    expect(fc.services.has('harrowmark')).toBe(false);
    expect(() => plugin.setup(fc.ctx)).not.toThrow();
    plugin.dispose?.();
  });

  it('refuses to define an anchor twice (AnchorRegistry throws on duplicates)', () => {
    const { fc, plugin } = setup();
    fc.ctx.anchors.define({ id: 'harrowmark.square.gate', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
    expect(() => plugin.setup(fc.ctx)).toThrow(/duplicate anchor/);
    expect(fc.colliders.size).toBe(0);
  });
});
