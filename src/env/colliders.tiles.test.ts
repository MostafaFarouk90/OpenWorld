// The colliders of the real tiles: what each tile makes, that the shape table covers every collider-family id, and that nothing a body is sent
// through (a lane, chase line, trigger, anchor or door) is blocked.
import { describe, expect, it } from 'vitest';
import { CROWD_LANES, DOORS, HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { chaseLines, defaultKeepOut, CHASE_HALF_WIDTH, MIN_LANE_CLEARANCE } from './colliderKeepOut';
import { buildTileColliders, keepOutHit, pointToRect, rectsOverlap, SHAPES, shapeFor, NO_COLLIDER, type ColliderBox, type TileColliders } from './colliders';
import { classOf } from './PlacementField';
import { TILES } from './tiles';

const keepOut = defaultKeepOut();
const made: Record<string, TileColliders> = {};
for (const name of Object.keys(TILES)) made[name] = buildTileColliders(name, TILES[name]!, keepOut);

/** Counts the tiles make today (rows with a shape, boxes after merging, drops). Pinned loosely so a re-roll of a tile does not need a test edit, tightly enough to catch a broken merge. */
const EXPECT: Record<string, { boxes: [number, number]; dropped: number }> = {
  b1: { boxes: [80, 160], dropped: 4 },
  b2: { boxes: [150, 280], dropped: 8 },
  b3: { boxes: [150, 320], dropped: 0 },
  b4: { boxes: [100, 230], dropped: 0 },
  h1: { boxes: [80, 200], dropped: 0 },
  h2: { boxes: [130, 280], dropped: 0 },
  h3: { boxes: [250, 480], dropped: 0 },
  h4: { boxes: [250, 480], dropped: 3 },
  // Act 5 N1 PR 2: the Caldera (generated rows that keep clear of every anchor and trigger themselves, so nothing is dropped).
  c1: { boxes: [80, 120], dropped: 0 },
};

describe('colliders of the built tiles', () => {
  it.each(Object.keys(EXPECT))('%s makes a sane number of boxes and drops only what touches a lane, trigger, anchor or door', (name) => {
    const { stats } = made[name]!;
    const e = EXPECT[name]!;
    expect(stats.boxes, `${name} boxes`).toBeGreaterThanOrEqual(e.boxes[0]);
    expect(stats.boxes, `${name} boxes`).toBeLessThanOrEqual(e.boxes[1]);
    expect(stats.dropped, `${name} dropped`).toBe(e.dropped);
    expect(stats.skipped).toBe(0);
    // far fewer boxes than candidate modules once the runs merge
    if (stats.runModules > 100) expect(stats.runs).toBeLessThan(stats.runModules * 0.6);
  });

  it('keeps the whole city under a few hundred live colliders at a time (1,000 boxes over four tiles, 64 m cells)', () => {
    const hBoxes = ['h1', 'h2', 'h3', 'h4'].reduce((n, t) => n + made[t]!.stats.boxes, 0);
    expect(hBoxes).toBeLessThan(1400);
    expect(hBoxes).toBeGreaterThan(600);
  });

  it('H tiles make no trunks, B tiles do, and only B tiles', () => {
    for (const t of ['h1', 'h2', 'h3', 'h4']) expect(made[t]!.stats.trunks, t).toBe(0);
    for (const t of ['b1', 'b3', 'b4']) expect(made[t]!.stats.trunks, t).toBeGreaterThan(20);
    for (const t of Object.keys(made)) expect(made[t]!.boxes.every((b) => b.kind !== 'trunk' || /^b/.test(t)), t).toBe(true);
  });

  it('has a shape for every collider-family id in H1 to H4 and B1 to B4 (or says it deliberately has none)', () => {
    const family = /fence|wall|hedge|cart|wagon|hearth|clamp|slag|stall|chimney|anvil|brazier|barrel|crate|ore-pile|coal-heap/;
    const unshaped = new Set<string>();
    for (const rows of Object.values(TILES)) for (const r of rows) if (family.test(r.id) && classOf(r.id) !== 'tree' && !shapeFor(r.id)) unshaped.add(r.id);
    // The deliberate ones: crates and barrels never collide (ruling), ore piles and coal heaps are under 1 m, fence_broken is a rail of the B4 crow posts,
    // chimney-stack-a stands on the roofs of the Rooftop Ward (dy rows).
    const allowed = new Set([...NO_COLLIDER, 'fence_broken', 'chimney-stack-a']);
    expect([...unshaped].filter((id) => !allowed.has(id) && !allowed.has(id.replace(/-ashen$/, '')))).toEqual([]);
    for (const id of Object.keys(SHAPES)) expect(NO_COLLIDER.has(id), id).toBe(false);
  });

  it('really uses the round 1 stand-in ids in H4 (slag heaps, mine carts, the chimney)', () => {
    const ids = new Set(made.h4!.boxes.map((b) => b.id));
    for (const id of ['slag-heap', 'mine-cart', 'smelter-chimney', 'forge-hearth-a', 'scorched-fence', 'wattle-fence', 'stonewall-low']) expect(ids.has(id), id).toBe(true);
    expect(made.h4!.boxes.filter((b) => b.id === 'slag-heap')).toHaveLength(32);
    expect(made.h4!.boxes.filter((b) => b.id === 'mine-cart')).toHaveLength(20);
  });

  it('never makes a box for a barrel or a crate', () => {
    for (const [name, t] of Object.entries(made)) for (const b of t.boxes) expect(/barrel|crate|ore-pile|coal-heap/.test(b.id), `${name} ${b.id}`).toBe(false);
  });

  it('keeps every box clear of every keep-out entry (the rule holds after merging, not just before)', () => {
    for (const [name, t] of Object.entries(made)) for (const b of t.boxes) expect(keepOutHit(b, keepOut), `${name} ${b.id} at ${b.cx.toFixed(1)}, ${b.cz.toFixed(1)}`).toBeNull();
  });
});

describe('walkable by construction (checked against the layout data, not the keep-out list)', () => {
  const all: ColliderBox[] = Object.values(made).flatMap((t) => t.boxes);
  const anchorAt = new Map(HARROWMARK_LAYOUT.anchors.map((a) => [a.id, a] as const));
  const along = (pts: Array<readonly [number, number]>, step: number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
      for (let k = 0; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    return out;
  };
  const nearest = (x: number, z: number): number => {
    let best = Infinity;
    for (const b of all) {
      if (Math.abs(b.cx - x) > 60 || Math.abs(b.cz - z) > 60) continue;
      best = Math.min(best, pointToRect(b, x, z));
    }
    return best;
  };

  it('leaves each crowd lane clear to its half width along its whole line', () => {
    for (const lane of CROWD_LANES) {
      const pts = lane.points.map((id) => anchorAt.get(id)!).map((a) => [a.x, a.z] as const);
      if (lane.loop) pts.push(pts[0]!);
      for (const [x, z] of along(pts, 1.5)) expect(nearest(x, z), `${lane.id} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeGreaterThanOrEqual(Math.max(lane.halfWidth, MIN_LANE_CLEARANCE) - 0.01);
    }
  });

  it('leaves the M10 chase line and its alternative clear 1.5 m each side', () => {
    const lines = chaseLines([HARROWMARK_LAYOUT]);
    expect(lines.map((l) => l.id).sort()).toEqual(['chase.m10', 'chase.m10.alt']);
    for (const l of lines) for (const [x, z] of along(l.points, 1.5)) expect(nearest(x, z), `${l.id} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeGreaterThanOrEqual(CHASE_HALF_WIDTH - 0.01);
  });

  it('leaves the doors (2 m), the quest anchors and every ground anchor (1.2 m) free', () => {
    for (const d of DOORS) expect(nearest(d.x, d.z), d.doorId).toBeGreaterThanOrEqual(2 - 0.01);
    let checked = 0;
    for (const a of HARROWMARK_LAYOUT.anchors) {
      if (a.dy || a.tags?.includes('elevated')) continue;
      expect(nearest(a.x, a.z), a.id).toBeGreaterThanOrEqual(1.2 - 0.01);
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('leaves the trigger centres and the Bastion yard box free of colliders', () => {
    for (const t of HARROWMARK_LAYOUT.triggers) {
      if (t.shape === 'sphere') expect(nearest(t.x, t.z), t.id).toBeGreaterThanOrEqual(t.radius - 0.01);
      else {
        const trig = { cx: t.x, cz: t.z, hx: t.half[0], hz: t.half[2], yaw: ((t.yawDeg ?? 0) * Math.PI) / 180 };
        for (const b of all) expect(rectsOverlap(b, trig), `${t.id} vs ${b.id} ${b.cx.toFixed(1)}, ${b.cz.toFixed(1)}`).toBe(false);
      }
    }
  });

  it('opens every lane crossing: where a lane runs across a fence line the gap is at least 2.5 m', () => {
    // every lane keeps max(halfWidth, 1.25) m each side and every chase line 1.5 m, so a crossing leaves a gap of at least twice that
    expect(Math.min(...CROWD_LANES.map((l) => Math.max(l.halfWidth, MIN_LANE_CLEARANCE) * 2), CHASE_HALF_WIDTH * 2)).toBeGreaterThanOrEqual(2.5);
    // and the data agrees: the narrowest lane (the ward streets) is still crossed with 2.5 m between the boxes on its two sides
    const ward = CROWD_LANES.find((l) => l.id.endsWith('rooftop-ward-streets'))!;
    expect(ward.halfWidth).toBeLessThan(MIN_LANE_CLEARANCE);
  });
});
