import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { heightAt } from '../terrain/heightfield';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { DEADROAD_LAYOUT } from './deadroad.layout';
import { tuftColor, cellTufts, distanceToPolyline, GRASS, GRASS_MAX_INSTANCES, GRASS_MAX_TRIANGLES, GRASS_TRIANGLES_PER_TUFT, GrassField, groundUp, tuftGeometry } from './grass';
import { pointInFootprint } from './geometry';
import { CITY_NO_GRASS_RADIUS, GRASS_DENSITY, grassAcceptFor, grassEnabled, staticColliderAt } from './region.plugin';
import { CENTER } from '../harrowmark/city';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { surfaceColor } from '../terrain/chunkGeometry';
import { RIVER_WIDTH } from './water';

const flat = () => 0;
const all = () => true;

describe('cellTufts', () => {
  it('is deterministic per cell and differs between cells', () => {
    const a = cellTufts(3, -2, flat, all);
    expect(cellTufts(3, -2, flat, all)).toEqual(a);
    expect(cellTufts(4, -2, flat, all)).not.toEqual(a);
    expect(a.length).toBe(GRASS.perCell);
  });

  it('keeps every tuft inside its cell', () => {
    for (const t of cellTufts(-5, 7, flat, all)) {
      expect(t.x).toBeGreaterThanOrEqual(-5 * GRASS.cellSize);
      expect(t.x).toBeLessThan(-4 * GRASS.cellSize);
      expect(t.z).toBeGreaterThanOrEqual(7 * GRASS.cellSize);
      expect(t.z).toBeLessThan(8 * GRASS.cellSize);
    }
  });

  it('thins with density without moving the tufts that stay', () => {
    const full = cellTufts(0, 0, flat, all, 1);
    const half = cellTufts(0, 0, flat, all, 0.5);
    expect(half.length).toBe(GRASS.perCell / 2);
    expect(full.slice(0, half.length)).toEqual(half);
    expect(cellTufts(0, 0, flat, all, 0)).toEqual([]);
    expect(cellTufts(0, 0, flat, all, 7).length).toBe(GRASS.perCell);
  });

  it('grows nothing where the accept function refuses, above the meadow band, on steep ground or on broken ground', () => {
    expect(cellTufts(0, 0, flat, () => false)).toEqual([]);
    expect(cellTufts(0, 0, () => GRASS.maxHeight + 1, all)).toEqual([]);
    expect(cellTufts(0, 0, (x) => x * 2, all)).toEqual([]);
    expect(cellTufts(0, 0, () => Number.NaN, all)).toEqual([]);
  });

  it('keeps out of a refused half without shifting the other half', () => {
    const full = cellTufts(1, 1, flat, all);
    const east = cellTufts(1, 1, flat, (x) => x >= 1.5 * GRASS.cellSize);
    expect(east).toEqual(full.filter((t) => t.x >= 1.5 * GRASS.cellSize));
  });
});

describe('groundUp and distanceToPolyline', () => {
  it('reads 1 on flat ground and less on a slope', () => {
    expect(groundUp(flat, 0, 0)).toBeCloseTo(1);
    expect(groundUp((x) => x, 0, 0)).toBeCloseTo(Math.SQRT1_2);
  });

  it('measures to the nearest segment, its ends and a single point', () => {
    const line = [[0, 0], [10, 0], [10, 10]] as const;
    expect(distanceToPolyline(line, 5, 3)).toBeCloseTo(3);
    expect(distanceToPolyline(line, -4, 3)).toBeCloseTo(5);
    expect(distanceToPolyline(line, 12, 5)).toBeCloseTo(2);
    expect(distanceToPolyline([[1, 1]], 4, 5)).toBeCloseTo(5);
  });
});

describe('tuftGeometry and the budget', () => {
  it('pins the cap: one mesh of at most 7,000 tufts and 41,000 triangles, wherever the player is', () => {
    expect(GRASS_MAX_INSTANCES).toBe(6776);
    expect(GRASS_MAX_TRIANGLES).toBeLessThanOrEqual(41_000);
    const f = new GrassField(() => 0, () => true, 1, Infinity);
    f.update(0, 0, 0);
    const meshes: THREE.InstancedMesh[] = [];
    f.object.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && meshes.push(o as THREE.InstancedMesh));
    expect(meshes).toHaveLength(1);
    expect(meshes[0].instanceMatrix.count).toBe(GRASS_MAX_INSTANCES);
    expect(f.count).toBeLessThanOrEqual(GRASS_MAX_INSTANCES);
    // Thinning with distance: the round, thinned patch draws well under the cap even where everything may grow.
    expect(f.count).toBeLessThan(GRASS_MAX_INSTANCES * 0.6);
    f.dispose();
  });

  it('thins far tufts: the outer ring is sparser than the inner disc', () => {
    const f = new GrassField(() => 0, () => true, 1, Infinity);
    f.update(4, 0, 4);
    const mesh = f.object.getObjectByName('grass-instances') as THREE.InstancedMesh;
    const reach = (GRASS.radiusCells + 0.5) * GRASS.cellSize;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let inner = 0;
    let outer = 0;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      const d = Math.hypot(p.x - 4, p.z - 4) / reach;
      if (d < 0.5) inner++;
      else if (d > 0.75) outer++;
    }
    const innerArea = 0.25;
    const outerArea = 1 - 0.75 * 0.75;
    expect(outer / outerArea).toBeLessThan((inner / innerArea) * 0.7);
    f.dispose();
  });

  it('draws three blades with both windings and up-facing normals', () => {
    const g = tuftGeometry();
    expect(g.getAttribute('position').count).toBe(3 * GRASS_TRIANGLES_PER_TUFT);
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBe(1);
  });
});

describe('GrassField', () => {
  it('grows a round patch around the player and rebuilds only on a new cell', () => {
    const f = new GrassField(flat, all, 1, Infinity);
    expect(f.update(1, 0, 1)).toBe(true);
    expect(f.count).toBeGreaterThan(0);
    const mesh = f.object.getObjectByName('grass-instances') as THREE.InstancedMesh;
    expect(mesh.count).toBe(f.count);
    expect(f.update(2, 0, 2)).toBe(false);
    expect(f.update(1 + GRASS.cellSize, 0, 1)).toBe(true);
    const reach = (GRASS.radiusCells + 0.5) * GRASS.cellSize;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(Math.hypot(p.x - 1.5 * GRASS.cellSize, p.z - 0.5 * GRASS.cellSize)).toBeLessThan(reach);
    }
    f.dispose();
  });

  it('stands every tuft on the ground', () => {
    const h = (x: number, z: number) => 0.1 * x + 0.05 * z + 3;
    const f = new GrassField(h, all, 1, Infinity);
    f.update(0, 3, 0);
    const mesh = f.object.getObjectByName('grass-instances') as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i += 37) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(p.y).toBeCloseTo(h(p.x, p.z), 5);
    }
    f.dispose();
  });

  it('hides while the player is far above the ground (an interior) and shows again on the ground', () => {
    const f = new GrassField(flat, all, 1, Infinity);
    f.update(0, 150, 0);
    expect(f.object.visible).toBe(false);
    f.update(0, 0.5, 0);
    expect(f.object.visible).toBe(true);
    f.dispose();
  });

  it('halves on the low quality step and re-grows on high', () => {
    const f = new GrassField(flat, all, 1, Infinity);
    f.update(0, 0, 0);
    const full = f.count;
    f.setDensity(GRASS_DENSITY.low);
    f.update(0, 0, 0);
    expect(f.count).toBeLessThan(full * 0.6);
    f.setDensity(GRASS_DENSITY.high);
    f.update(0, 0, 0);
    expect(f.count).toBe(full);
    f.dispose();
  });

  it('scatters at most cellsPerFrame new cells a frame, nearest first, then stops rewriting', () => {
    let calls = 0;
    const f = new GrassField(flat, () => (calls++, true), 1, 3);
    expect(f.update(1, 0, 1)).toBe(true);
    // The first frame is an arrival (the 3 x 3), every later frame scatters three.
    expect(calls).toBe(9 * GRASS.perCell);
    expect(f.complete).toBe(false);
    // The first cells are the player's own and its eight neighbours, so grass appears at their feet first.
    const mesh = f.object.getObjectByName('grass-instances') as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(Math.hypot(p.x - 4, p.z - 4)).toBeLessThanOrEqual(1.5 * GRASS.cellSize * Math.SQRT2);
    }
    const cells = (2 * GRASS.radiusCells + 1) ** 2;
    let frames = 1;
    while (!f.complete && frames < 100) {
      f.update(1, 0, 1);
      frames++;
    }
    expect(frames).toBe(1 + Math.ceil((cells - 9) / 3));
    expect(f.update(1, 0, 1)).toBe(false);
    f.dispose();
  });

  it('grows the 3 x 3 cells under the player at once after an arrival (a jump of more than one cell)', () => {
    let calls = 0;
    const f = new GrassField(flat, () => (calls++, true), 1, 3);
    f.update(1, 0, 1);
    expect(calls).toBe(9 * GRASS.perCell);
    calls = 0;
    f.update(1 + GRASS.cellSize, 0, 1);
    expect(calls).toBe(3 * GRASS.perCell);
    calls = 0;
    f.update(500, 0, 500);
    expect(calls).toBe(9 * GRASS.perCell);
    f.dispose();
  });

  it('does no work while hidden in an interior', () => {
    let calls = 0;
    const f = new GrassField(flat, () => (calls++, true), 1, Infinity);
    expect(f.update(0, 150, 0)).toBe(false);
    expect(f.update(40, 150, 40)).toBe(false);
    expect(calls).toBe(0);
    f.dispose();
  });

  it('ignores non-finite positions and calls after dispose', () => {
    const f = new GrassField(flat, all, 1, Infinity);
    expect(f.update(Number.NaN, 0, 0)).toBe(false);
    f.dispose();
    f.dispose();
    expect(f.update(0, 0, 0)).toBe(false);
  });

  it('draws nothing where nothing may grow', () => {
    const f = new GrassField(flat, () => false, 1, Infinity);
    f.update(0, 0, 0);
    expect(f.count).toBe(0);
    f.dispose();
  });
});

describe('grassEnabled', () => {
  it('is on by default and off with ?grass=off', () => {
    expect(grassEnabled('')).toBe(true);
    expect(grassEnabled('?tutorial=veteran')).toBe(true);
    expect(grassEnabled('?grass=off')).toBe(false);
    expect(grassEnabled('?scene=world&grass=off')).toBe(false);
    expect(grassEnabled('?grass=on')).toBe(true);
  });
});

describe('staticColliderAt', () => {
  const hitAt = (y: number | null, opts: { sensor?: boolean; body?: 'fixed' | 'dynamic' | null } = {}) => ({
    raycast: () =>
      y === null
        ? null
        : ({
            point: { x: 0, y, z: 0 },
            normal: { x: 0, y: 1, z: 0 },
            distance: 0,
            collider: {
              isSensor: () => !!opts.sensor,
              parent: () => (opts.body ? { isFixed: () => opts.body === 'fixed' } : null),
            },
          } as never),
  });

  it('finds a fence or wall standing on the ground', () => {
    expect(staticColliderAt(hitAt(1.2), 0, 0, 0)).toBe(true);
    expect(staticColliderAt(hitAt(1.2, { body: 'fixed' }), 0, 0, 0)).toBe(true);
  });

  it('counts the bare ground, nothing at all, sensors and moving bodies as clear', () => {
    expect(staticColliderAt(hitAt(0.02), 0, 0, 0)).toBe(false);
    expect(staticColliderAt(hitAt(null), 0, 0, 0)).toBe(false);
    expect(staticColliderAt(hitAt(1, { sensor: true }), 0, 0, 0)).toBe(false);
    expect(staticColliderAt(hitAt(1, { body: 'dynamic' }), 0, 0, 0)).toBe(false);
  });

  it('refuses grass under a static collider in grassAcceptFor', () => {
    const blocked = grassAcceptFor([BRIGHTWATER_LAYOUT], () => 0, hitAt(0.6));
    const clear = grassAcceptFor([BRIGHTWATER_LAYOUT], () => 0, hitAt(0));
    expect(blocked(30, -30)).toBe(false);
    expect(clear(30, -30)).toBe(true);
  });
});

describe('grassAcceptFor (the real layouts)', () => {
  const accept = grassAcceptFor([BRIGHTWATER_LAYOUT, DEADROAD_LAYOUT], heightAt);

  it('grows on the open spawn meadow', () => {
    const f = new GrassField(heightAt, accept, 1, Infinity);
    f.update(30, 0, -30);
    expect(f.count).toBeGreaterThan(1000);
    f.dispose();
  });

  it('keeps out of the river, structure footprints and Harrowmark', () => {
    expect(accept(-100, -300)).toBe(false);
    expect(accept(-100, -300 + RIVER_WIDTH / 2 + 2)).toBe(true);
    const house = BRIGHTWATER_LAYOUT.structures.find((s) => s.mode === 'solid' && s.kind !== 'fence')!;
    expect(pointInFootprint(house, house.x, house.z)).toBe(true);
    expect(accept(house.x, house.z)).toBe(false);
    expect(accept(8000, 2000)).toBe(false);
  });
});

describe('grass beyond Brightwater', () => {
  const accept = grassAcceptFor([BRIGHTWATER_LAYOUT, DEADROAD_LAYOUT], heightAt);

  it('grows along the Dead Road corridor and the fields outside Harrowmark (it had none before)', () => {
    for (const [x, z] of [[2250, 330], [6000, 900], [7300, 2000]] as const) {
      const f = new GrassField(heightAt, accept, 1, Infinity);
      f.update(x, heightAt(x, z), z);
      expect(f.count, `${x},${z}`).toBeGreaterThan(500);
      f.dispose();
    }
  });

  it('keeps out of the walled city and its streets, right up to the wall', () => {
    expect(accept(CENTER.x, CENTER.z)).toBe(false);
    expect(accept(CENTER.x + CITY_NO_GRASS_RADIUS - 1, CENTER.z)).toBe(false);
    const f = new GrassField(heightAt, accept, 1, Infinity);
    f.update(CENTER.x, heightAt(CENTER.x, CENTER.z), CENTER.z);
    expect(f.count).toBe(0);
    f.dispose();
  });

  it('keeps every Harrowmark structure inside the no-grass radius, and out of the corridor farm buildings', () => {
    for (const st of HARROWMARK_LAYOUT.structures) expect(Math.hypot(st.x - CENTER.x, st.z - CENTER.z), st.id).toBeLessThan(CITY_NO_GRASS_RADIUS);
    const east = DEADROAD_LAYOUT.structures.filter((st) => st.x > 5000);
    expect(east.length).toBeGreaterThan(0);
    for (const st of east) expect(accept(st.x, st.z), st.id).toBe(false);
  });
});

describe('tuftColor', () => {
  const ground = (h: number, up: number) => {
    const c = new Float32Array(3);
    surfaceColor(h, up, c, 0);
    return c;
  };

  it('follows the ground it can stand on: green at 0 m, drier at 130 m, always lifted the same', () => {
    for (const [h, up] of [[0, 1], [80, 0.95], [130, 0.9]] as const) {
      const g = ground(h, up);
      const t = tuftColor(h, up, 0.5);
      for (let k = 0; k < 3; k++) expect(t[k] / g[k]).toBeCloseTo(1 + 0.35, 5);
    }
    const meadow = tuftColor(0, 1, 0);
    expect(meadow[1]).toBeGreaterThan(meadow[0]);
    const dry = tuftColor(130, 1, 0);
    expect(dry[0] / dry[1]).toBeGreaterThan(meadow[0] / meadow[1]);
  });

  it('is lighter for a higher tone and never above 1', () => {
    const lo = tuftColor(10, 1, 0);
    const hi = tuftColor(10, 1, 1);
    expect(hi[1]).toBeGreaterThan(lo[1]);
    for (const v of tuftColor(300, 1, 1)) expect(v).toBeLessThanOrEqual(1);
  });

  it('stores the colour on every tuft', () => {
    for (const t of cellTufts(2, 2, () => 5, () => true)) expect(t.color).toEqual(tuftColor(5, groundUp(() => 5, t.x, t.z), t.tone));
  });
});

