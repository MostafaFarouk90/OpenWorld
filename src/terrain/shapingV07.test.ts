// v0.7 terrain shaping (Act 3, K1): flats, uplifts, troughs, the layer order, plateau hollows, raised causeways and
// mountain road blends. Success, failure and edge paths for each kind.
import { describe, expect, it } from 'vitest';
import { buildShaper, MAX_PLATEAU_BLEND_SLOPE, type BaseHeight, type FlatDef, type PlateauDef, type RoadDef, type TerrainShape, type TroughDef, type UpliftDef } from './shaping';

const flat0: BaseHeight = () => 0;
/** Rolling ground: 40 m bumps, so a flat's relief and a pool are visible. */
const rolling: BaseHeight = (x, z) => 40 * Math.sin(x / 300) * Math.cos(z / 250);
const empty: TerrainShape = { plateaus: [], suppressions: [], roads: [] };
const opts = { protectedBox: null, heightRange: { min: -90, max: 640 } } as const;
const box = (minX: number, maxX: number, minZ: number, maxZ: number) => ({ minX, maxX, minZ, maxZ });

const fen = (over: Partial<FlatDef> = {}): FlatDef => ({ id: 'fen', box: box(0, 2000, 0, 2000), blend: 200, level: 10, relief: 0.1, ...over });
const ridge = (over: Partial<UpliftDef> = {}): UpliftDef => ({
  id: 'ridge',
  spine: [
    { x: 0, z: 0, height: 500 },
    { x: 1000, z: 0, height: 600 },
  ],
  radius: 800,
  crags: 0,
  ceiling: 630,
  ...over,
});
const cut = (over: Partial<TroughDef> = {}): TroughDef => ({
  id: 'cut',
  points: [
    { x: 0, z: -500, floor: 300 },
    { x: 0, z: 500, floor: 300 },
  ],
  halfWidth: 50,
  blend: 50,
  ...over,
});

describe('v0.7 flats', () => {
  it('presses the ground toward the level with the given relief inside the box, and leaves it alone past the blend', () => {
    const s = buildShaper({ ...empty, flats: [fen()] }, rolling, opts);
    for (const [x, z] of [[500, 500], [1300, 700], [1900, 100]]) expect(s.heightAt(x, z)).toBeCloseTo(10 + (rolling(x, z, 1) - 10) * 0.1, 9);
    expect(s.heightAt(2201, 500)).toBe(rolling(2201, 500, 1));
    const mid = s.heightAt(2100, 500);
    const a = rolling(2100, 500, 1);
    const b = 10 + (a - 10) * 0.1;
    expect(mid).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-9);
    expect(mid).toBeLessThanOrEqual(Math.max(a, b) + 1e-9);
  });

  it('a soft maxRise keeps everything under level + maxRise', () => {
    const tall: BaseHeight = () => 400;
    const s = buildShaper({ ...empty, flats: [fen({ relief: 0.5, maxRise: 4 })] }, tall, opts);
    const h = s.heightAt(1000, 1000);
    expect(h).toBeLessThanOrEqual(14);
    expect(h).toBeGreaterThan(12);
  });

  it('pools dip toward their floor and never raise ground already under it', () => {
    const s = buildShaper({ ...empty, flats: [fen({ relief: 0, pools: { floor: 5.2, scale: 120, cover: 0.3 } })] }, flat0, opts);
    let low = 0;
    let n = 0;
    for (let x = 0; x <= 2000; x += 20) {
      for (let z = 0; z <= 2000; z += 20) {
        const h = s.heightAt(x, z);
        expect(h).toBeGreaterThanOrEqual(5.2 - 1e-9);
        expect(h).toBeLessThanOrEqual(10 + 1e-9);
        if (h < 6) low++;
        n++;
      }
    }
    expect(low / n).toBeGreaterThan(0.1);
    expect(low / n).toBeLessThan(0.5);
  });

  it('a bowl has a deep floor inside its radius, a shelf outside it, and the flat beyond', () => {
    const bowl = { x: 1000, z: 1000, radius: 300, floor: 3, shelfWidth: 50, shelfFloor: 5.2, blend: 60 };
    const s = buildShaper({ ...empty, flats: [fen({ relief: 0, bowls: [bowl] })] }, flat0, opts);
    expect(s.heightAt(1000, 1000)).toBeCloseTo(3, 9);
    expect(s.heightAt(1000 + 250, 1000)).toBeCloseTo(3, 9);
    expect(s.heightAt(1000 + 340, 1000)).toBeCloseTo(5.2, 9);
    expect(s.heightAt(1000 + 420, 1000)).toBeCloseTo(10, 9);
  });

  it('refuses bad flats: relief outside 0..1, a non-positive blend, a pool floor at the minimum floor, a bowl outside the box', () => {
    const build = (f: FlatDef, o: object = {}) => () => buildShaper({ ...empty, flats: [f] }, flat0, { ...opts, ...o });
    expect(build(fen({ relief: 1.5 }))).toThrow(/relief/);
    expect(build(fen({ blend: 0 }))).toThrow(/blend/);
    expect(build(fen({ level: Number.NaN }))).toThrow(/finite/);
    expect(build(fen({ level: 700 }))).toThrow(/range/);
    expect(build(fen({ maxRise: 0 }))).toThrow(/maxRise/);
    expect(build(fen({ pools: { floor: -40, scale: 100, cover: 0.2 } }), { minFloor: -40 })).toThrow(/minimum floor/);
    expect(build(fen({ pools: { floor: 5, scale: 0, cover: 0.2 } }))).toThrow(/pools/);
    expect(build(fen({ bowls: [{ x: 5000, z: 0, radius: 10, floor: 1, shelfWidth: 0, shelfFloor: 2, blend: 5 }] }))).toThrow(/outside the flat/);
  });
});

describe('v0.7 uplifts', () => {
  it('raises a massif to the spine height along the spine and fades to the ground at the radius', () => {
    const s = buildShaper({ ...empty, uplifts: [ridge()] }, flat0, opts);
    expect(s.heightAt(0, 0)).toBeCloseTo(500, 0);
    expect(s.heightAt(500, 0)).toBeGreaterThan(540);
    expect(s.heightAt(500, 0)).toBeLessThan(560);
    expect(s.heightAt(500, 400)).toBeGreaterThan(100);
    expect(s.heightAt(500, 400)).toBeLessThan(s.heightAt(500, 0));
    expect(s.heightAt(500, 801)).toBe(0);
    // Seamless at the edge of its reach, even over ground under 0.
    const sunk = buildShaper({ ...empty, uplifts: [ridge()] }, () => -30, opts);
    expect(Math.abs(sunk.heightAt(500, 799.9) - -30)).toBeLessThan(0.05);
  });

  it('one spine point is a peak; a profile above 1 makes the flanks steeper near the crest', () => {
    const peak = ridge({ spine: [{ x: 0, z: 0, height: 600 }], radius: 1000 });
    const s = buildShaper({ ...empty, uplifts: [peak] }, flat0, opts);
    expect(s.heightAt(0, 0)).toBeGreaterThan(590);
    const sharp = buildShaper({ ...empty, uplifts: [{ ...peak, profile: 2 }] }, flat0, opts);
    expect(sharp.heightAt(300, 0)).toBeLessThan(s.heightAt(300, 0));
  });

  it('keeps the ground where it is higher than the massif and never passes the soft ceiling', () => {
    const high: BaseHeight = () => 700;
    const s = buildShaper({ ...empty, uplifts: [ridge()] }, high, { protectedBox: null });
    expect(s.heightAt(0, 0)).toBeLessThan(630);
    const crags = buildShaper({ ...empty, uplifts: [ridge({ crags: 200 })] }, flat0, opts);
    let max = 0;
    for (let x = -800; x <= 1800; x += 25) for (let z = -800; z <= 800; z += 25) max = Math.max(max, crags.heightAt(x, z));
    expect(max).toBeLessThan(630);
    expect(max).toBeGreaterThan(560);
  });

  it('refuses a ceiling over the height range, an empty spine, a spine above its ceiling, a zero segment, a bad radius', () => {
    const build = (u: UpliftDef) => () => buildShaper({ ...empty, uplifts: [u] }, flat0, opts);
    expect(build(ridge({ ceiling: 650 }))).toThrow(/above the terrain range/);
    expect(build(ridge({ spine: [] }))).toThrow(/at least 1/);
    expect(build(ridge({ spine: [{ x: 0, z: 0, height: 640 }] }))).toThrow(/above its ceiling/);
    expect(build(ridge({ spine: [{ x: 0, z: 0, height: 5 }, { x: 0, z: 0, height: 5 }] }))).toThrow(/zero length/);
    expect(build(ridge({ radius: 0 }))).toThrow(/radius/);
    expect(build(ridge({ profile: -1 }))).toThrow(/profile/);
  });
});

describe('v0.7 troughs', () => {
  it('cuts down to the floor inside the half width, blends, and never raises', () => {
    const tall: BaseHeight = () => 500;
    const s = buildShaper({ ...empty, troughs: [cut()] }, tall, opts);
    expect(s.heightAt(0, 0)).toBeCloseTo(300, 9);
    expect(s.heightAt(40, 0)).toBeCloseTo(300, 9);
    expect(s.heightAt(75, 0)).toBeGreaterThan(300);
    expect(s.heightAt(101, 0)).toBe(500);
    const low = buildShaper({ ...empty, troughs: [cut()] }, () => 100, opts);
    expect(low.heightAt(0, 0)).toBe(100);
  });

  it('refuses one point, a floor at the minimum floor, and a zero half width', () => {
    const build = (t: TroughDef, o: object = {}) => () => buildShaper({ ...empty, troughs: [t] }, flat0, { ...opts, ...o });
    expect(build(cut({ points: [{ x: 0, z: 0, floor: 1 }] }))).toThrow(/at least 2/);
    expect(build(cut({ points: [{ x: 0, z: 0, floor: -45 }, { x: 0, z: 10, floor: 1 }] }), { minFloor: -40 })).toThrow(/minimum floor/);
    expect(build(cut({ halfWidth: 0 }))).toThrow(/halfWidth/);
  });
});

describe('v0.7 layer order, protection and ids', () => {
  it('applies flats, then uplifts, then troughs: a chasm cuts a massif built on a flat', () => {
    const s = buildShaper({ ...empty, flats: [fen({ box: box(-2000, 2000, -2000, 2000) })], uplifts: [ridge()], troughs: [cut({ points: [{ x: 500, z: -900, floor: 300 }, { x: 500, z: 900, floor: 300 }] })] }, rolling, opts);
    expect(s.heightAt(500, 0)).toBeCloseTo(300, 6);
    expect(s.heightAt(0, 0)).toBeGreaterThan(480);
  });

  it('a 600 m plateau validates on the massif and is refused on lowland (the slope check runs after the uplift)', () => {
    const summit: PlateauDef = { id: 'summit', box: box(400, 600, -100, 100), height: 600, blend: 300 };
    expect(() => buildShaper({ ...empty, uplifts: [ridge({ spine: [{ x: 0, z: 0, height: 600 }, { x: 1000, z: 0, height: 600 }], radius: 2000 })], plateaus: [summit] }, flat0, opts)).not.toThrow();
    expect(() => buildShaper({ ...empty, plateaus: [summit] }, flat0, opts)).toThrow(new RegExp(`exceeds ${MAX_PLATEAU_BLEND_SLOPE}`));
  });

  it('roads are fitted on the shaped ground: a road across a flat follows the flat', () => {
    const r: RoadDef = { id: 'r', points: [{ x: 200, z: 1000 }, { x: 1800, z: 1000 }], halfWidth: 4, blend: 20, maxGrade: 0.08, startTaper: 0 };
    const s = buildShaper({ ...empty, flats: [fen({ relief: 0 })], roads: [r] }, rolling, opts);
    expect(s.roadProfile('r', 800)).toBeCloseTo(10, 6);
  });

  it('refuses any new feature that reaches a protected box', () => {
    const guard = { ...opts, protectedBoxes: [box(3000, 4000, 0, 1000)] };
    expect(() => buildShaper({ ...empty, flats: [fen({ box: box(0, 2900, 0, 1000) })] }, flat0, guard)).toThrow(/protected/);
    expect(() => buildShaper({ ...empty, uplifts: [ridge({ spine: [{ x: 2500, z: 500, height: 100 }], radius: 600 })] }, flat0, guard)).toThrow(/protected/);
    expect(() => buildShaper({ ...empty, troughs: [cut({ points: [{ x: 2950, z: 0, floor: 1 }, { x: 2950, z: 900, floor: 1 }] })] }, flat0, guard)).toThrow(/protected/);
    expect(() => buildShaper({ ...empty, flats: [fen({ box: box(0, 2700, 0, 1000) })] }, flat0, guard)).not.toThrow();
  });

  it('refuses duplicate ids across the old and new kinds', () => {
    expect(() => buildShaper({ ...empty, flats: [fen({ id: 'x' })], uplifts: [ridge({ id: 'x' })] }, flat0, opts)).toThrow(/duplicate id "x"/);
    expect(() => buildShaper({ ...empty, plateaus: [{ id: 'cut', box: box(0, 10, 0, 10), height: 0, blend: 5 }], troughs: [cut()] }, flat0, opts)).toThrow(/duplicate id "cut"/);
  });

  it('a shape without the new lists is the shipped shaper exactly', () => {
    const p: PlateauDef = { id: 'p', box: box(0, 100, 0, 100), height: 5, blend: 50 };
    const a = buildShaper({ ...empty, plateaus: [p] }, rolling, opts);
    const b = buildShaper({ ...empty, plateaus: [p], flats: [], uplifts: [], troughs: [] }, rolling, opts);
    for (const [x, z] of [[50, 50], [120, 30], [700, -400]]) expect(b.heightAt(x, z)).toBe(a.heightAt(x, z));
  });
});

describe('v0.7 plateau hollows', () => {
  const pool: PlateauDef = { id: 'pool', box: box(0, 40, 0, 40), height: 7, blend: 20, hollow: { box: box(14, 26, 15, 25), depth: 6 } };

  it('cuts a pit with straight walls into the finished plateau, leaving the rim flat', () => {
    const s = buildShaper({ ...empty, plateaus: [pool] }, () => 8, opts);
    expect(s.heightAt(20, 20)).toBeCloseTo(1, 9);
    expect(s.heightAt(10, 20)).toBeCloseTo(7, 9);
    expect(s.heightAt(14.5, 20)).toBeLessThan(7);
    expect(s.heightAt(14.5, 20)).toBeGreaterThan(1);
  });

  it('refuses a hollow that reaches the plateau edge, a non-positive depth, or a floor at the minimum floor', () => {
    const build = (p: PlateauDef, o: object = {}) => () => buildShaper({ ...empty, plateaus: [p] }, () => 8, { ...opts, ...o });
    expect(build({ ...pool, hollow: { box: box(0, 10, 10, 20), depth: 3 } })).toThrow(/inside the plateau/);
    expect(build({ ...pool, hollow: { box: box(14, 26, 15, 25), depth: 0 } })).toThrow(/depth/);
    expect(build({ ...pool, hollow: { box: box(14, 26, 15, 25), depth: 50 } }, { minFloor: -40 })).toThrow(/minimum floor/);
  });
});

describe('v0.7 roads: raised causeways, gaps and mountain blends', () => {
  const marsh: BaseHeight = (x) => 5 + Math.sin(x / 40);
  const deck = (over: Partial<RoadDef> = {}): RoadDef => ({
    id: 'c',
    points: [{ x: 0, z: 0 }, { x: 1000, z: 0 }],
    halfWidth: 2,
    blend: 6,
    maxGrade: 0.45,
    startTaper: 0,
    minHeight: 7,
    ...over,
  });
  const onPads = (r: RoadDef): TerrainShape => ({
    ...empty,
    plateaus: [
      { id: 'a', box: box(-30, 0, -15, 15), height: 7, blend: 20 },
      { id: 'b', box: box(1000, 1030, -15, 15), height: 7, blend: 20 },
    ],
    roads: [r],
  });

  it('a causeway never dips under its minHeight, and dips to the ground inside a gap', () => {
    const s = buildShaper(onPads(deck({ gaps: [{ arc: 500, halfLength: 7 }] })), marsh, opts);
    for (let a = 0; a <= 1000; a += 5) if (Math.abs(a - 500) > 12) expect(s.roadProfile('c', a)).toBeGreaterThanOrEqual(7 - 1e-9);
    expect(s.roadProfile('c', 500)).toBeLessThan(6.5);
  });

  it('minHeightFrom lifts only past that arc', () => {
    const s = buildShaper(onPads(deck({ minHeightFrom: 600, maxGrade: 0.08 })), marsh, opts);
    expect(Math.min(...[100, 200, 300].map((a) => s.roadProfile('c', a)))).toBeLessThan(7);
    for (let a = 700; a <= 1000; a += 5) expect(s.roadProfile('c', a)).toBeGreaterThanOrEqual(7 - 1e-9);
  });

  it('refuses a causeway end under its minHeight, a gap outside the road, gaps without minHeight, a bad maxBlend', () => {
    expect(() => buildShaper({ ...empty, roads: [deck()] }, marsh, opts)).toThrow(/under minHeight/);
    expect(() => buildShaper(onPads(deck({ gaps: [{ arc: 995, halfLength: 10 }] })), marsh, opts)).toThrow(/inside the road/);
    expect(() => buildShaper(onPads({ ...deck(), minHeight: undefined, gaps: [{ arc: 500, halfLength: 5 }] }), marsh, opts)).toThrow(/need minHeight/);
    expect(() => buildShaper(onPads(deck({ maxBlend: 2 })), marsh, opts)).toThrow(/maxBlend/);
    expect(() => buildShaper(onPads(deck({ minHeightFrom: 2000 })), marsh, opts)).toThrow(/minHeightFrom/);
  });

  it('maxBlend caps the blend so switchback legs can sit closer than the shipped cap allows', () => {
    const hill: BaseHeight = (_x, z) => 0.5 * z;
    const legs: RoadDef = {
      id: 'zig',
      points: [{ x: 0, z: 0 }, { x: 600, z: 30 }, { x: 600, z: 230 }, { x: 0, z: 260 }],
      halfWidth: 4,
      blend: 10,
      maxGrade: 0.12,
      startTaper: 0,
      maxSideSlope: 1.2,
    };
    expect(() => buildShaper({ ...empty, roads: [legs] }, hill, opts)).toThrow(/closer than twice/);
    expect(() => buildShaper({ ...empty, roads: [{ ...legs, maxBlend: 40 }] }, hill, opts)).not.toThrow();
  });
});
