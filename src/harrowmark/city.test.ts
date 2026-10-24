import { describe, expect, it } from 'vitest';
import { footprintCorners } from '../region/geometry';
import { CENTER, GATE_NAMES, MAX_STRUCTURE_RADIUS, NORTHWEST_PORTCULLIS_ID, PORTCULLIS_ID, RIVER_PORTCULLIS_ID, SHUTTER_IDS, gateBearing, gatePosition, polar, wallStructures, yawAlong } from './city';
import { HARROWMARK_PLATEAU } from '../terrain/shape/harrowmark';
import { HARROWMARK_LAYOUT } from './harrowmark.layout';

describe('ring wall', () => {
  const wall = wallStructures();

  it('has seven gates 360/7 degrees apart, the South Gate at (8500, 1250)', () => {
    expect(GATE_NAMES).toHaveLength(7);
    expect(gateBearing(0)).toBe(180);
    expect(gateBearing(1) - gateBearing(0)).toBeCloseTo(360 / 7, 9);
    const s = gatePosition('south');
    expect(s.x).toBeCloseTo(8500, 6);
    expect(s.z).toBeCloseTo(1250, 6);
  });

  it('puts every gate gap on a chord midpoint: one tower pair per gate', () => {
    for (const g of GATE_NAMES) {
      expect(wall.filter((w) => w.id.startsWith(`tower.${g}-`))).toHaveLength(2);
      const mid = gatePosition(g);
      const [l, r] = ['l', 'r'].map((side) => wall.find((w) => w.id === `tower.${g}-${side}`)!);
      expect(Math.hypot((l.x + r.x) / 2 - mid.x, (l.z + r.z) / 2 - mid.z)).toBeLessThan(0.05);
    }
  });

  it('plugs four gates and gives the South, River and (Act 3) North-west Gates a shutter each', () => {
    expect(wall.filter((w) => w.id.startsWith('plug.')).map((w) => w.id).sort()).toEqual(
      GATE_NAMES.filter((g) => g !== 'south' && g !== 'river' && g !== 'northwest').map((g) => `plug.${g}`).sort(),
    );
    expect(wall.filter((w) => w.id === PORTCULLIS_ID)).toHaveLength(1);
    expect(wall.filter((w) => w.id === RIVER_PORTCULLIS_ID)).toHaveLength(1);
    expect(wall.filter((w) => w.id === NORTHWEST_PORTCULLIS_ID)).toHaveLength(1);
    expect(SHUTTER_IDS).toEqual([PORTCULLIS_ID, RIVER_PORTCULLIS_ID, NORTHWEST_PORTCULLIS_ID]);
    expect(wall.filter((w) => SHUTTER_IDS.includes(w.id)).every((w) => w.kind === 'gate')).toBe(true);
  });

  it('stays inside the plateau box and within the structure radius', () => {
    const { minX, maxX, minZ, maxZ } = HARROWMARK_PLATEAU.box;
    for (const s of wall) {
      for (const [x, z] of footprintCorners(s)) {
        expect(Math.hypot(x - CENTER.x, z - CENTER.z), s.id).toBeLessThanOrEqual(MAX_STRUCTURE_RADIUS);
        // the box edge is tangent to the ring: nothing may be more than the wall's own thickness outside it
        expect(x, s.id).toBeGreaterThan(minX - 4);
        expect(x, s.id).toBeLessThan(maxX + 4);
        expect(z, s.id).toBeGreaterThan(minZ - 4);
        expect(z, s.id).toBeLessThan(maxZ + 4);
      }
    }
  });

  it('closes the ring: consecutive pieces touch or overlap with no gap outside the gates', () => {
    const chords = wall.filter((w) => /^wall\.\d+$/.test(w.id));
    expect(chords).toHaveLength(56 - 7);
    for (const g of GATE_NAMES) {
      const mid = gatePosition(g);
      const near = wall.filter((w) => Math.hypot(w.x - mid.x, w.z - mid.z) < 14 && w.id.startsWith('tower.'));
      expect(near).toHaveLength(2);
    }
  });

  it('yawAlong gives a local x axis pointing along the segment', () => {
    const yaw = (yawAlong(0, 0, 10, 0) * Math.PI) / 180;
    expect([Math.cos(yaw), -Math.sin(yaw)]).toEqual([1, -0]);
    const north = (yawAlong(0, 0, 0, 10) * Math.PI) / 180;
    expect(Math.cos(north)).toBeCloseTo(0, 9);
    expect(-Math.sin(north)).toBeCloseTo(1, 9);
  });

  it('polar uses compass bearings (0 north, 90 east)', () => {
    expect(polar(0, 10)).toEqual({ x: CENTER.x, z: CENTER.z + 10 });
    expect(polar(90, 10).x).toBeCloseTo(CENTER.x + 10, 9);
  });

  it('the layout contains the wall exactly once', () => {
    const ids = HARROWMARK_LAYOUT.structures.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(PORTCULLIS_ID);
    expect(ids).toContain(RIVER_PORTCULLIS_ID);
  });
});
