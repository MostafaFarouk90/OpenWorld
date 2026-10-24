// The Greyfen dive interiors' soft-lock guards (plans/act3-K3.md section 4, revision 2 items 3, 5 and 6).
import { describe, expect, it } from 'vitest';
import { NavGrid } from '../nav/NavGrid';
import { findPath } from '../nav/pathfind';
import { layoutInterior, standsIn, type InteriorLayout } from '../interiors/layout';
import type { InteriorDef } from '../interiors/types';
import { lintDiveRoute, routeLength, distanceAlong } from '../water/airPockets';
import { AIR_POCKET_MAX_SPACING, DIVE_TUNING } from '../water/types';
import { CHAPEL_DEF, CHAPEL_ROUTE_LOCAL } from './chapelInterior';
import { ARENA, ARENA_DROP, ARENA_GATE, DEEPS_DEF, DEEPS_ROUTE_A_LOCAL, DEEPS_ROUTE_B_LOCAL, SLUICE_FLAGS, SLUICE_GATES } from './deepsInterior';
import { HUT_DEF } from './hutInterior';
import { GREYFEN_DOOR_LOCKS, GREYFEN_INTERIORS } from './interiors';
import { POOL_DEPTH, STEP } from './interiorKit';
import { INTERIOR_FOOTPRINTS, INTERIOR_PADS, PAD_MARGIN } from './sites';
import { reachModel, type LocalWater } from './testing/reach';
import { CHAPEL_VOLUMES, DEEPS_VOLUMES, greyfenWater } from './water';

const flat = () => 7;
const layouts = new Map(GREYFEN_INTERIORS.map((d) => [d.id, layoutInterior(d, flat)]));
const L = (d: InteriorDef): InteriorLayout => layouts.get(d.id)!;
const anchor = (d: InteriorDef, id: string) => {
  const a = d.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const toWater = (v: readonly LocalWater[]) => v;
/** The three sluice states (flags set) and which gates are open in each. */
const STATES = [
  { name: 'no sluice', flags: [] as string[] },
  { name: 'sluice 1', flags: [SLUICE_FLAGS[0]] },
  { name: 'sluice 2', flags: [SLUICE_FLAGS[0], SLUICE_FLAGS[1]] },
];
const closedFor = (flags: readonly string[], drop = true): Set<string> => {
  const s = new Set<string>();
  if (!flags.includes(SLUICE_FLAGS[0])) s.add(SLUICE_GATES[0]);
  if (!flags.includes(SLUICE_FLAGS[1])) s.add(SLUICE_GATES[1]);
  if (drop) s.add(ARENA_DROP);
  return s;
};

describe('the Greyfen interiors', () => {
  it('ship three interiors, two door locks on the quests\' started flags and two exit-only far doors', () => {
    expect(GREYFEN_INTERIORS.map((d) => d.id)).toEqual(['greyfen-hut', 'greyfen-chapel', 'greyfen-deeps']);
    expect(GREYFEN_DOOR_LOCKS).toEqual({ 'greyfen-chapel': 'story.r13.started', 'greyfen-deeps': 'story.d05.started' });
    const far = GREYFEN_INTERIORS.flatMap((d) => d.doors).filter((d) => d.outsideInteractable === false);
    expect(far.map((d) => d.doorId).sort()).toEqual(['greyfen-chapel-tower', 'greyfen-deeps-arena']);
    expect(far.map((d) => d.outside).sort()).toEqual(['greyfen.chapel.tower-exit', 'greyfen.deeps.arena-exit']);
  });

  it('keeps each footprint equal to its declared box and inside its pad with the margin', () => {
    const cases = [
      [HUT_DEF, INTERIOR_FOOTPRINTS.hut, INTERIOR_PADS.hut],
      [CHAPEL_DEF, INTERIOR_FOOTPRINTS.chapel, INTERIOR_PADS.chapel],
      [DEEPS_DEF, INTERIOR_FOOTPRINTS.deeps, INTERIOR_PADS.deeps],
    ] as const;
    for (const [def, fp, pad] of cases) {
      const box = def.rooms.reduce(
        (r, q) => ({ x0: Math.min(r.x0, q.x0), z0: Math.min(r.z0, q.z0), x1: Math.max(r.x1, q.x1), z1: Math.max(r.z1, q.z1) }),
        { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity },
      );
      expect(box, def.id).toEqual(fp);
      const wx0 = def.site.x + fp.x0;
      const wx1 = def.site.x + fp.x1;
      const wz0 = def.site.z + fp.z0;
      const wz1 = def.site.z + fp.z1;
      expect(wx0, def.id).toBeGreaterThanOrEqual(pad.x - pad.w / 2 + PAD_MARGIN);
      expect(wx1, def.id).toBeLessThanOrEqual(pad.x + pad.w / 2 - PAD_MARGIN);
      expect(wz0, def.id).toBeGreaterThanOrEqual(pad.z - pad.d / 2 + PAD_MARGIN);
      expect(wz1, def.id).toBeLessThanOrEqual(pad.z + pad.d / 2 - PAD_MARGIN);
    }
  });

  it('builds every pool stair from steps of exactly one auto-step', () => {
    for (const def of [CHAPEL_DEF, DEEPS_DEF]) {
      const stairs = (def.sunken ?? []).filter((s) => s.id.startsWith('stair.'));
      const groups = new Map<string, number[]>();
      for (const s of stairs) {
        const key = s.id.slice(0, s.id.lastIndexOf('.'));
        groups.set(key, [...(groups.get(key) ?? []), s.depth]);
      }
      for (const [key, depths] of groups) {
        expect(depths[0], key).toBeCloseTo(STEP);
        for (let i = 1; i < depths.length; i++) expect(depths[i]! - depths[i - 1]!, key).toBeCloseTo(STEP);
        expect(POOL_DEPTH - depths[depths.length - 1]!, key).toBeCloseTo(STEP);
      }
    }
  });
});

describe('the dive routes', () => {
  const routes = [
    { def: CHAPEL_DEF, r: CHAPEL_ROUTE_LOCAL },
    { def: DEEPS_DEF, r: DEEPS_ROUTE_A_LOCAL },
    { def: DEEPS_DEF, r: DEEPS_ROUTE_B_LOCAL },
  ];

  it('pass the 40 m air-pocket lint (world space) with four dive segments in each quest', () => {
    const w = greyfenWater((d) => layoutInterior(d, flat));
    for (const r of w.routes) expect(lintDiveRoute(r), r.id).toEqual([]);
    const segments = (id: string) => w.routes.filter((r) => r.id.startsWith(id)).reduce((n, r) => n + r.airPockets.length, 0);
    // Each pocket closes one segment (the last one is the route's exit).
    expect(segments('dive.greyfen.r13')).toBe(4);
    expect(segments('dive.greyfen.d05')).toBe(4);
  });

  it('fit every segment in the breath at K7\'s real swim speed, with at least 10 s spare', () => {
    for (const { r } of routes) {
      const stops = [0, ...r.airPockets.map((p) => distanceAlong(r.points, p.at)), routeLength(r.points)];
      for (let i = 1; i < stops.length; i++) {
        const metres = stops[i]! - stops[i - 1]!;
        expect(metres, `${r.id} ${i}`).toBeLessThanOrEqual(AIR_POCKET_MAX_SPACING);
        expect(metres / DIVE_TUNING.swimSpeed, `${r.id} ${i}`).toBeLessThanOrEqual(DIVE_TUNING.breathSeconds - 10);
      }
    }
  });

  it('give every pocket a dry stand on a ledge within 8 m of where the diver surfaces, and the route an entry stand', () => {
    for (const { def, r } of routes) {
      const l = L(def);
      const world = (p: { x: number; y: number; z: number }) => ({ x: l.origin.x + p.x, y: l.floorY + p.y, z: l.origin.z + p.z });
      expect(standsIn(l, world(r.entryStand)), `${r.id} entry`).toBe(true);
      for (const p of r.airPockets) {
        expect(standsIn(l, world(p.stand)), p.id).toBe(true);
        expect(p.stand.y, p.id).toBe(0);
        expect(Math.hypot(p.stand.x - p.at.x, p.stand.z - p.at.z), p.id).toBeLessThanOrEqual(8);
        // The pocket anchor (where K12's beats and a load land) is the stand.
        const a = anchor(def, p.id);
        expect([a.x, a.z], p.id).toEqual([p.stand.x, p.stand.z]);
      }
    }
  });

  it('keep every stand on a dry ledge, its feet above every dive and deep surface over it', () => {
    // K7 lints stands against the volumes by height (the chapel's one dive box spans its ledges in x, z): the feet must be
    // over the water's surface, on a floor at the ledge level, not over the pool.
    for (const def of [CHAPEL_DEF, DEEPS_DEF]) {
      const m = reachModel(def, {});
      const routes = def === CHAPEL_DEF ? [CHAPEL_ROUTE_LOCAL] : [DEEPS_ROUTE_A_LOCAL, DEEPS_ROUTE_B_LOCAL];
      const vols = def === CHAPEL_DEF ? CHAPEL_VOLUMES : DEEPS_VOLUMES;
      for (const r of routes) {
        for (const s of [r.entryStand, ...r.airPockets.map((p) => p.stand)]) {
          expect(m.floorAt(s.x, s.z), `${r.id} stand (${s.x}, ${s.z})`).toBe(0);
          for (const v of vols.filter((x) => x.kind !== 'wade')) expect(s.y - v.surface, `${r.id} over ${v.id}`).toBeGreaterThanOrEqual(0.25);
        }
      }
    }
  });
});

describe('the Sunken Chapel (R13)', () => {
  const entry = anchor(CHAPEL_DEF, 'greyfen.chapel.entry');
  const altar = anchor(CHAPEL_DEF, 'greyfen.r13.altar');
  const exits = [anchor(CHAPEL_DEF, 'greyfen.chapel.exit'), anchor(CHAPEL_DEF, 'greyfen.chapel.tower.exit')];

  it('takes a diver from the porch through the nave to the altar, and every reachable spot leads to an exit', () => {
    const m = reachModel(CHAPEL_DEF, { water: toWater(CHAPEL_VOLUMES) });
    const from = m.standNode(entry.x, entry.z);
    const reached = m.reach(from);
    expect(reached.has(m.standNode(altar.x, altar.z))).toBe(true);
    for (const p of CHAPEL_ROUTE_LOCAL.airPockets) expect(reached.has(m.standNode(p.stand.x, p.stand.z)), p.id).toBe(true);
    const out = m.canReachAny(exits.map((e) => m.standNode(e.x, e.z)));
    for (const node of reached) expect(out.has(node), `trapped at node ${node}`).toBe(true);
  });

  it('has no dry shortcut over the nave: with the water in, the altar needs the dive', () => {
    // The nave tunnels are sealed above their roofs, so the only way on is through the water.
    const m = reachModel(CHAPEL_DEF, { water: toWater(CHAPEL_VOLUMES) });
    const walkOnly = m.reach(m.standNode(entry.x, entry.z));
    const swims = [...walkOnly].filter((n) => (n & 1) === 1);
    expect(swims.length).toBeGreaterThan(0);
    const porch = new Set([...walkOnly].filter((n) => (n & 1) === 0));
    const ledgeOnly = reachModel(CHAPEL_DEF, { water: toWater(CHAPEL_VOLUMES).map((v) => ({ ...v, kind: 'deep' as const })) });
    const dry = ledgeOnly.reach(ledgeOnly.standNode(entry.x, entry.z));
    expect(dry.has(ledgeOnly.standNode(altar.x, altar.z))).toBe(false);
    expect(porch.size).toBeGreaterThan(0);
  });

  it('without the water service (inert, doors locked) the halls trap nobody: every spot still leads to an exit', () => {
    for (const def of [CHAPEL_DEF, DEEPS_DEF]) {
      const m = reachModel(def, { closed: new Set(def.blockers.filter((b) => b.startClosed).map((b) => b.id)) });
      const start = anchor(def, def.doors[0]!.inside);
      const reached = m.reach(m.standNode(start.x, start.z));
      const out = m.canReachAny(def.doors.map((d) => anchor(def, d.exit)).map((e) => m.standNode(e.x, e.z)));
      for (const n of reached) expect(out.has(n), `${def.id}: trapped at node ${n}`).toBe(true);
    }
  });

  it('lets a diver climb out of every pocket pool onto its ledge', () => {
    const m = reachModel(CHAPEL_DEF, { water: toWater(CHAPEL_VOLUMES) });
    for (const p of CHAPEL_ROUTE_LOCAL.airPockets) {
      const swim = m.swimNode(p.at.x, p.at.z);
      expect(swim, p.id).toBeGreaterThanOrEqual(0);
      expect(m.reach(swim).has(m.standNode(p.stand.x, p.stand.z)), p.id).toBe(true);
    }
  });
});

describe('the Mirewater Deeps (D05)', () => {
  const entry = anchor(DEEPS_DEF, 'greyfen.deeps.entry');
  const exits = [anchor(DEEPS_DEF, 'greyfen.deeps.exit'), anchor(DEEPS_DEF, 'greyfen.d05.arena.exit')];
  const node = (m: ReturnType<typeof reachModel>, id: string) => {
    const a = anchor(DEEPS_DEF, id);
    return m.standNode(a.x, a.z);
  };

  it('registers each volume set once and swaps it only by flag', () => {
    const ids = DEEPS_VOLUMES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    const active = (flags: string[]) => DEEPS_VOLUMES.filter((v) => !v.activeWhen || (v.activeWhen.all ?? []).every((f) => flags.includes(f)) && !(v.activeWhen.none ?? []).some((f) => flags.includes(f))).map((v) => v.id);
    expect(active([]).filter((id) => id.includes('.a.') || id.includes('.b.'))).toEqual(['water.greyfen.d05.a.high', 'water.greyfen.d05.b.high']);
    expect(active([SLUICE_FLAGS[0]]).filter((id) => id.includes('.a.') || id.includes('.b.'))).toEqual(['water.greyfen.d05.a.low', 'water.greyfen.d05.b.high']);
    expect(active([...SLUICE_FLAGS]).filter((id) => id.includes('.a.') || id.includes('.b.'))).toEqual(['water.greyfen.d05.a.low', 'water.greyfen.d05.b.low']);
  });

  for (const st of STATES) {
    it(`${st.name}: every reachable spot leads to an exit, and each pocket's stand is a ledge`, () => {
      const m = reachModel(DEEPS_DEF, { flags: st.flags, water: toWater(DEEPS_VOLUMES), closed: closedFor(st.flags) });
      const reached = m.reach(m.standNode(entry.x, entry.z));
      const out = m.canReachAny(exits.map((e) => m.standNode(e.x, e.z)));
      for (const n of reached) expect(out.has(n), `${st.name}: trapped at node ${n}`).toBe(true);
      // A load under water lands on the saved pocket's stand, from this state's route or an earlier state's (the sluice flags
      // only ever go on, so route B's pockets exist from sluice 1): a ledge that leads out.
      const saved = st.flags.length === 0 ? DEEPS_ROUTE_A_LOCAL.airPockets : [...DEEPS_ROUTE_A_LOCAL.airPockets, ...DEEPS_ROUTE_B_LOCAL.airPockets];
      for (const p of saved) {
        const n = m.standNode(p.stand.x, p.stand.z);
        expect(n, p.id).toBeGreaterThanOrEqual(0);
        expect(out.has(n), `${st.name}: ${p.id} leads to an exit`).toBe(true);
      }
    });
  }

  it('a sluice opening mid-dive leaves the diver on a floor or still swimming, never cut off from an exit', () => {
    for (let k = 0; k + 1 < STATES.length; k++) {
      const before = reachModel(DEEPS_DEF, { flags: STATES[k]!.flags, water: toWater(DEEPS_VOLUMES), closed: closedFor(STATES[k]!.flags) });
      // The gate opens with the water: the later state's gates.
      const after = reachModel(DEEPS_DEF, { flags: STATES[k + 1]!.flags, water: toWater(DEEPS_VOLUMES), closed: closedFor(STATES[k + 1]!.flags) });
      const out = after.canReachAny(exits.map((e) => after.standNode(e.x, e.z)));
      let checked = 0;
      for (let x = -48; x < 42; x += 1) {
        for (let z = -76; z < 1.5; z += 1) {
          if (before.swimNode(x + 0.25, z + 0.25) < 0) continue;
          checked++;
          const n = after.standNode(x + 0.25, z + 0.25);
          const w = after.swimNode(x + 0.25, z + 0.25);
          expect(n >= 0 || w >= 0, `${STATES[k + 1]!.name} at (${x}, ${z})`).toBe(true);
          expect(out.has(n >= 0 ? n : w), `${STATES[k + 1]!.name} at (${x}, ${z}) leads out`).toBe(true);
        }
      }
      expect(checked).toBeGreaterThan(50);
    }
  });

  it('no sluice: section A reaches sluice room 1 by diving; gate 1 keeps section B and the arena shut', () => {
    const m = reachModel(DEEPS_DEF, { water: toWater(DEEPS_VOLUMES), closed: closedFor([]) });
    const reached = m.reach(m.standNode(entry.x, entry.z));
    expect(reached.has(node(m, 'greyfen.d05.pocket.2'))).toBe(true);
    expect(reached.has(node(m, 'greyfen.d05.sluice.1'))).toBe(true);
    expect(reached.has(node(m, 'greyfen.d05.pocket.3'))).toBe(false);
    expect(reached.has(node(m, 'greyfen.d05.arena.centre'))).toBe(false);
  });

  it('sluice 1: section A wades, section B dives to sluice room 2; gate 2 keeps the arena shut', () => {
    const f = [SLUICE_FLAGS[0]];
    const m = reachModel(DEEPS_DEF, { flags: f, water: toWater(DEEPS_VOLUMES), closed: closedFor(f) });
    const reached = m.reach(m.standNode(entry.x, entry.z));
    expect(reached.has(node(m, 'greyfen.d05.pocket.4'))).toBe(true);
    expect(reached.has(node(m, 'greyfen.d05.sluice.2'))).toBe(true);
    expect(reached.has(node(m, 'greyfen.d05.arena.centre'))).toBe(false);
  });

  for (const drop of [true, false]) {
    it(`sluice 2: reaches every arena walkway, rack and both exits with the drop crossing ${drop ? 'in place' : 'fallen'}`, () => {
      const f = [...SLUICE_FLAGS];
      const m = reachModel(DEEPS_DEF, { flags: f, water: toWater(DEEPS_VOLUMES), closed: closedFor(f, drop) });
      const reached = m.reach(m.standNode(entry.x, entry.z));
      const ids = DEEPS_DEF.anchors.map((a) => a.id).filter((id) => /^greyfen\.d05\.arena\.(walkway|rack|beach|centre|player|door)/.test(id));
      for (const id of ids) expect(reached.has(node(m, id)), id).toBe(true);
      for (const e of exits) expect(reached.has(m.standNode(e.x, e.z))).toBe(true);
      const out = m.canReachAny(exits.map((e) => m.standNode(e.x, e.z)));
      for (const n of reached) expect(out.has(n), `trapped at node ${n}`).toBe(true);
    });
  }

  it('keeps every arena surfacing point over a deep channel and every beach point on a walkway next to one', () => {
    const inAny = (x: number, z: number) => ARENA.channels.some((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1);
    for (const a of DEEPS_DEF.anchors.filter((x) => x.id.includes('.arena.surface.'))) expect(inAny(a.x, a.z), a.id).toBe(true);
    for (const a of DEEPS_DEF.anchors.filter((x) => x.id.includes('.arena.beach.'))) {
      expect(inAny(a.x, a.z), a.id).toBe(false);
      const near = [-2, 2].some((d) => inAny(a.x + d, a.z) || inAny(a.x, a.z + d));
      expect(near, a.id).toBe(true);
    }
  });

  it('paths companions (the nav grid) to every walkway, rack and exit with the drop crossing in place and fallen', () => {
    const l = L(DEEPS_DEF);
    const w = (a: { x: number; z: number }) => ({ x: l.origin.x + a.x, y: l.floorY, z: l.origin.z + a.z });
    for (const dropClosed of [true, false]) {
      const grid = new NavGrid(l.nav);
      grid.setBlocker(SLUICE_GATES[0], false);
      grid.setBlocker(SLUICE_GATES[1], false);
      grid.setBlocker(ARENA_GATE, false);
      grid.setBlocker(ARENA_DROP, dropClosed);
      // The drop crossing is floor (a bridge) only while it is in place.
      const d = ARENA.crossings.drop;
      const o = L(DEEPS_DEF).origin;
      expect(grid.isWalkable(grid.cellIndex(o.x + (d.x0 + d.x1) / 2, o.z + (d.z0 + d.z1) / 2)), `drop ${dropClosed}`).toBe(dropClosed);
      expect(standsIn(L(DEEPS_DEF), { x: o.x + (d.x0 + d.x1) / 2, y: L(DEEPS_DEF).floorY, z: o.z + (d.z0 + d.z1) / 2 })).toBe(true);
      const from = w(anchor(DEEPS_DEF, 'greyfen.d05.arena.door'));
      for (const id of DEEPS_DEF.anchors.map((a) => a.id).filter((x) => /arena\.(walkway|rack|exit)/.test(x))) {
        // findPath ends at the nearest reachable cell when the goal is cut off, so the end must be the goal itself.
        const goal = w(anchor(DEEPS_DEF, id));
        const path = findPath(grid, from, goal, 0.4);
        const end = path[path.length - 1];
        expect(end && Math.hypot(end.x - goal.x, end.z - goal.z), `${id} drop ${dropClosed}`).toBeLessThan(0.75);
      }
    }
  });

  it('keeps every leech and shambler spawn on a ledge and at least 25 m from both exits', () => {
    for (const def of [CHAPEL_DEF, DEEPS_DEF]) {
      const exitsOf = def.doors.map((d) => anchor(def, d.exit));
      const m = reachModel(def, {});
      for (const a of def.anchors.filter((x) => x.id.startsWith('greyfen.spawn.'))) {
        expect(m.floorAt(a.x, a.z), a.id).toBe(0);
        for (const e of exitsOf) expect(Math.hypot(a.x - e.x, a.z - e.z), `${a.id} to ${e.id}`).toBeGreaterThanOrEqual(25);
      }
    }
  });
});
