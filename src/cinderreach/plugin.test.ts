import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Containment, DEAD_ROAD_CORRIDOR } from '../region/containment';
import { ACT2_CORRIDORS } from '../region/act2/act2World';
import { createFakeCore } from '../region/testing/fakeCore';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';
import { createCinderreachPlugin } from './cinderreach.plugin';
import { CINDERREACH_NPC_DEFS } from './npcDefs';
import { CINDERFORD_SEALED_FLAG, DEN_SPARED_FLAG } from './flags';
import { CINDERREACH_KEEP_OUT } from './sites';
import { SITES_FIT } from './sitesFit';
import { roadLength, roadPoint } from '../terrain/shape/roadPoint';

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
  return { fc, plugin: createCinderreachPlugin(), registered, removed };
}

describe('cinderreach plugin', () => {
  it('defines every anchor and trigger once, builds the structures and registers the cast', () => {
    const { fc, plugin, registered } = setup();
    plugin.setup(fc.ctx);
    expect(fc.anchors.size).toBe(CINDERREACH_LAYOUT.anchors.length);
    expect(fc.triggers.size).toBe(CINDERREACH_LAYOUT.triggers.length);
    expect(registered).toHaveLength(1);
    expect(registered[0].specs).toEqual(CINDERREACH_LAYOUT.npcs);
    expect(registered[0].defs).toBe(CINDERREACH_NPC_DEFS);
    expect(fc.colliders.size).toBeGreaterThanOrEqual(CINDERREACH_LAYOUT.structures.filter((s) => s.mode === 'solid').length);
    expect(fc.strings.get('npc.ketta.name')).toBeTruthy();
    plugin.dispose?.();
  });

  it('shows the toggled pieces from the choice flags, live and on a load', () => {
    const { fc, plugin } = setup();
    plugin.setup(fc.ctx);
    const svc = () => (fc.services.get('cinderreach') as { shownToggles(): string[] }).shownToggles();
    expect(svc()).toEqual(['well-blight']);
    fc.ctx.state.setFlag('story.r06.choice', 'sealed');
    expect(svc().sort()).toEqual(['boarded-well', 'well-blight']);
    fc.ctx.state.setFlag('story.r06.choice', 'cleansed');
    expect(svc()).toEqual([]);
    fc.ctx.state.setFlag('story.r11.choice', 'spared');
    expect(svc()).toEqual(['den-marker']);
    fc.flags.clear();
    fc.fire('save.loaded');
    expect(svc()).toEqual(['well-blight']);
    expect(fc.ctx.state.getBool(CINDERFORD_SEALED_FLAG)).toBe(false);
    expect(fc.ctx.state.getBool(DEN_SPARED_FLAG)).toBe(false);
    plugin.dispose?.();
  });

  it('removes everything on dispose and can set up again', () => {
    const { fc, plugin, removed } = setup();
    plugin.setup(fc.ctx);
    fc.ctx.state.setFlag('story.r06.choice', 'sealed');
    plugin.dispose?.();
    expect(removed).toHaveBeenCalledTimes(1);
    expect(fc.anchors.size).toBe(0);
    expect(fc.triggers.size).toBe(0);
    expect(fc.colliders.size).toBe(0);
    expect(fc.scene.children).toHaveLength(0);
    expect(fc.services.has('cinderreach')).toBe(false);
    expect(() => plugin.setup(fc.ctx)).not.toThrow();
    plugin.dispose?.();
  });

  it('keeps the places when the npcs service is missing or registration throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = setup(false);
    missing.plugin.setup(missing.fc.ctx);
    expect(missing.fc.anchors.size).toBe(CINDERREACH_LAYOUT.anchors.length);
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
    const bad = { ...CINDERREACH_LAYOUT, npcs: [...CINDERREACH_LAYOUT.npcs, { id: 'ghost', post: 'npc-post.ghost' }] };
    expect(() => createCinderreachPlugin({ layout: bad }).setup(fc.ctx)).toThrow(/invalid layout/);
    expect(fc.anchors.size).toBe(0);
  });

  it('throws on a duplicate anchor and leaves nothing behind', () => {
    const { fc, plugin } = setup();
    fc.ctx.anchors.define({ id: 'waystone.cinderford', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
    expect(() => plugin.setup(fc.ctx)).toThrow(/duplicate anchor/);
    expect(fc.colliders.size).toBe(0);
  });

  it('declares its dependencies without interiors', () => {
    expect(createCinderreachPlugin().dependsOn).toEqual(['core', 'region', 'npcs']);
  });
});

describe('Cinderreach containment', () => {
  const open = new Containment({ getFlag: (k: string) => (k === 'story.gate.a2' ? true : undefined) } as never, [DEAD_ROAD_CORRIDOR, ...ACT2_CORRIDORS]);

  it('has every anchor and trigger inside the open region once story.gate.a2 is set', () => {
    for (const a of CINDERREACH_LAYOUT.anchors) expect(open.isOpen(a.x, a.z), a.id).toBe(true);
    for (const t of CINDERREACH_LAYOUT.triggers) {
      expect(open.isOpen(t.x, t.z), t.id).toBe(true);
    }
  });

  it('opens the Cinder Road stone with 25 m to spare, and the road to each site', () => {
    const stone = SITES_FIT.stone;
    for (const [dx, dz] of [[25, 0], [-25, 0], [0, 25], [0, -25]]) expect(open.isOpen(stone.x + dx, stone.z + dz)).toBe(true);
    for (const id of ['cinder-road', 'stonefold-road', 'fellwalker-track', 'hushed-anvil-path', 'scorchhold-road'] as const) {
      for (let s = 0; s <= roadLength(id); s += 50) {
        const p = roadPoint(id, s, 0);
        expect(open.isOpen(p.x, p.z), `${id} ${s}`).toBe(true);
      }
    }
  });

  it('keeps the keep-out circles inside it too', () => {
    for (const k of CINDERREACH_KEEP_OUT) expect(open.isOpen(k.x, k.z), k.id).toBe(true);
  });
});
