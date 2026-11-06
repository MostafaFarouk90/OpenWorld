// Act 4 thread L1: Ashgate's greybox, the shelters' lean-tos on their pads, and the plugin that builds them.
import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { heightAt, worldRoads } from '../../terrain/heightfield';
import { SHELTER_PAD_HALF, SHELTER_PAD_SITES } from '../../terrain/shape/waste';
import { createFakeCore } from '../testing/fakeCore';
import { validateLayout } from '../validateLayout';
import { ACT4_STRUCTURES, REFUGE_STRUCTURES, SHELTER_STRUCTURES } from './act4Structures';
import { ACT4_WORLD_LAYOUT } from './act4World.layout';
import { createAct4WorldPlugin } from './act4World.plugin';
import { ropePosts, CROSSING_SHELTER_ID, ROPE_LINE_GEOMS, SHELTER_SPOTS } from './ropeLines';

describe('the Act 4 structures', () => {
  it('validate on the real ground (shelters within 1 m of level along their 5 m roofs)', () => {
    expect(validateLayout(ACT4_WORLD_LAYOUT, heightAt, { spawnId: null, maxFootprintSpread: 1 })).toEqual([]);
    expect(ACT4_WORLD_LAYOUT.structures).toEqual(ACT4_STRUCTURES);
  });

  it('give every shelter a solid back and an open roof, and leave every refuge post and shop point clear', () => {
    expect(SHELTER_STRUCTURES).toHaveLength(SHELTER_SPOTS.length * 2);
    for (const s of SHELTER_SPOTS) {
      expect(SHELTER_STRUCTURES.find((x) => x.id === `${s.id}.back`)?.mode, s.id).toBe('solid');
      expect(SHELTER_STRUCTURES.find((x) => x.id === `${s.id}.roof`)?.mode, s.id).toBe('open');
    }
    const solids = REFUGE_STRUCTURES.filter((s) => s.mode === 'solid');
    const points = ACT4_WORLD_LAYOUT.anchors.filter((a) => a.id.startsWith('ashgate.') || a.id.endsWith('.refuge') || a.id === 'npc-post.hild' || a.id === 'waystone.ashgate');
    for (const p of points) {
      for (const s of solids) {
        const reach = Math.hypot(s.footprint[0], s.footprint[1]) / 2;
        expect(Math.hypot(p.x - s.x, p.z - s.z) - reach, `${p.id} by ${s.id}`).toBeGreaterThan(1.2);
      }
    }
  });
});

describe('the shelter pads', () => {
  it('stand under every shelter but the Crossing (on its own plateau), level with the line there', () => {
    const spots = SHELTER_SPOTS.filter((s) => s.id !== CROSSING_SHELTER_ID);
    expect(SHELTER_PAD_SITES.map((p) => p[0])).toEqual(spots.map((s) => s.id));
    for (const [id, x, z, h] of SHELTER_PAD_SITES) {
      const s = spots.find((p) => p.id === id)!;
      expect([x, z], id).toEqual([s.at.x, s.at.z]);
      expect(Math.abs(worldRoads.profile(s.lineId.replace('rope.', 'rope-'), s.arc) - h), id).toBeLessThan(0.15);
      expect(Math.abs(heightAt(x, z) - h), id).toBeLessThan(0.6);
      expect(SHELTER_PAD_HALF).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the act4-world plugin (L1 parts)', () => {
  let physics: PhysicsWorld;
  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  });

  it('adds the triggers, structures, roads and rope-lines, and dispose removes them', () => {
    const fc = createFakeCore();
    fc.useRapier(physics.rapier);
    const plugin = createAct4WorldPlugin({ heightAt: () => 10 });
    plugin.setup(fc.ctx);
    for (const t of ACT4_WORLD_LAYOUT.triggers) expect(fc.triggers.has(t.id), t.id).toBe(true);
    const names: string[] = [];
    fc.ctx.scene.traverse((o) => names.push(o.name));
    expect(names).toEqual(expect.arrayContaining(['act4-roads', 'act4-rope-lines', 'rope-posts', 'rope', 'structures']));
    const posts = fc.ctx.scene.getObjectByName('rope-posts') as unknown as { count: number };
    expect(posts.count).toBe(ROPE_LINE_GEOMS.reduce((n, l) => n + ropePosts(l.id).length, 0));
    plugin.dispose?.();
    expect(fc.triggers.size).toBe(0);
    expect(fc.ctx.scene.getObjectByName('act4-roads')).toBeUndefined();
    expect(fc.ctx.scene.getObjectByName('act4-rope-lines')).toBeUndefined();
  });
});
