// Water and meadow colour as the player sees them: the river and brook sit on the ground across their whole width, and
// low ground is green, not sand (Mostafa's playthrough, 2026-10-19: "water and grass is not rendering").
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { heightAt } from '../terrain/heightfield';
import { surfaceColor } from '../terrain/chunkGeometry';
import { buildCorridorScenery, WATER_LIFT } from './corridorScenery';
import { drapedWaterGeometry, sampleStations } from './ribbon';
import { BROOK_COURSE, BROOK_WIDTH, RIVER_COURSE, RIVER_WIDTH } from './water';

/** The lowest clearance of a water mesh over the terrain, sampled at every vertex and every triangle's centre. */
function minClearance(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute('position');
  const idx = geometry.getIndex()!;
  let min = Infinity;
  for (let i = 0; i < pos.count; i++) min = Math.min(min, pos.getY(i) - heightAt(pos.getX(i), pos.getZ(i)));
  for (let t = 0; t < idx.count; t += 3) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 3; k++) {
      const v = idx.getX(t + k);
      x += pos.getX(v) / 3;
      y += pos.getY(v) / 3;
      z += pos.getZ(v) / 3;
    }
    min = Math.min(min, y - heightAt(x, z));
  }
  return min;
}

describe('drapedWaterGeometry', () => {
  it('lays every vertex lift above the ground under it, across the whole width', () => {
    const tilted = (x: number, z: number) => 0.3 * z + 0.05 * x;
    const g = drapedWaterGeometry(sampleStations([[0, 0], [20, 0]], 2), 10, tilted, 0.2, 4);
    const pos = g.getAttribute('position');
    expect(pos.count).toBe(11 * 5);
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(tilted(pos.getX(i), pos.getZ(i)) + 0.2, 5);
    expect(g.getIndex()!.count).toBe(10 * 4 * 6);
  });

  it('faces up', () => {
    const g = drapedWaterGeometry(sampleStations([[0, 0], [10, 0], [10, 10]], 2), 4, () => 0, 0.1, 2);
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.99);
  });

  it('takes a single lane', () => {
    const g = drapedWaterGeometry(sampleStations([[0, 0], [4, 0]], 2), 3, () => 1, 0.1, 1);
    expect(g.getAttribute('position').count).toBe(3 * 2);
    expect(g.getIndex()!.count).toBe(2 * 6);
  });

  it.each([
    ['zero width', 0, 2],
    ['negative width', -1, 2],
    ['NaN width', Number.NaN, 2],
    ['zero lanes', 4, 0],
    ['fractional lanes', 4, 1.5],
  ])('rejects %s', (_label, width, lanes) => {
    expect(() => drapedWaterGeometry(sampleStations([[0, 0], [4, 0]], 2), width, () => 0, 0.1, lanes)).toThrow(/ribbon/);
  });
});

describe('the river and brook on the real terrain', () => {
  it.each([
    ['river', RIVER_COURSE, RIVER_WIDTH, 6],
    ['brook', BROOK_COURSE, BROOK_WIDTH, 3],
  ] as const)('the %s never dips under the ground it crosses', (_name, course, width, lanes) => {
    const g = drapedWaterGeometry(sampleStations(course, 3), width, heightAt, WATER_LIFT, lanes);
    // The terrain between vertices is not a plane, so allow a little sag; the old flat sheet sank more than 1 m.
    expect(minClearance(g)).toBeGreaterThan(WATER_LIFT / 2);
  });

  it('builds the river and brook meshes that stay on the ground and are drawn', () => {
    const s = buildCorridorScenery(heightAt);
    for (const name of ['river', 'hollin-brook']) {
      const mesh = s.object.getObjectByName(name) as THREE.Mesh;
      expect(mesh.visible).toBe(true);
      expect(mesh.frustumCulled).toBe(false);
      expect((mesh.material as THREE.Material).opacity).toBeGreaterThan(0.5);
      expect(minClearance(mesh.geometry)).toBeGreaterThan(0.05);
    }
    s.dispose();
  });
});

describe('terrain surface colour', () => {
  const colour = (h: number, up = 1) => {
    const out = new Float32Array(3);
    surfaceColor(h, up, out, 0);
    return out;
  };
  const isGreen = (c: Float32Array) => c[1] > c[0] && c[1] > c[2];

  it('paints the spawn meadow (height 0) and low ground green, not sand', () => {
    for (const h of [0, 0.5, 1.9, 10, 100]) expect(isGreen(colour(h)), `height ${h}`).toBe(true);
  });

  it('paints ground below 0 (the brook valley) green as well, with a finite colour', () => {
    const c = colour(-9);
    expect(isGreen(c)).toBe(true);
    for (const v of c) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('keeps the snow caps and the bare rock on steep slopes', () => {
    const snow = colour(300);
    expect(snow[0]).toBeGreaterThan(0.8);
    const rock = colour(10, 0.5);
    expect(isGreen(rock)).toBe(false);
  });
});
