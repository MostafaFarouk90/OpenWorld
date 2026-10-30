// The Greyfen's outdoor places on K1's shaped ground (plans/act3-K3.md section 10 and revision 2 items 1, 4 and 7).
import { beforeAll, describe, expect, it } from 'vitest';
import { footprintCorners } from '../region/geometry';
import { resolveLayout } from '../region/resolveLayout';
import { validateLayout } from '../region/validateLayout';
import { heightAt } from '../terrain/heightfield';
import { GREYFEN_LAYOUT } from './greyfen.layout';
import { GREYFEN_INTERIORS } from './interiors';
import {
  BRIDGES,
  GREYWATCH_POSTS,
  isWade,
  JETTIES,
  JETTY_DECK,
  JETTY_MIN_DEPTH,
  M24_SOUNDINGS,
  mooringFor,
  POST_HEIGHT,
  REED_BED_SIZE,
  REED_BEDS,
} from './places';
import { FERRY_STOPS, GAP_CUT_HALF_LENGTH, GREYFEN_WATER_TABLE, GREYFEN_WAYSTONES, INTERIOR_PADS, MERE_WAYSTONE_WEST, REEDBED_EAST, REEDBED_WEST, SHRINE_CLEAR, SITES } from './sites';
import { registerGreyfenKinds } from './structureKinds';
import { inBridgeSpan } from './bridges';
import { fitJetty } from './fit';
import { bridgeSpec, GREYFEN_TOGGLES } from './toggles';
import { siteVolumes } from './water';

beforeAll(() => {
  registerGreyfenKinds();
});

const anchor = (id: string) => {
  const a = GREYFEN_LAYOUT.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const dist = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z);

describe('the Greyfen layout', () => {
  it('validates on the shaped ground (anchors on the ground or their structure, reachable, no overlaps, level sites)', () => {
    expect(validateLayout(GREYFEN_LAYOUT, heightAt, { spawnId: null })).toEqual([]);
  });

  it('keeps every id in its namespace, unique, and none in K6b\'s `greyfen.fauna.*`', () => {
    const ids = [...GREYFEN_LAYOUT.anchors.map((a) => a.id), ...GREYFEN_LAYOUT.triggers.map((t) => t.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^(greyfen\.|trg\.greyfen\.|waystone\.|npc-post\.)/);
    for (const id of ids) expect(id.startsWith('greyfen.fauna.'), id).toBe(false);
    for (const s of GREYFEN_LAYOUT.structures) expect(s.id, s.id).toMatch(/^greyfen-/);
    for (const def of GREYFEN_INTERIORS) for (const a of def.anchors) expect(a.id.startsWith('greyfen.fauna.'), a.id).toBe(false);
  });

  it('stands every structure on level ground (feet within 0.3 m), except the plank decks that span water', () => {
    for (const s of [...GREYFEN_LAYOUT.structures, ...GREYFEN_TOGGLES.map((t) => t.spec)]) {
      if (s.kind === 'bridge') continue;
      const pts = [...footprintCorners(s), [s.x, s.z] as const];
      const hs = pts.map(([x, z]) => heightAt(x, z));
      expect(Math.max(...hs) - Math.min(...hs), s.id).toBeLessThanOrEqual(0.3);
    }
  });

  it('defines the four waystones with their contract ids, none inside an interior pad, the Mere one 14 m west of the shrine', () => {
    for (const id of Object.keys(GREYFEN_WAYSTONES)) expect(GREYFEN_LAYOUT.anchors.some((a) => a.id === `waystone.${id}`), id).toBe(true);
    for (const ws of Object.values(GREYFEN_WAYSTONES)) {
      for (const pad of Object.values(INTERIOR_PADS)) expect(Math.abs(ws.x - pad.x) > pad.w / 2 || Math.abs(ws.z - pad.z) > pad.d / 2).toBe(true);
    }
    const shrine = anchor('greyfen.mere.shrine');
    expect(shrine.x).toBe(SITES.mereShrine.x);
    expect(GREYFEN_WAYSTONES['hathrens-mere']).toEqual({ x: SITES.mereShrine.x - MERE_WAYSTONE_WEST, z: SITES.mereShrine.z });
  });

  it('keeps 10 m clear round the shrine for K9', () => {
    for (const s of GREYFEN_LAYOUT.structures) {
      const reach = Math.hypot(...s.footprint) / 2;
      expect(dist(s, SITES.mereShrine) - reach, s.id).toBeGreaterThan(SHRINE_CLEAR);
    }
  });

  it('puts the interiors\' outside doors on ground at their sites, the exit-only doors 12 and 15 m from the main doors', () => {
    expect(anchor('greyfen.chapel.door')).toMatchObject({ x: SITES.chapelDoor.x, z: SITES.chapelDoor.z });
    expect(anchor('greyfen.deeps.door')).toMatchObject({ x: SITES.deepsDoor.x, z: SITES.deepsDoor.z });
    expect(anchor('greyfen.hut.door')).toMatchObject({ x: SITES.hutDoor.x, z: SITES.hutDoor.z });
    expect(dist(anchor('greyfen.chapel.tower-exit'), SITES.chapelDoor)).toBeCloseTo(12, 0);
    expect(dist(anchor('greyfen.deeps.arena-exit'), SITES.deepsDoor)).toBeCloseTo(15, 0);
    for (const id of ['greyfen.chapel.tower-exit', 'greyfen.deeps.arena-exit']) expect(anchor(id).onStructure, id).toBeUndefined();
    // Every door the interiors name outside is defined here.
    for (const def of GREYFEN_INTERIORS) for (const d of def.doors) expect(() => anchor(d.outside), d.outside).not.toThrow();
  });
});

describe('ferry jetties (K7 puts `ferry:<stop>` on the stop anchors)', () => {
  const W = GREYFEN_WATER_TABLE;
  it('meet the ground at the deck height and reach water deep enough for the boat', () => {
    for (const [stop, j] of Object.entries(JETTIES)) {
      expect(heightAt(j.land.x, j.land.z), stop).toBeGreaterThanOrEqual(JETTY_DECK - 0.3);
      expect(heightAt(j.land.x, j.land.z), stop).toBeLessThanOrEqual(JETTY_DECK + 0.3);
      expect(W - heightAt(j.water.x, j.water.z), stop).toBeGreaterThanOrEqual(JETTY_MIN_DEPTH);
      expect(j.length, stop).toBeLessThanOrEqual(80);
    }
  });

  it('stand each stop anchor on its jetty deck, a metre above the water', () => {
    const resolved = resolveLayout(GREYFEN_LAYOUT, heightAt).anchors;
    for (const stop of Object.keys(JETTIES)) {
      const a = resolved.find((r) => r.id === `greyfen.ferry.${stop}`)!;
      expect(a.position.y, stop).toBeCloseTo(JETTY_DECK, 1);
      expect(anchor(`greyfen.ferry.${stop}`).onStructure, stop).toBe(`greyfen-jetty-${stop}`);
    }
  });

  it('every stop is on its dry quay; the jetty runs from the quay edge towards the boat\'s mooring in the channel', () => {
    for (const [stop, j] of Object.entries(JETTIES)) {
      const s = FERRY_STOPS[stop as keyof typeof FERRY_STOPS];
      expect(heightAt(s.x, s.z), stop).toBeGreaterThan(W);
      const m = mooringFor(s);
      expect(dist(m, s), stop).toBeGreaterThan(1);
      // Pointing at the mooring, within a degree.
      const toM = { x: (m.x - s.x) / dist(m, s), z: (m.z - s.z) / dist(m, s) };
      expect(j.dir.x * toM.x + j.dir.z * toM.z, stop).toBeGreaterThan(Math.cos(Math.PI / 180));
    }
  });

  it('a stop in the water runs its jetty in to the shore', () => {
    const wet = (_x: number, z: number) => (z < 0 ? 7 : 4);
    const j = fitJetty({ x: 0, z: 10 }, { x: 0, z: -10 }, { x: 0, z: 30 }, 7, 6, 1.3, wet);
    expect(j.water).toEqual({ x: 0, z: 10 });
    expect(j.land.z).toBeLessThanOrEqual(0);
  });
});

describe('M23 plank bridges', () => {
  it('sit at the two K1 gaps with a lever on each side', () => {
    expect(BRIDGES).toHaveLength(2);
    for (const b of BRIDGES) {
      expect(dist(anchor(`greyfen.m23.bridge.${b.n}`), b.leverNear)).toBeLessThan(0.02);
      expect(dist(anchor(`greyfen.m23.bridge.${b.n}.far`), b.leverFar)).toBeLessThan(0.02);
      // Both levers stand outside the deck's span (with its half-metre margin), so the deck never appears round the player.
      for (const id of [`greyfen.m23.bridge.${b.n}`, `greyfen.m23.bridge.${b.n}.far`]) expect(inBridgeSpan(b.n, anchor(id).x, anchor(id).z), id).toBe(false);
      expect(inBridgeSpan(b.n, b.centre.x, b.centre.z)).toBe(true);
      expect(dist(b.near, b.far)).toBeGreaterThan(b.length - 1);
    }
  });

  it('lay the deck at the causeway height of both gap ends (on K1\'s agreed shape: deck 7, gap floor 5.2)', () => {
    // The agreed profile: a level deck with a cut (2 x GAP_CUT_HALF_LENGTH) to wading depth at each gap.
    for (const b of BRIDGES) {
      const shaped = (x: number, z: number) => (dist({ x, z }, b.centre) < GAP_CUT_HALF_LENGTH ? 5.2 : 7);
      const along = { ...b, deckY: (shaped(b.near.x, b.near.z) + shaped(b.far.x, b.far.z)) / 2 };
      const spec = bridgeSpec(along, shaped);
      const top = shaped(spec.x, spec.z) + (spec.height ?? 0);
      expect(top).toBeCloseTo(shaped(b.near.x, b.near.z), 5);
      expect(top).toBeCloseTo(shaped(b.far.x, b.far.z), 5);
      expect(spec.footprint[0]).toBeGreaterThanOrEqual(2 * GAP_CUT_HALF_LENGTH);
    }
  });

  it('on the real ground the deck spans the whole cut, its ends on the causeway past it', () => {
    for (const b of BRIDGES) {
      const spec = bridgeSpec(b);
      expect(spec.footprint[0]).toBeGreaterThanOrEqual(2 * GAP_CUT_HALF_LENGTH + 2);
      expect(dist(b.near, b.centre)).toBeGreaterThan(GAP_CUT_HALF_LENGTH);
      expect(dist(b.far, b.centre)).toBeGreaterThan(GAP_CUT_HALF_LENGTH);
      // K1's fit is level: both gap ends at the deck height, so the deck meets them with no lip.
      expect(Math.abs(heightAt(b.near.x, b.near.z) - b.deckY)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(heightAt(b.far.x, b.far.z) - b.deckY)).toBeLessThanOrEqual(0.1);
    }
  });
});

describe('quest sites', () => {
  it('R12: five 30 m beds on K1\'s wading reed-bed ground, each with a torch, two cuts and three spawns', () => {
    expect(REED_BEDS).toHaveLength(5);
    for (const [i, b] of REED_BEDS.entries()) {
      const flat = [REEDBED_WEST, REEDBED_EAST].find((f) => b.x - REED_BED_SIZE / 2 >= f.box.minX && b.x + REED_BED_SIZE / 2 <= f.box.maxX);
      expect(flat, `bed ${i + 1}`).toBeDefined();
      expect(b.z - REED_BED_SIZE / 2).toBeGreaterThanOrEqual(flat!.box.minZ);
      expect(b.z + REED_BED_SIZE / 2).toBeLessThanOrEqual(flat!.box.maxZ);
      expect(isWade(heightAt(b.x, b.z))).toBe(true);
      for (const id of ['', '.torch', '.cut.1', '.cut.2']) expect(() => anchor(`greyfen.r12.bed.${i + 1}${id}`)).not.toThrow();
      for (const k of [1, 2, 3]) expect(() => anchor(`greyfen.spawn.r12.bed.${i + 1}.${k}`)).not.toThrow();
    }
  });

  it('M24: five soundings on wading flats, and the horn blown at least 15 m from the pool floor', () => {
    for (const p of M24_SOUNDINGS) expect(isWade(heightAt(p.x, p.z))).toBe(true);
    expect(dist(anchor('greyfen.m24.horn.blow'), anchor('greyfen.m24.pool.horn'))).toBeGreaterThanOrEqual(15);
    expect(anchor('greyfen.m24.pool.horn')).toMatchObject({ x: SITES.m24Pool.x, z: SITES.m24Pool.z });
  });

  it('R14: four posts with platforms 4 m up and a stair of 0.4 m steps down to the ladder foot', () => {
    for (let n = 1; n <= 4; n++) {
      const steps = GREYFEN_LAYOUT.structures.filter((s) => s.id.startsWith(`greyfen-greywatch-post-${n}-step-`));
      const hs = [POST_HEIGHT, ...steps.map((s) => s.height!), 0];
      for (let i = 1; i < hs.length; i++) expect(hs[i - 1]! - hs[i]!, `post ${n} step ${i}`).toBeCloseTo(0.4, 5);
      expect(anchor(`greyfen.greywatch.post.${n}`).dy).toBe(POST_HEIGHT);
    }
    expect(GREYWATCH_POSTS).toHaveLength(4);
  });

  it('keeps every outdoor spawn on wading or dry ground, never in deep water', () => {
    for (const a of GREYFEN_LAYOUT.anchors.filter((x) => x.id.startsWith('greyfen.spawn.'))) {
      expect(heightAt(a.x, a.z), a.id).toBeGreaterThanOrEqual(GREYFEN_WATER_TABLE - 1.2);
    }
  });

  it('registers wading site volumes only (reed beds, mud flats, causeway gaps)', () => {
    const v = siteVolumes();
    expect(v.map((x) => x.id).sort()).toEqual(
      [...[1, 2, 3, 4, 5].map((n) => `water.greyfen.reedbed.${n}`), ...[1, 2, 3, 4, 5].map((n) => `water.greyfen.m24.flat.${n}`), 'water.greyfen.causeway.gap.1', 'water.greyfen.causeway.gap.2'].sort(),
    );
    for (const x of v) expect(x.kind).toBe('wade');
  });
});
