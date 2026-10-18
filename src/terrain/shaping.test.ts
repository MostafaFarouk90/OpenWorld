import { describe, expect, it } from 'vitest';
import { buildShaper, DEFAULT_MAX_SIDE_SLOPE, validateShape, type BaseHeight, type RoadDef, type TerrainShape } from './shaping';

const flat: BaseHeight = () => 0;
/** A ridge term of 50 m everywhere plus a gentle east-west slope, so suppression and grades are visible. */
const ridged: BaseHeight = (x, _z, ridgeScale) => 0.02 * x + 50 * ridgeScale;
const empty: TerrainShape = { plateaus: [], suppressions: [], roads: [] };
const opts = { protectedBox: null } as const;

const road = (over: Partial<RoadDef> = {}): RoadDef => ({
  id: 'r',
  points: [
    { x: 0, z: 0 },
    { x: 1000, z: 0 },
  ],
  halfWidth: 6,
  blend: 30,
  maxGrade: 0.08,
  startTaper: 60,
  ...over,
});

describe('terrain shaping: identity and suppression', () => {
  it('an empty shape is the base ground exactly', () => {
    const s = buildShaper(empty, ridged, opts);
    for (const [x, z] of [[0, 0], [123.4, -987.6], [5e3, 4e3]]) expect(s.heightAt(x, z)).toBe(ridged(x, z, 1));
  });

  it('suppression removes the ridge term inside the box, blends, and is identity past the blend', () => {
    const shape: TerrainShape = { ...empty, suppressions: [{ id: 's', box: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, blend: 50, strength: 1 }] };
    const s = buildShaper(shape, ridged, opts);
    expect(s.heightAt(50, 50)).toBeCloseTo(0.02 * 50, 9);
    expect(s.ridgeScale(50, 50)).toBe(0);
    const mid = s.heightAt(125, 50);
    expect(mid).toBeGreaterThan(0.02 * 125);
    expect(mid).toBeLessThan(0.02 * 125 + 50);
    expect(s.heightAt(151, 50)).toBe(ridged(151, 50, 1));
  });
});

describe('terrain shaping: plateaus', () => {
  const plateau = { id: 'p', box: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, height: 20, blend: 100 };

  it('is flat inside its box, continuous at both blend edges, and untouched past the blend', () => {
    const s = buildShaper({ ...empty, plateaus: [plateau] }, flat, opts);
    for (const [x, z] of [[0, 0], [50, 50], [100, 100]]) expect(s.heightAt(x, z)).toBe(20);
    expect(s.heightAt(100.001, 50)).toBeCloseTo(20, 4);
    expect(s.heightAt(150, 50)).toBeCloseTo(10, 9);
    expect(s.heightAt(199.999, 50)).toBeCloseTo(0, 4);
    expect(s.heightAt(200.5, 50)).toBe(0);
  });

  it('rejects an inverted box, a height outside the range, a steep blend and a duplicate id', () => {
    const bad = (p: object) => () => validateShape({ ...empty, plateaus: [{ ...plateau, ...p }] }, flat, { ...opts, heightRange: { min: -90, max: 640 } });
    expect(bad({ box: { minX: 10, maxX: 0, minZ: 0, maxZ: 1 } })).toThrow(/inverted/);
    expect(bad({ height: 700 })).toThrow(/range/);
    expect(bad({ height: 60 })).toThrow(/blend slope/);
    expect(bad({ blend: 0 })).toThrow(/blend/);
    expect(() => validateShape({ ...empty, plateaus: [plateau, plateau] }, flat, opts)).toThrow(/duplicate/);
  });

  it('rejects a feature outside the world bounds or reaching into the protected box', () => {
    const bounds = { minX: -50, maxX: 150, minZ: -50, maxZ: 150 };
    expect(() => validateShape({ ...empty, plateaus: [{ ...plateau, box: { minX: 0, maxX: 200, minZ: 0, maxZ: 10 } }] }, flat, { ...opts, bounds })).toThrow(/bounds/);
    expect(() =>
      validateShape({ ...empty, plateaus: [plateau] }, flat, { protectedBox: { minX: -500, maxX: -50, minZ: 0, maxZ: 10 } }),
    ).toThrow(/protected/);
    expect(() =>
      validateShape({ ...empty, suppressions: [{ id: 's', box: plateau.box, blend: 10, strength: 1 }] }, flat, { protectedBox: { minX: -500, maxX: -5, minZ: 0, maxZ: 10 } }),
    ).toThrow(/protected/);
  });
});

describe('terrain shaping: roads', () => {
  /** Rolling ground with 30 m swings every 400 m: the road must cut and fill to stay at 8%. */
  const rolling: BaseHeight = (x, z) => 30 * Math.sin(x / 64) + 0.001 * z;

  it('keeps the centreline grade within maxGrade past the taper, and pins both ends to the ground', () => {
    const s = buildShaper({ ...empty, roads: [road()] }, rolling, opts);
    const len = s.roadLength('r');
    expect(len).toBeCloseTo(1000, 9);
    expect(s.roadProfile('r', 0)).toBeCloseTo(rolling(0, 0, 1), 9);
    expect(s.roadProfile('r', len)).toBeCloseTo(rolling(1000, 0, 1), 9);
    let worst = 0;
    for (let x = 60; x < 1000; x += 1) worst = Math.max(worst, Math.abs(s.heightAt(x + 1, 0) - s.heightAt(x, 0)));
    expect(worst).toBeLessThanOrEqual(0.08 + 1e-9);
  });

  it('is level across the road, blends to the ground, and leaves ground past the widened blend untouched', () => {
    const s = buildShaper({ ...empty, roads: [road()] }, rolling, opts);
    const x = 500;
    const centre = s.heightAt(x, 0);
    expect(s.heightAt(x, 5.9)).toBeCloseTo(centre, 9);
    expect(s.heightAt(x, -5.9)).toBeCloseTo(centre, 9);
    const cut = Math.abs(centre - rolling(x, 0, 1));
    const reach = 6 + Math.max(30, cut / DEFAULT_MAX_SIDE_SLOPE);
    expect(s.heightAt(x, reach + 20)).toBe(rolling(x, reach + 20, 1));
  });

  it('the taper is 0 at points[0], so ground behind and at the start is untouched', () => {
    const s = buildShaper({ ...empty, roads: [road()] }, rolling, opts);
    for (const [x, z] of [[0, 0], [-1, 0], [-10, 5], [0, -30]]) expect(s.heightAt(x, z)).toBe(rolling(x, z, 1));
  });

  it('a constant-x segment works', () => {
    const r = road({ points: [{ x: 0, z: 0 }, { x: 0, z: 800 }] });
    const s = buildShaper({ ...empty, roads: [r] }, (_x, z) => 30 * Math.sin(z / 64), opts);
    let worst = 0;
    for (let z = 60; z < 800; z += 1) worst = Math.max(worst, Math.abs(s.heightAt(0, z + 1) - s.heightAt(0, z)));
    expect(worst).toBeLessThanOrEqual(0.08 + 1e-9);
    expect(s.heightAt(3, 400)).toBeCloseTo(s.heightAt(0, 400), 9);
  });

  it('is continuous across a bend bisector on the inside of the bend', () => {
    // A 30 degree bend at (500, 0) on a steady 8% climb: without the bisector mix the height would step there.
    const pts = [{ x: 0, z: 0 }, { x: 500, z: 0 }, { x: 500 + 500 * Math.cos(Math.PI / 6), z: 500 * Math.sin(Math.PI / 6) }];
    const s = buildShaper({ ...empty, roads: [road({ points: pts })] }, (x) => 0.07 * x, opts);
    // Walk along the inside, across the bisector, 4 m from the centreline.
    const bis = (Math.PI / 6 + Math.PI) / 2; // bisector direction of the inner angle
    let worst = 0;
    let prev: number | null = null;
    for (let t = -20; t <= 20; t += 0.05) {
      const along = { x: 500 + Math.cos(bis) * 4 + t * Math.cos(Math.PI / 12), z: Math.sin(bis) * 4 + t * Math.sin(Math.PI / 12) };
      const h = s.heightAt(along.x, along.z);
      if (prev !== null) worst = Math.max(worst, Math.abs(h - prev));
      prev = h;
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('rejects bad road data', () => {
    const bad = (r: Partial<RoadDef>) => () => validateShape({ ...empty, roads: [road(r)] }, flat, opts);
    expect(bad({ points: [{ x: 0, z: 0 }] })).toThrow(/2 points/);
    expect(bad({ points: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 10, z: 0 }] })).toThrow(/zero length/);
    expect(bad({ halfWidth: 0 })).toThrow(/halfWidth/);
    expect(bad({ maxGrade: 0 })).toThrow(/maxGrade/);
    expect(bad({ startTaper: -1 })).toThrow(/startTaper/);
    expect(bad({ startTaper: 5000 })).toThrow(/longer/);
    expect(bad({ maxSideSlope: 0 })).toThrow(/maxSideSlope/);
    expect(bad({ points: [{ x: 0, z: 0 }, { x: Number.NaN, z: 1 }] })).toThrow(/finite/);
    // Ends 200 m apart in height over 1 km cannot be graded at 8%.
    expect(() => validateShape({ ...empty, roads: [road()] }, (x) => 0.2 * x, opts)).toThrow(/maxGrade allows/);
  });

  it('rejects a road that changes ground inside the protected box, and accepts one that only tapers there', () => {
    const protectedBox = { minX: -500, maxX: 0, minZ: -500, maxZ: 500 };
    expect(() => validateShape({ ...empty, roads: [road()] }, flat, { protectedBox })).not.toThrow();
    // Starting inside the box, the road's body crosses it.
    const inside = road({ points: [{ x: -200, z: 0 }, { x: 800, z: 0 }] });
    expect(() => validateShape({ ...empty, roads: [inside] }, flat, { protectedBox })).toThrow(/Phase A/);
  });
});
