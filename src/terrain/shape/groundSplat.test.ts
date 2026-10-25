import { describe, expect, it } from 'vitest';
import { CROWD_LANES, HARROWMARK_LAYOUT } from '../../harrowmark/harrowmark.layout';
import { createSplatField, SPLAT_CLEAR, SPLAT_ZONES, splatAmount, streetAmount, tintSplat, yardAmount, zoneAmount, type SplatZone } from './groundSplat';
import { H1_SPLAT_ZONES } from './splatZones.h1';

const street: SplatZone = { kind: 'street', id: 't.street', pts: [[0, 0], [0, 100]], halfWidth: 4, edge: 2 };
const yard: SplatZone = { kind: 'yard', id: 't.yard', x0: 100, x1: 140, z0: 0, z1: 30, edge: 8 };

describe('zoneAmount', () => {
  it('is full on the street centre and out to its half width, fades over the edge, and is zero beyond', () => {
    expect(zoneAmount(street, 0, 50)).toBe(1);
    expect(zoneAmount(street, 4, 50)).toBe(1);
    const mid = zoneAmount(street, 5, 50);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
    expect(zoneAmount(street, 6, 50)).toBe(0);
    expect(zoneAmount(street, 40, 50)).toBe(0);
  });
  it('rounds the ends of a street', () => {
    expect(zoneAmount(street, 0, -1)).toBeGreaterThan(0.5);
    expect(zoneAmount(street, 0, -7)).toBe(0);
  });
  it('is full inside a yard, half on its side, and gone one edge width away', () => {
    expect(zoneAmount(yard, 120, 15)).toBe(1);
    expect(zoneAmount(yard, 100, 15)).toBeCloseTo(0.5, 5);
    expect(zoneAmount(yard, 96, 15)).toBeCloseTo(0, 5);
    expect(zoneAmount(yard, 60, 15)).toBe(0);
    expect(zoneAmount(yard, 96.2, 15)).toBeGreaterThan(0);
  });
  it('stays in 0..1 and never rises toward a corner from outside', () => {
    for (let x = 85; x <= 155; x += 5) for (let z = -15; z <= 45; z += 5) {
      const a = zoneAmount(yard, x, z);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    expect(zoneAmount(yard, 97, -3)).toBeLessThan(zoneAmount(yard, 97, 15));
  });
});

describe('createSplatField', () => {
  const field = createSplatField([street, yard]);
  it('keeps streets and yards apart and takes the stronger for amount', () => {
    expect(field.street(0, 50)).toBe(1);
    expect(field.yard(0, 50)).toBe(0);
    expect(field.yard(120, 15)).toBe(1);
    expect(field.amount(120, 15)).toBe(1);
    expect(field.amount(500, 500)).toBe(0);
  });
  it('is the identity for an empty table', () => {
    const e = createSplatField([]);
    expect(e.amount(0, 0)).toBe(0);
    const c = new Float32Array([0.2, 0.4, 0.1]);
    tintSplat(0, 0, c, 0, e);
    expect([...c]).toEqual([Math.fround(0.2), Math.fround(0.4), Math.fround(0.1)]);
  });
});

describe('a trampled yard', () => {
  const camp: SplatZone = { ...yard, id: 't.camp', strength: 0.5, keepBlades: true };
  const field = createSplatField([street, camp]);
  it('colours half as strongly and does not clear the blades, while a street still does', () => {
    expect(field.yard(120, 15)).toBe(0.5);
    expect(field.amount(120, 15)).toBe(0.5);
    expect(field.clear(120, 15)).toBe(0);
    expect(field.clear(0, 50)).toBe(1);
  });
});

describe('tintSplat', () => {
  const field = createSplatField([street, yard]);
  it('leaves the ground colour alone outside every zone', () => {
    const c = new Float32Array([0.2, 0.4, 0.1, 9]);
    tintSplat(500, 500, c, 0, field);
    expect([...c]).toEqual([Math.fround(0.2), Math.fround(0.4), Math.fround(0.1), 9]);
  });
  it('pulls meadow green toward brown earth inside a zone and writes only its three channels at the offset', () => {
    const c = new Float32Array([7, 0.2, 0.4, 0.1, 7]);
    tintSplat(120, 15, c, 1, field);
    expect(c[0]).toBe(7);
    expect(c[4]).toBe(7);
    expect(c[1]!).toBeGreaterThan(0.25); // red up
    expect(c[2]!).toBeLessThan(0.3); // green down
    expect(c[1]!).toBeGreaterThan(c[3]!); // earth is red over blue
  });
  it('is a pure function of (x, z)', () => {
    const a = new Float32Array([0.2, 0.4, 0.1]);
    const b = new Float32Array([0.2, 0.4, 0.1]);
    tintSplat(0, 33, a, 0, field);
    tintSplat(0, 33, b, 0, field);
    expect([...a]).toEqual([...b]);
  });
});

describe('the H1 zone table', () => {
  const lane = (name: string) => CROWD_LANES.find((l) => l.id === `harrowmark.lane.${name}`)!;
  const anchor = (id: string) => HARROWMARK_LAYOUT.anchors.find((a) => a.id === id)!;
  const lanePts = (name: string) => lane(name).points.map((id) => [anchor(id).x, anchor(id).z] as const);

  it('is registered in SPLAT_ZONES and has unique ids', () => {
    for (const z of H1_SPLAT_ZONES) expect(SPLAT_ZONES).toContain(z);
    const ids = SPLAT_ZONES.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('trods the crowd lanes, narrower than their half widths, from the same points', () => {
    for (const [zid, name] of [['h1.main-street', 'main-street-south'], ['h1.gate-queue', 'gate-queue']] as const) {
      const z = H1_SPLAT_ZONES.find((s) => s.id === zid)!;
      expect(z.kind).toBe('street');
      if (z.kind !== 'street') continue;
      expect(z.halfWidth).toBeLessThan(lane(name).halfWidth + 1e-9);
      const pts = lanePts(name);
      // The zone follows the lane's own points; a zone may run past the lane's last point only by the tile overlap (12 m).
      const same = name === 'gate-queue' ? z.pts.length : z.pts.length - 1;
      for (let i = 0; i < same; i++) expect(z.pts[i]).toEqual(pts[i]);
    }
  });
  it('is full on the main street and the gate queue, and mostly gone by the kerb of the crowd lane', () => {
    expect(streetAmount(8490, 1400)).toBe(1);
    expect(streetAmount(8500, 1300)).toBe(1);
    expect(streetAmount(8490 + 11, 1400)).toBe(0);
  });
  it('covers the gate square, the drill yard and the paddock', () => {
    expect(yardAmount(8470, 1300)).toBe(1);
    expect(yardAmount(8360, 1390)).toBeCloseTo(0.7, 5);
    expect(yardAmount(8650, 1390)).toBeCloseTo(0.6, 5);
    // The M06 square's packed earth stops 10 m outside the patrol box: the rim is lawn.
    expect(yardAmount(8445, 1300)).toBe(0);
  });
  it('stays out of the open meadow on the approach and the Dead Road', () => {
    for (const [x, z] of [[8000, 1120], [8300, 1160], [8700, 1160], [8200, 1250], [9100, 1300]]) expect(splatAmount(x, z), `${x},${z}`).toBeLessThan(SPLAT_CLEAR);
  });
  it('keeps the yards inside the H1 core', () => {
    for (const z of H1_SPLAT_ZONES) {
      if (z.kind !== 'yard') continue;
      expect(z.x0).toBeGreaterThanOrEqual(7760);
      expect(z.x1).toBeLessThanOrEqual(9240);
      expect(z.z0).toBeGreaterThanOrEqual(1120);
      expect(z.z1).toBeLessThanOrEqual(1445);
    }
  });
});
