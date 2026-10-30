// Plugin `greyfen` on the fake core (revision 2 items 4, 6, 7 and 8): the places, the cast, the readers, the toggles, the
// bridges, and the water with K7's service absent and present.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ACT2_CORRIDORS } from '../region/act2/act2World';
import { ACT3_CORRIDORS, ACT3_HOLES } from '../region/act3Containment';
import { Containment, DEAD_ROAD_CORRIDOR } from '../region/containment';
import { createFakeCore } from '../region/testing/fakeCore';
import type { WaterService } from '../water/types';
import { BRIDGE_USES } from './bridges';
import { BRIDGES } from './places';
import { CATCH_SECONDS } from './channelCatch';
import { bridgeFlag, DESERTER_GONE_FLAG, DESERTER_STOCKS_FLAG, REEDS_BURNED_FLAG, REEDS_CUT_FLAG } from './flags';
import { GREYFEN_LAYOUT } from './greyfen.layout';
import { createGreyfenPlugin } from './greyfen.plugin';
import { GREYFEN_NPC_DEFS } from './npcDefs';
import { greyfenWater } from './water';
import { ARENA, DEEPS_DEF } from './deepsInterior';
import { layoutInterior } from '../interiors/layout';
import { heightAt } from '../terrain/heightfield';

let physics: PhysicsWorld;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

function setup(opts: { npcs?: boolean } = {}) {
  const fc = createFakeCore();
  fc.useRapier(physics.rapier);
  const registered: Array<{ specs: unknown; defs: unknown }> = [];
  const removed = vi.fn();
  if (opts.npcs !== false) {
    fc.services.set('npcs', {
      register(specs: unknown, defs: unknown) {
        registered.push({ specs, defs });
        return removed;
      },
    });
  }
  return { fc, plugin: createGreyfenPlugin(), registered, removed };
}

const fakeWater = () => {
  const volumes = new Map<string, unknown>();
  const routes = new Map<string, unknown>();
  const svc = {
    register: vi.fn((d: { id: string }) => {
      if (volumes.has(d.id)) throw new Error(`duplicate ${d.id}`);
      volumes.set(d.id, d);
      return () => volumes.delete(d.id);
    }),
    registerRoute: vi.fn((d: { id: string }) => {
      routes.set(d.id, d);
      return () => routes.delete(d.id);
    }),
  } as unknown as WaterService;
  return { svc, volumes, routes };
};

const shown = (fc: ReturnType<typeof createFakeCore>) => (fc.services.get('greyfen') as { shownToggles(): string[] }).shownToggles().sort();
const LUSH = [1, 2, 3, 4, 5].map((n) => `reed-bed-${n}`);
const CHARRED = [1, 2, 3, 4, 5].map((n) => `reed-bed-${n}-charred`);

describe('greyfen plugin', () => {
  it('defines every anchor and trigger once, builds the structures and registers the cast', async () => {
    const { fc, plugin, registered } = setup();
    await plugin.setup(fc.ctx);
    expect(fc.anchors.size).toBe(GREYFEN_LAYOUT.anchors.length);
    expect(fc.triggers.size).toBe(GREYFEN_LAYOUT.triggers.length);
    expect(registered).toHaveLength(1);
    expect(registered[0]!.defs).toBe(GREYFEN_NPC_DEFS);
    expect(fc.colliders.size).toBeGreaterThanOrEqual(GREYFEN_LAYOUT.structures.filter((s) => s.mode === 'solid').length);
    expect(fc.strings.get('npc.leofa.name')).toBe('Leofa Hartley');
    expect(fc.strings.get('interior.enter.greyfen-chapel')).toBeTruthy();
    plugin.dispose?.();
  });

  it('shows lush beds and no bridges on a new game; R12 burned swaps the beds, live and on a load', async () => {
    const { fc, plugin } = setup();
    await plugin.setup(fc.ctx);
    expect(shown(fc)).toEqual(LUSH.sort());
    fc.ctx.state.setFlag('story.r12.choice', 'burned');
    expect(fc.ctx.state.getBool(REEDS_BURNED_FLAG)).toBe(true);
    expect(shown(fc)).toEqual(CHARRED.sort());
    fc.ctx.state.setFlag('story.r12.choice', 'cut');
    expect(fc.ctx.state.getBool(REEDS_BURNED_FLAG)).toBe(false);
    expect(fc.ctx.state.getBool(REEDS_CUT_FLAG)).toBe(true);
    expect(shown(fc)).toEqual(LUSH.sort());
    // A load replaces the flags wholesale: a save from before R12 has lush beds and no derived flag.
    fc.ctx.state.setFlag('story.r12.choice', 'burned');
    fc.flags.clear();
    fc.fire('save.loaded');
    expect(fc.ctx.state.getBool(REEDS_BURNED_FLAG)).toBe(false);
    expect(shown(fc)).toEqual(LUSH.sort());
    plugin.dispose?.();
  });

  it('derives R14 from its two values only; any other value derives nothing', async () => {
    const { fc, plugin } = setup();
    await plugin.setup(fc.ctx);
    fc.ctx.state.setFlag('story.r14.choice', 'returned');
    expect([fc.ctx.state.getBool(DESERTER_STOCKS_FLAG), fc.ctx.state.getBool(DESERTER_GONE_FLAG)]).toEqual([true, false]);
    fc.ctx.state.setFlag('story.r14.choice', 'released');
    expect([fc.ctx.state.getBool(DESERTER_STOCKS_FLAG), fc.ctx.state.getBool(DESERTER_GONE_FLAG)]).toEqual([false, true]);
    fc.ctx.state.setFlag('story.r14.choice', 'hanged');
    expect([fc.ctx.state.getBool(DESERTER_STOCKS_FLAG), fc.ctx.state.getBool(DESERTER_GONE_FLAG)]).toEqual([false, false]);
    fc.ctx.state.setFlag('story.r12.choice', 'flooded');
    expect([fc.ctx.state.getBool(REEDS_BURNED_FLAG), fc.ctx.state.getBool(REEDS_CUT_FLAG)]).toEqual([false, false]);
    plugin.dispose?.();
  });

  it('lowers a bridge from either side, once; the deck shows on the flag and follows a load', async () => {
    const { fc, plugin } = setup();
    await plugin.setup(fc.ctx);
    expect(BRIDGE_USES.map((u) => u.id).every((id) => fc.interactables.has(id))).toBe(true);
    const far1 = fc.interactables.get('use:greyfen-bridge-1-far')!;
    const near1 = fc.interactables.get('use:greyfen-bridge-1-near')!;
    expect(far1.enabled?.()).toBe(true);
    // Before M23 starts the bridge can still be lowered (the gap can be waded anyway).
    far1.onInteract(null as never);
    expect(fc.ctx.state.getBool(bridgeFlag(1))).toBe(true);
    expect(shown(fc)).toContain('bridge-1');
    expect(shown(fc)).not.toContain('bridge-2');
    // The prompt hides on both sides; a second use changes nothing.
    expect(far1.enabled?.()).toBe(false);
    expect(near1.enabled?.()).toBe(false);
    const before = fc.colliders.size;
    near1.onInteract(null as never);
    expect(fc.colliders.size).toBe(before);
    // Bridge 2 cannot be lowered from inside its gap (the deck's collider would appear round the player).
    const near2 = fc.interactables.get('use:greyfen-bridge-2-near')!;
    Object.assign(fc.playerFeet, { x: BRIDGES[1]!.centre.x, y: 6, z: BRIDGES[1]!.centre.z });
    expect(near2.enabled?.()).toBe(false);
    near2.onInteract(null as never);
    expect(fc.ctx.state.getBool(bridgeFlag(2))).toBe(false);
    Object.assign(fc.playerFeet, { x: BRIDGES[1]!.leverNear.x, z: BRIDGES[1]!.leverNear.z });
    expect(near2.enabled?.()).toBe(true);
    expect(fc.colliders.size).toBe(before);
    // A load from before the bridge was lowered takes it away again; a load with it down puts it back.
    fc.flags.clear();
    fc.fire('save.loaded');
    expect(shown(fc)).not.toContain('bridge-1');
    expect(near1.enabled?.()).toBe(true);
    fc.flags.set(bridgeFlag(2), true);
    fc.fire('save.loaded');
    expect(shown(fc)).toContain('bridge-2');
    plugin.dispose?.();
  });

  it('registers the site and interior water once K7\'s service appears, whatever the plugin order', async () => {
    const { fc, plugin } = setup();
    await plugin.setup(fc.ctx);
    fc.tick('rules');
    const status = () => (fc.services.get('greyfen') as { waterRegistered(): boolean }).waterRegistered();
    expect(status()).toBe(false);
    const w = fakeWater();
    fc.services.set('water', w.svc);
    fc.tick('rules');
    fc.tick('rules');
    const want = greyfenWater((d) => layoutInterior(d, heightAt));
    expect([...w.volumes.keys()].sort()).toEqual(want.volumes.map((v) => v.id).sort());
    expect([...w.routes.keys()].sort()).toEqual(want.routes.map((r) => r.id).sort());
    // Every D05 set is registered once: the sluices swap them by `activeWhen`, never by registering again.
    expect(w.svc.register).toHaveBeenCalledTimes(want.volumes.length);
    expect(status()).toBe(true);
    // A re-provided service (a reload) gets everything again; the old one is released.
    const w2 = fakeWater();
    fc.services.set('water', w2.svc);
    fc.tick('rules');
    expect(w.volumes.size).toBe(0);
    expect(w2.volumes.size).toBe(want.volumes.length);
    plugin.dispose?.();
    expect(w2.volumes.size).toBe(0);
    expect(w2.routes.size).toBe(0);
  });

  it('registers at once when the service is already there, and a refused volume costs only itself', async () => {
    const { fc, plugin } = setup();
    const w = fakeWater();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const real = w.svc.register;
    (w.svc as { register: unknown }).register = vi.fn((d: { id: string }) => {
      if (d.id === 'water.greyfen.reedbed.1') throw new Error('K7 owns this one');
      return real(d as never);
    });
    fc.services.set('water', w.svc);
    await plugin.setup(fc.ctx);
    const want = greyfenWater((d) => layoutInterior(d, heightAt));
    expect(w.volumes.size).toBe(want.volumes.length - 1);
    expect(w.routes.size).toBe(want.routes.length);
    expect((fc.services.get('greyfen') as { waterRegistered(): boolean }).waterRegistered()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    plugin.dispose?.();
    warn.mockRestore();
  });

  it('catches a player standing in a Deeps channel only while no water service is present', async () => {
    const { fc, plugin } = setup();
    await plugin.setup(fc.ctx);
    const deeps = layoutInterior(DEEPS_DEF, heightAt);
    const ch = ARENA.channels[0];
    const feet = { x: deeps.origin.x + (ch.x0 + ch.x1) / 2, y: deeps.origin.y - 3.5, z: deeps.origin.z + (ch.z0 + ch.z1) / 2 };
    // The walkway anchors are the interiors plugin's; stand two in for it.
    for (const n of [1, 2]) fc.ctx.anchors.define({ id: `greyfen.d05.arena.walkway.${n}`, position: { x: feet.x + n * 10, y: deeps.origin.y, z: feet.z }, yaw: 0 });
    // Outside, on the ground under the floating arena, nothing happens: the catch only runs inside the Deeps.
    const interiors = { current: null as string | null };
    fc.services.set('interiors', interiors);
    const ticks = Math.ceil(CATCH_SECONDS * 60);
    Object.assign(fc.playerFeet, { ...feet, y: heightAt(feet.x, feet.z) });
    for (let i = 0; i < ticks * 2; i++) fc.tick('rules');
    interiors.current = 'greyfen-deeps';
    for (let i = 0; i < ticks * 2; i++) fc.tick('rules');
    expect(fc.teleports).toHaveLength(0);
    Object.assign(fc.playerFeet, feet);
    for (let i = 0; i < ticks - 2; i++) fc.tick('rules');
    expect(fc.teleports).toHaveLength(0);
    for (let i = 0; i < 3; i++) fc.tick('rules');
    expect(fc.teleports).toHaveLength(1);
    expect(fc.teleports[0]!.feet.x).toBeCloseTo(feet.x + 10, 5);
    // On the walkway (feet at the floor) nothing happens.
    Object.assign(fc.playerFeet, { ...feet, y: deeps.origin.y });
    for (let i = 0; i < ticks * 2; i++) fc.tick('rules');
    expect(fc.teleports).toHaveLength(1);
    // With K7's service the deep volumes push back themselves: the catch stands down.
    fc.services.set('water', fakeWater().svc);
    Object.assign(fc.playerFeet, feet);
    for (let i = 0; i < ticks * 2; i++) fc.tick('rules');
    expect(fc.teleports).toHaveLength(1);
    plugin.dispose?.();
  });

  it('removes everything on dispose and can set up again', async () => {
    const { fc, plugin, removed } = setup();
    await plugin.setup(fc.ctx);
    fc.ctx.state.setFlag(bridgeFlag(1), true);
    plugin.dispose?.();
    expect(removed).toHaveBeenCalledTimes(1);
    expect(fc.anchors.size).toBe(0);
    expect(fc.triggers.size).toBe(0);
    expect(fc.interactables.size).toBe(0);
    expect(fc.systems.size).toBe(0);
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    expect(fc.services.has('greyfen')).toBe(false);
    await expect(plugin.setup(fc.ctx)).resolves.toBeUndefined();
    plugin.dispose?.();
  });

  it('keeps the places when the npcs service is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { fc, plugin } = setup({ npcs: false });
    await plugin.setup(fc.ctx);
    expect(fc.anchors.size).toBe(GREYFEN_LAYOUT.anchors.length);
    expect(warn).toHaveBeenCalledTimes(1);
    plugin.dispose?.();
    warn.mockRestore();
  });

  it('rejects a broken layout in test builds and sets nothing up', async () => {
    const { fc } = setup();
    const bad = { ...GREYFEN_LAYOUT, npcs: [...GREYFEN_LAYOUT.npcs, { id: 'ghost', post: 'npc-post.ghost' }] };
    await expect(createGreyfenPlugin({ layout: bad }).setup(fc.ctx)).rejects.toThrow(/invalid layout/);
    expect(fc.anchors.size).toBe(0);
  });

  it('throws on a duplicate anchor and leaves nothing behind', async () => {
    const { fc, plugin } = setup();
    fc.ctx.anchors.define({ id: 'waystone.reedgate', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
    await expect(plugin.setup(fc.ctx)).rejects.toThrow(/duplicate anchor/);
    expect(fc.colliders.size).toBe(0);
  });

  it('declares its dependencies without interiors or water', async () => {
    expect(createGreyfenPlugin().dependsOn).toEqual(['core', 'region', 'npcs']);
  });
});

describe('Greyfen containment', () => {
  const contain = (flags: Record<string, boolean>) => {
    const c = new Containment({ getFlag: (k: string) => flags[k] } as never, [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS], ACT3_HOLES);
    for (const def of ACT2_CORRIDORS) c.addCorridor(def);
    return c;
  };

  it('has every site inside the open Greyfen with `story.gate.a3`, and closed without it', async () => {
    const open = contain({ 'story.gate.a2': true, 'story.gate.a3': true });
    const shut = contain({ 'story.gate.a2': true });
    for (const a of GREYFEN_LAYOUT.anchors) {
      expect(open.isOpen(a.x, a.z), a.id).toBe(true);
      expect(shut.isOpen(a.x, a.z), a.id).toBe(false);
    }
  });
});
