// Env colliders as nav obstacles: Forge Row and the Bastion yard grids treat the fences, walls and carts as blocked.
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCity } from '../harrowmark/cityBuild';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { blockGridDef, CITY_NAV_BLOCKS } from '../nav/city/blocks';
import { createCityNavPlugin } from '../nav/city/cityNav.plugin';
import { NavGrid } from '../nav/NavGrid';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { createFakeCore } from '../region/testing/fakeCore';
import { heightAt } from '../terrain/heightfield';
import { defaultKeepOut } from './colliderKeepOut';
import { envNavObstacles, NAV_PAD } from './colliderNav';
import { ColliderStreamer } from './colliderStreamer';
import { buildTileColliders } from './colliders';
import { TILES } from './tiles';

const block = (id: string) => CITY_NAV_BLOCKS.find((b) => b.id === id)!;
const structures = HARROWMARK_LAYOUT.structures;

describe('envNavObstacles', () => {
  it('gives Forge Row and the Bastion yard their fences, walls and carts, and the other blocks what lies in them', () => {
    const forge = envNavObstacles(block('forge-row').rect);
    const yard = envNavObstacles(block('bastion-yard').rect);
    // Forge Row is full of pens, walls and carts; the Bastion yard's own fence is a city structure (already in the grid), so only a cart and two wattle runs are env's
    expect(forge.length).toBeGreaterThan(30);
    expect(yard.length).toBeGreaterThanOrEqual(3);
    // every obstacle is padded by half a nav cell and touches its block
    const r = block('forge-row').rect;
    for (const o of forge) {
      expect(o.hx).toBeGreaterThan(NAV_PAD);
      expect(o.cx).toBeGreaterThan(r.x0 - 20);
      expect(o.cx).toBeLessThan(r.x1 + 20);
    }
    // a rect with nothing in it (the ocean) gets none
    expect(envNavObstacles({ x0: -5000, z0: -5000, x1: -4900, z1: -4900 })).toEqual([]);
  });

  it('blocks cells under a fence that the structures-only grid left walkable, and only those', () => {
    const b = block('bastion-yard');
    const plain = blockGridDef(b, structures, heightAt);
    const withEnv = blockGridDef(b, structures, heightAt, undefined, envNavObstacles(b.rect));
    if (!('def' in plain) || !('def' in withEnv)) throw new Error('block skipped');
    expect(withEnv.def.blockedOriented!.length).toBeGreaterThan(plain.def.blockedOriented!.length);
    const a = new NavGrid(plain.def);
    const e = new NavGrid(withEnv.def);
    const count = (g: NavGrid): number => {
      let n = 0;
      for (let i = 0; i < g.cols * g.rows; i++) if (g.isWalkable(i)) n++;
      return n;
    };
    expect(count(e)).toBeLessThan(count(a));
    // nothing becomes walkable that the plain grid blocked
    for (let i = 0; i < e.cols * e.rows; i++) if (e.isWalkable(i)) expect(a.isWalkable(i)).toBe(true);
  });

  it('is not passed when none are given (the signature default keeps the old grids)', () => {
    const b = block('forge-row');
    const x = blockGridDef(b, structures, heightAt);
    const y = blockGridDef(b, structures, heightAt, undefined, []);
    expect(JSON.stringify(x)).toBe(JSON.stringify(y));
  });
});

describe('city nav plugin obstacles', () => {
  it('by default feeds the env obstacles of the H tiles into the block grids', () => {
    const fc = createFakeCore();
    const grids: NavGrid[] = [];
    fc.services.set('nav', { addGrid: (g: NavGrid) => (grids.push(g), () => {}) });
    const plugin = createCityNavPlugin({ structures, heightAt });
    plugin.setup(fc.ctx);
    fc.playerFeet.x = 8200;
    fc.playerFeet.z = 1520;
    fc.tick('rules');
    const forge = grids.find((g) => g.id === 'city.forge-row')!;
    const plain = blockGridDef(block('forge-row'), structures, heightAt);
    if (!('def' in plain)) throw new Error('skipped');
    const reference = new NavGrid(plain.def);
    let fewer = 0;
    for (let i = 0; i < forge.cols * forge.rows; i++) if (reference.isWalkable(i) && !forge.isWalkable(i)) fewer++;
    expect(fewer).toBeGreaterThan(100);
    plugin.dispose?.();
  });

  it('passes the obstacle provider the block rect and uses what it returns', () => {
    const fc = createFakeCore();
    const grids: NavGrid[] = [];
    fc.services.set('nav', { addGrid: (g: NavGrid) => (grids.push(g), () => {}) });
    const rects: unknown[] = [];
    const plugin = createCityNavPlugin({
      structures,
      heightAt,
      obstacles: (rect) => {
        rects.push(rect);
        return [{ cx: 8200, cz: 1520, hx: 10, hz: 10, yaw: 0 }];
      },
    });
    plugin.setup(fc.ctx);
    fc.playerFeet.x = 8200;
    fc.playerFeet.z = 1520;
    fc.tick('rules');
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual(block('forge-row').rect);
    const g = grids.find((q) => q.id === 'city.forge-row')!;
    expect(g.isWalkable(g.cellIndex(8200, 1520))).toBe(false);
    plugin.dispose?.();
  });

  it('?env=off gives the grids no env obstacles', () => {
    const real = (globalThis as { location?: unknown }).location;
    (globalThis as { location?: unknown }).location = { search: '?env=off' };
    try {
      const fc = createFakeCore();
      const grids: NavGrid[] = [];
      fc.services.set('nav', { addGrid: (g: NavGrid) => (grids.push(g), () => {}) });
      const plugin = createCityNavPlugin({ structures, heightAt });
      plugin.setup(fc.ctx);
      fc.playerFeet.x = 8200;
      fc.playerFeet.z = 1740;
      fc.tick('rules');
      const yard = grids.find((q) => q.id === 'city.bastion-yard')!;
      const plain = blockGridDef(block('bastion-yard'), structures, heightAt);
      if (!('def' in plain)) throw new Error('skipped');
      const reference = new NavGrid(plain.def);
      let same = true;
      for (let i = 0; i < yard.cols * yard.rows; i++) if (yard.isWalkable(i) !== reference.isWalkable(i)) same = false;
      expect(same).toBe(true);
      plugin.dispose?.();
    } finally {
      (globalThis as { location?: unknown }).location = real;
    }
  });
});

describe('nav grids against the real env colliders', () => {
  let physics: PhysicsWorld;
  const grids: NavGrid[] = [];
  let streamer: ColliderStreamer;
  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    buildCity({ scene: new THREE.Scene(), physics: physics as never, rapier: physics.rapier }, structures, heightAt);
    streamer = new ColliderStreamer({ rapier: physics.rapier, physics, heightAt });
    const ko = defaultKeepOut();
    for (const t of ['h1', 'h2', 'h3', 'h4']) streamer.addBoxes(buildTileColliders(t, TILES[t]!, ko).boxes);
    for (const id of ['forge-row', 'bastion-yard']) {
      const b = block(id);
      const r = blockGridDef(b, structures, heightAt, undefined, envNavObstacles(b.rect));
      if (!('def' in r)) throw new Error(`${id}: ${r.skipped}`);
      grids.push(new NavGrid(r.def));
      // load every cell around the block
      for (let x = b.rect.x0; x <= b.rect.x1; x += 40) for (let z = b.rect.z0; z <= b.rect.z1; z += 40) for (let i = 0; i < 4; i++) streamer.update(x, z);
    }
    physics.step();
  });
  afterAll(() => {
    streamer.dispose();
    physics.dispose();
  });

  it('has no walkable cell centre inside an env collider or within 0.45 m of one', () => {
    const c = { x: 0, y: 0, z: 0 };
    let walkable = 0;
    for (const g of grids) {
      for (let i = 0; i < g.cols * g.rows; i++) {
        if (!g.isWalkable(i)) continue;
        walkable++;
        g.cellCentre(i, c);
        const at = { x: c.x, y: heightAt(c.x, c.z) + 0.5, z: c.z };
        const pr = physics.world.projectPoint(at, false);
        const d = pr ? Math.hypot(pr.point.x - at.x, pr.point.y - at.y, pr.point.z - at.z) : Infinity;
        expect(pr?.isInside ? 0 : d, `${g.id} (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(0.45);
      }
    }
    expect(walkable).toBeGreaterThan(5000);
  });
});
