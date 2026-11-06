// Harrowmark's Act 4 interiors (L2): the chamber, the Keep stairs, the Crucible Cellars and the deep run. Pins their layouts,
// checks every anchor stands in a room, the stair flights stay on the nav grid one step at a time, the deep run's path and
// exit, the links' ends and the door locks. The shipped interiors' pins (shippedPin.test.ts, underways/generate.test.ts) are
// untouched and still run.
import { describe, expect, it } from 'vitest';
import { CENTER, RING_RADIUS } from '../../../harrowmark/city';
import { DEEP_RUN_EXIT, LINK_ONLY_EXIT } from '../../../harrowmark/act4/sites';
import { heightAt } from '../../../terrain/heightfield';
import { deepRunPath, DEEP_RUN_DEF, DEEP_RUN_FEATURES, DEEP_RUN_SEED, generateDeepRun } from '../../deeprun/generate';
import { layoutInterior, MAX_WALKABLE_PROP, stairSteps, standsIn, sunkenDepthAt } from '../../layout';
import type { InteriorDef } from '../../types';
import { UNDERWAYS_DEF } from '../../underways/generate';
import {
  ACT4_HARROWMARK_DOOR_LOCKS,
  ACT4_HARROWMARK_FLAG_BLOCKERS,
  ACT4_HARROWMARK_INTERIORS,
  ACT4_HARROWMARK_LINKS,
  COUNCIL_CHAMBER_DEF,
  CRUCIBLE_DEF,
  CRUCIBLE_VALVES,
  KEEP_STAIRS_DEF,
  LANDING_DEPTH,
  STAIR_STEP,
} from '.';

/** 64-bit FNV-1a as two 32-bit halves, hex (the shippedPin.test.ts hash). */
function fnv(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
const hashOf = (def: InteriorDef): string => {
  const l = layoutInterior(def, () => 0);
  return fnv(JSON.stringify({ b: l.boxes, a: l.anchors, n: l.nav, bo: l.bounds, f: l.floorY }));
};

const byId = (id: string) => ACT4_HARROWMARK_INTERIORS.find((d) => d.id === id)!;

describe('Act 4 Harrowmark interiors', () => {
  it('ships four new interiors with unique ids', () => {
    expect(ACT4_HARROWMARK_INTERIORS.map((d) => d.id)).toEqual(['council-chamber', 'keep-stairs', 'crucible-cellars', 'deep-run']);
  });

  it('stands every anchor inside a room, off pillars and solid props', () => {
    for (const def of ACT4_HARROWMARK_INTERIORS) {
      const l = layoutInterior(def, heightAt);
      for (const a of l.anchors) expect(standsIn(l, a.position), `${def.id} ${a.id}`).toBe(true);
    }
  });

  it('names every anchor and trigger with an Act 4 prefix', () => {
    for (const def of ACT4_HARROWMARK_INTERIORS) {
      for (const a of def.anchors) expect(a.id, def.id).toMatch(/^harrowmark\.a4\./);
      for (const t of def.triggers) expect(t.id, def.id).toMatch(/^trg\.harrowmark\.a4\./);
    }
  });

  it('puts the world-safe door first (the stale-load rescue uses the first door) and gives link-only doors no exit', () => {
    expect(DEEP_RUN_DEF.doors[0]!.outside).toBe(DEEP_RUN_EXIT.anchor);
    for (const def of ACT4_HARROWMARK_INTERIORS) {
      const ids = new Set(def.anchors.map((a) => a.id));
      for (const d of def.doors) {
        expect(ids.has(d.inside), `${def.id} ${d.doorId} inside`).toBe(true);
        if (d.exit !== LINK_ONLY_EXIT) expect(ids.has(d.exit), `${def.id} ${d.doorId} exit`).toBe(true);
        expect(ids.has(LINK_ONLY_EXIT)).toBe(false);
      }
    }
  });

  it('links each pair of interiors both ways, from an anchor inside to a door of the target', () => {
    for (const link of ACT4_HARROWMARK_LINKS) {
      const from = byId(link.from.interior);
      const to = byId(link.to.interior);
      expect(from.anchors.some((a) => a.id === link.from.anchor), link.id).toBe(true);
      expect(to.doors.some((d) => d.doorId === link.to.doorId), link.id).toBe(true);
    }
    const pairs = ACT4_HARROWMARK_LINKS.map((l) => `${l.from.interior}>${l.to.interior}`);
    for (const p of pairs) expect(pairs).toContain(p.split('>').reverse().join('>'));
  });

  it('locks the chamber, the Crucible, the stairs and the deep run on their quest flags, and drives the two gates by flag', () => {
    expect(ACT4_HARROWMARK_DOOR_LOCKS).toEqual({
      'council-chamber': 'story.m38.started',
      'crucible-cellars': 'story.d07.started',
      'keep-stairs': 'story.m39.started',
      'deep-run': 'story.m40.started',
    });
    expect(ACT4_HARROWMARK_FLAG_BLOCKERS).toEqual({ 'crucible.arena.gate': 'story.d07.vatValves', 'deeprun.sluice': 'story.m40.sluice' });
    // The world exit of the deep run never locks (exits never lock; it has no outside prompt either).
    expect(Object.keys(ACT4_HARROWMARK_DOOR_LOCKS)).not.toContain('deep-run-exit');
  });

  it('pins every Act 4 layout (a change here moves anchors other threads use: update deliberately)', () => {
    expect(Object.fromEntries(ACT4_HARROWMARK_INTERIORS.map((d) => [d.id, hashOf(d)]))).toMatchInlineSnapshot(`
      {
        "council-chamber": "2c9fb6e5a7ffc75d",
        "crucible-cellars": "29bb57a45c156cd8",
        "deep-run": "36cc6fd1f324e96f",
        "keep-stairs": "96fc145c3f651a9a",
      }
    `);
  });
});

describe('the Keep stairs', () => {
  it('descends three flights of 0.3 m steps to landings at 3, 6 and 9 m, never more than one step between neighbours', () => {
    expect(stairSteps(KEEP_STAIRS_DEF)).toEqual([]);
    expect(STAIR_STEP).toBeLessThanOrEqual(MAX_WALKABLE_PROP);
    expect(sunkenDepthAt(KEEP_STAIRS_DEF, 0, -2)).toBe(LANDING_DEPTH.top);
    expect(sunkenDepthAt(KEEP_STAIRS_DEF, 0, -17)).toBe(LANDING_DEPTH.one);
    expect(sunkenDepthAt(KEEP_STAIRS_DEF, 5, -36)).toBe(LANDING_DEPTH.two);
    expect(sunkenDepthAt(KEEP_STAIRS_DEF, 0, -55)).toBe(LANDING_DEPTH.foot);
  });

  it('keeps every stair and landing cell on the nav grid (stair-flagged sunken cells are not blocked)', () => {
    const l = layoutInterior(KEEP_STAIRS_DEF, () => 0);
    expect(l.nav.blocked).toEqual([]);
  });

  it('builds the barricade on landing 2 across the head of flight 3', () => {
    const b = KEEP_STAIRS_DEF.blockers.find((x) => x.id === 'stairs.barricade')!;
    expect(b.base).toBe(-LANDING_DEPTH.two);
    expect(b.startClosed).toBeFalsy();
  });
});

describe('stair-flagged sunken cells (v0.8, SunkenDef.stairs)', () => {
  const base: InteriorDef = {
    id: 'stairs-test',
    site: { x: 0, z: 0 },
    rooms: [{ id: 'r', x0: -2, z0: -10, x1: 2, z1: 2, height: 6 }],
    pillars: [],
    blockers: [],
    torches: [],
    anchors: [],
    triggers: [],
    doors: [],
    environment: COUNCIL_CHAMBER_DEF.environment,
  };
  // Four steps down from the floor, then a landing at the last step's depth.
  const steps = (rise: number) => [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, rect: { x0: -2, z0: -2 - i, x1: 2, z1: -1 - i }, depth: rise * (i + 1), stairs: true })),
    { id: 'landing', rect: { x0: -2, z0: -10, x1: 2, z1: -5 }, depth: rise * 4, stairs: true },
  ];

  it('a deep stair cell stays on the grid; the same depth without the flag is off it (shipped behaviour)', () => {
    const on = layoutInterior({ ...base, sunken: steps(0.3) }, () => 0);
    expect(on.nav.blocked).toEqual([]);
    const off = layoutInterior({ ...base, sunken: steps(0.3).map(({ stairs: _s, ...s }) => s) }, () => 0);
    expect(off.nav.blocked?.length ?? 0).toBeGreaterThan(0);
  });

  it('reports a step taller than the auto-step', () => {
    expect(stairSteps({ ...base, sunken: steps(0.3) })).toEqual([]);
    expect(stairSteps({ ...base, sunken: steps(0.6) }).length).toBeGreaterThan(0);
  });

  it('refuses a stair step with a roof', () => {
    expect(() => layoutInterior({ ...base, sunken: [{ id: 'x', rect: { x0: -1, z0: -1, x1: 1, z1: 0 }, depth: 1, roof: 0.5, stairs: true }] }, () => 0)).toThrow(/cannot have a roof/);
  });
});

describe('the Crucible Cellars', () => {
  it('has four valve sites round the arena, each with its trigger, and the arena gate built closed', () => {
    expect(CRUCIBLE_VALVES).toHaveLength(4);
    for (const v of CRUCIBLE_VALVES) {
      expect(CRUCIBLE_DEF.anchors.some((a) => a.id === `harrowmark.a4.crucible.valve.${v.n}`)).toBe(true);
      expect(CRUCIBLE_DEF.triggers.some((t) => t.id === `trg.harrowmark.a4.crucible.valve.${v.n}`)).toBe(true);
    }
    expect(CRUCIBLE_DEF.blockers.find((b) => b.id === 'crucible.arena.gate')?.startClosed).toBe(true);
  });

  it('floats clear of D02\'s Underways lattice (not only its door), by more than the wake range', () => {
    const a = layoutInterior(CRUCIBLE_DEF, heightAt).bounds;
    const b = layoutInterior(UNDERWAYS_DEF, heightAt).bounds;
    const gap = (lo1: number, hi1: number, lo2: number, hi2: number) => Math.max(0, lo2 - hi1, lo1 - hi2);
    expect(Math.hypot(gap(a.min.x, a.max.x, b.min.x, b.max.x), gap(a.min.z, a.max.z, b.min.z, b.max.z))).toBeGreaterThan(130);
  });
});

describe('the deep run', () => {
  const path = deepRunPath();
  const inside = (x: number, z: number) => Math.hypot(x - CENTER.x, z - CENTER.z) <= RING_RADIUS + 10;

  it('is deterministic: the same seed builds the same interior; another seed a different one', () => {
    expect(generateDeepRun(DEEP_RUN_SEED)).toEqual(DEEP_RUN_DEF);
    expect(deepRunPath(DEEP_RUN_SEED + 1).cells).not.toEqual(path.cells);
  });

  it('runs a main path of 650 to 750 m (plan: about 700 m; the coordinator ruled the shorter run)', () => {
    expect(path.length).toBeGreaterThanOrEqual(650);
    expect(path.length).toBeLessThanOrEqual(750);
  });

  it('walks a connected path one cell at a time and never revisits a cell', () => {
    for (let i = 1; i < path.cells.length; i++) {
      const a = path.cells[i - 1]!;
      const b = path.cells[i]!;
      expect(Math.abs(a.c - b.c) + Math.abs(a.r - b.r)).toBe(1);
    }
    expect(new Set(path.cells.map((c) => `${c.c},${c.r}`)).size).toBe(path.cells.length);
  });

  it('places the features in path order: dens, junctions, the sluice, the flood, the patrol, the cart', () => {
    const F = DEEP_RUN_FEATURES;
    expect(F.den1 < F.junction1 && F.junction1 < F.den2 && F.den2 < F.sluice && F.sluice < F.floodFrom).toBe(true);
    expect(F.floodFrom < F.junction2 && F.junction2 < F.floodTo && F.floodTo < F.patrol && F.patrol < F.junction3 && F.junction3 < F.cart).toBe(true);
    const ids = DEEP_RUN_DEF.anchors.map((a) => a.id);
    for (const k of [1, 2, 3]) expect(ids).toContain(`harrowmark.a4.deeprun.junction.${k}`);
    for (const k of [1, 2, 3]) expect(ids).toContain(`harrowmark.a4.deeprun.checkpoint.${k}`);
    expect(DEEP_RUN_DEF.sunken!.every((s) => s.depth <= MAX_WALKABLE_PROP)).toBe(true);
  });

  it('floats entirely outside the ring wall, with its exit room over the world exit', () => {
    const l = layoutInterior(DEEP_RUN_DEF, heightAt);
    for (const [x, z] of [[l.bounds.min.x, l.bounds.min.z], [l.bounds.max.x, l.bounds.min.z], [l.bounds.min.x, l.bounds.max.z], [l.bounds.max.x, l.bounds.max.z]]) {
      expect(inside(x!, z!)).toBe(false);
    }
    const arrive = l.anchors.find((a) => a.id === 'harrowmark.a4.deeprun.arrive')!;
    expect(Math.hypot(arrive.position.x - DEEP_RUN_EXIT.x, arrive.position.z - DEEP_RUN_EXIT.z)).toBeLessThan(0.01);
    expect(inside(DEEP_RUN_EXIT.x, DEEP_RUN_EXIT.z)).toBe(false);
  });

  it('keeps every escort route node on walkable floor', () => {
    const l = layoutInterior(DEEP_RUN_DEF, heightAt);
    const route = l.anchors.filter((a) => a.id.startsWith('harrowmark.a4.deeprun.route.'));
    expect(route.length).toBeGreaterThan(30);
    for (const a of route) expect(standsIn(l, a.position), a.id).toBe(true);
  });
});
