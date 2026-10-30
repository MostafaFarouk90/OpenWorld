import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { createFakeCore } from '../region/testing/fakeCore';
import { createHarrowmarkPlugin } from './harrowmark.plugin';
import { HARROWMARK_LAYOUT, HARROWMARK_NPCS } from './harrowmark.layout';
import { DENSITY_LAYOUT_HM } from './density.layout';
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
    // the density pass's NPCs follow thread 17's cast (src/harrowmark/density.layout.ts)
    expect(HARROWMARK_LAYOUT.npcs).toEqual([...HARROWMARK_NPCS, ...DENSITY_LAYOUT_HM.npcs]);
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

  it('reports no model batches without an asset loader, and keeps the greybox when every model fails or the plugin goes first', async () => {
    const empty = { built: 0, chunks: 0, shownChunks: 0, shownMeshes: 0, shownTriangles: 0 };
    const headless = setup();
    headless.plugin.setup(headless.fc.ctx);
    expect((headless.fc.services.get('harrowmark') as HarrowmarkService).modelBatches?.()).toEqual(empty);
    headless.plugin.dispose?.();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = setup();
    (failing.fc.ctx as { assets: unknown }).assets = { load: () => Promise.reject(new Error('offline')), instantiate: () => { throw new Error('offline'); } };
    failing.plugin.setup(failing.fc.ctx);
    const svc = failing.fc.services.get('harrowmark') as HarrowmarkService;
    const calls = svc.drawCalls();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.modelBatches?.().shownMeshes).toBe(0);
    expect(svc.drawCalls()).toBe(calls);
    failing.plugin.dispose?.();

    const never = setup();
    (never.fc.ctx as { assets: unknown }).assets = { load: () => new Promise(() => {}), instantiate: () => { throw new Error('unused'); } };
    never.plugin.setup(never.fc.ctx);
    never.plugin.dispose?.();
    warn.mockRestore();
  });

  it('closes the South Gate until M06 starts, leaves it open but guarded, then fully open', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    const svc = fc.services.get('harrowmark') as HarrowmarkService;
    const portcullis = () => [...fc.colliders].filter((c) => (c as { enabledFlag?: boolean }).enabledFlag === false).length;
    expect(svc.southGate.state()).toBe('closed');
    expect(portcullis()).toBe(0);
    fc.ctx.state.setFlag('story.m06.started', true);
    fc.ctx.state.setFlag('story.m06.queueHeard', true); // the queue heard (batch 3 density pass)
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
    fc.flags.set('story.m06.queueHeard', true);
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

  it('opens the River Gate shutter once story.gate.a2 is set, and closes it again on a save load without it', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    const svc = fc.services.get('harrowmark') as HarrowmarkService;
    expect(svc.riverGate.open()).toBe(false);
    fc.ctx.state.setFlag('story.gate.a2', true);
    expect(svc.riverGate.open()).toBe(true);
    fc.flags.clear();
    fc.fire('save.loaded');
    expect(svc.riverGate.open()).toBe(false);
    plugin.dispose?.();
  });

  it('opens the North-west Gate onto the Fen Road with story.gate.a3, and shuts it again on loading an Act 2 save', () => {
    const { fc, plugin } = setup();
    fc.flags.set('story.gate.a2', true);
    plugin.setup(fc.ctx);
    const svc = fc.services.get('harrowmark') as HarrowmarkService;
    expect(svc.northwestGate.open()).toBe(false);
    fc.ctx.state.setFlag('story.gate.a3', true);
    expect(svc.northwestGate.open()).toBe(true);
    expect(svc.riverGate.open()).toBe(true);
    // An Act 2 save: the River Gate stays open, the North-west Gate shuts.
    fc.flags.clear();
    fc.flags.set('story.gate.a2', true);
    fc.fire('save.loaded');
    expect(svc.northwestGate.open()).toBe(false);
    expect(svc.riverGate.open()).toBe(true);
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

  it('has no hard dependency on interiors: its failure must not cost the city, and the porch posts always exist', () => {
    expect(createHarrowmarkPlugin().dependsOn).toEqual(['core', 'region', 'npcs']);
    const { fc, plugin, registered } = setup();
    plugin.setup(fc.ctx);
    for (const n of registered[0].specs as Array<{ post: string }>) expect(fc.anchors.has(n.post)).toBe(true);
    plugin.dispose?.();
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
