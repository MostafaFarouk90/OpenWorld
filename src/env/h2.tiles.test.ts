// Environment pass H2: main street and market (core x 8440..9240, z 1440..1960; H1 owns the z 1440 edge, H4 the x 8440 edge, H3 z 1960 up).
import { describe, expect, it } from 'vitest';
import { CHASE_M10, CROWD_LANES, HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { pointInFootprint } from '../region/geometry';
import { H2_SPLAT_ZONES } from '../terrain/shape/splatZones.h2';
import { classOf } from './PlacementField';
import { isPatch } from './patches';
import { resolveModel } from './resolve';
import { TILES } from './tiles';

const all = TILES.h2!;
const isGround = (id: string): boolean => /^(grass|flower)/.test(id);
const solids = HARROWMARK_LAYOUT.structures.filter((s) => s.mode !== 'open');
const anchorById = (id: string): { x: number; z: number } => HARROWMARK_LAYOUT.anchors.find((a) => a.id === id)!;
const segDist = (a: readonly [number, number], b: readonly [number, number], x: number, z: number): number => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
};
const laneDist = (lane: (typeof CROWD_LANES)[number], x: number, z: number): number => {
  const pts = lane.points.map((id) => anchorById(id)).map((a) => [a.x, a.z] as const);
  let best = Infinity;
  const n = lane.loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) best = Math.min(best, segDist(pts[i]!, pts[(i + 1) % pts.length]!, x, z));
  return best;
};

describe('H2 placements', () => {
  it('is registered with about 9.2k core rows plus the dressing', () => {
    expect(all.length).toBeGreaterThan(9000);
    expect(all.length).toBeLessThan(10600);
  });

  it('dresses every class, not only the hedges', () => {
    const by: Record<string, number> = {};
    for (const r of all) by[classOf(r.id)] = (by[classOf(r.id)] ?? 0) + 1;
    for (const c of ['tree', 'bush', 'rock', 'wood', 'ground', 'prop', 'hedge']) expect(by[c] ?? 0, c).toBeGreaterThan(5);
    expect(by.ground).toBeGreaterThan(5000);
    expect(by.tree).toBeGreaterThan(400);
  });

  it('resolves every id to a model: no placeholder box is left', () => {
    const boxes = [...new Set(all.map((r) => r.id))].filter((id) => !isPatch(id) && resolveModel(id).source === 'placeholder');
    expect(boxes).toEqual([]);
  });

  it('prefers the generated models: the ids the sheet added are real glbs, not stand-ins', () => {
    for (const id of ['fruit-tree-a', 'fruit-tree-b', 'planter-box-a', 'dye-vat-a', 'keg-a', 'crates-stacked-a', 'cart-goods-a', 'cottage-thatch-a', 'stable-a', 'barn-a']) {
      expect(resolveModel(id).source, id).toBe('env');
    }
  });

  it('owns only its core: no row in the band, none carrying dy', () => {
    for (const r of all) {
      expect(r.x, r.id).toBeGreaterThanOrEqual(8440);
      expect(r.x, r.id).toBeLessThanOrEqual(9240);
      expect(r.z, r.id).toBeGreaterThanOrEqual(1440);
      expect(r.z, r.id).toBeLessThanOrEqual(1960);
      expect(r.dy, r.id).toBeUndefined();
    }
  });

  it('does not double up with H1, H3 or H4 across the seams', () => {
    const key = (r: { x: number; z: number }): string => `${r.x.toFixed(1)},${r.z.toFixed(1)}`;
    const mine = new Set(all.map(key));
    for (const other of ['h1', 'h3'] as const) for (const r of TILES[other]!) expect(mine.has(key(r)), `${other} ${r.id} ${key(r)}`).toBe(false);
  });

  it('keeps every row out of the solid footprints', () => {
    for (const r of all) expect(solids.find((s) => pointInFootprint(s, r.x, r.z, 0.4))?.id, `${r.id} ${r.x},${r.z}`).toBeUndefined();
  });

  it('keeps the props off the anchors, the crowd lanes (to half width plus 0.8) and the M10 chase line', () => {
    const props = all.filter((r) => !isGround(r.id) && !/^fern/.test(r.id));
    for (const a of HARROWMARK_LAYOUT.anchors) {
      if (a.x < 8420 || a.x > 9260 || a.z < 1420 || a.z > 1980) continue;
      const hit = props.find((r) => Math.hypot(r.x - a.x, r.z - a.z) < 1);
      expect(hit && `${hit.id} on ${a.id}`).toBeUndefined();
    }
    // Small props and lamps may use the outer 2 m of the corridor margin (the generator's rule), so test the lane half width itself.
    for (const lane of CROWD_LANES) {
      for (const r of props) {
        if (/^(hedge|wattle|picket|stonewall|fruit|oak|birch|elm|bench|barn|cottage|stable)/.test(r.id) && laneDist(lane, r.x, r.z) < lane.halfWidth) {
          expect.fail(`${r.id} ${r.x},${r.z} inside lane ${lane.id}`);
        }
      }
    }
    const chase = CHASE_M10.filter((n) => !n.roof);
    for (const r of props) {
      for (let i = 0; i + 1 < chase.length; i++) {
        const d = segDist([chase[i]!.x, chase[i]!.z], [chase[i + 1]!.x, chase[i + 1]!.z], r.x, r.z);
        if (d < 3.5 && r.z > 1440 && r.z < 1960) expect.fail(`${r.id} ${r.x},${r.z} ${d.toFixed(1)} m from the chase line`);
      }
    }
  });

  it('keeps the market centre and the coin trail to ground cover, and the gate-square-style open ground clear', () => {
    const centre = all.filter((r) => !isGround(r.id) && !/^fern/.test(r.id) && r.x > 8752 && r.x < 8812 && r.z > 1490 && r.z < 1550);
    expect(centre.map((r) => `${r.id} ${r.x},${r.z}`)).toEqual([]);
    const trail = all.filter((r) => !isGround(r.id) && !/^fern/.test(r.id) && r.x > 8810 && r.x < 8936 && r.z > 1514 && r.z < 1532);
    expect(trail.map((r) => `${r.id} ${r.x},${r.z}`)).toEqual([]);
  });

  it('keeps the guild alley and its patrol clear of props', () => {
    const alley = all.filter((r) => !isGround(r.id) && !/^fern/.test(r.id) && r.x > 8935 && r.x < 9045 && Math.abs(r.z - 1523.5) < 1.8);
    expect(alley.map((r) => `${r.id} ${r.x},${r.z}`)).toEqual([]);
  });
});

describe('H2 lawn and ground colour', () => {
  it('adopts the lawn on its core only', async () => {
    const { cityLawnFor } = await import('./groundCover');
    const lawn = cityLawnFor(true);
    expect(lawn(8640, 1640)).toBe(true); // open ground in the gardens
    expect(lawn(8490, 1500)).toBe(false); // main street (crowd lane)
    expect(lawn(8200, 1500)).toBe(false); // H4's core
  });

  it('puts the street zones on the crowd lanes, narrower than the lane', () => {
    const streets = H2_SPLAT_ZONES.filter((z) => z.kind === 'street');
    expect(streets.length).toBe(5);
    const lanes: Record<string, string> = { 'h2.main-street-south': 'main-street-south', 'h2.keep-road': 'main-street-north', 'h2.fountain-circuit': 'fountain-circuit', 'h2.market-ring': 'market-ring', 'h2.guild-alley': 'guild-alley' };
    for (const z of streets) {
      if (z.kind !== 'street') continue;
      const lane = CROWD_LANES.find((l) => l.id === `harrowmark.lane.${lanes[z.id]}`)!;
      expect(z.halfWidth, z.id).toBeLessThanOrEqual(Math.max(lane.halfWidth, 2));
      // the keep road's first point is the connector from the fountain circuit to the lane's start
      for (const p of z.id === 'h2.keep-road' ? z.pts.slice(1) : z.pts) expect(laneDist(lane, p[0], p[1]), `${z.id} ${p}`).toBeLessThan(2.5);
    }
  });

  it('trims the stone apron and the yards to the box they serve, and dresses the apron rim', () => {
    const apron = H2_SPLAT_ZONES.find((z) => z.id === 'h2.fountain-apron');
    const fountain = HARROWMARK_LAYOUT.structures.find((s) => s.id === 'fountain')!;
    expect(apron && apron.kind === 'court').toBe(true);
    if (apron?.kind === 'court') {
      const m = 4 + 1e-9;
      expect(apron.x0).toBeGreaterThanOrEqual(fountain.x - fountain.footprint[0] / 2 - m);
      expect(apron.x1).toBeLessThanOrEqual(fountain.x + fountain.footprint[0] / 2 + m);
      expect(apron.z0).toBeGreaterThanOrEqual(fountain.z - fountain.footprint[1] / 2 - m);
      expect(apron.z1).toBeLessThanOrEqual(fountain.z + fountain.footprint[1] / 2 + m);
      const stray = all.filter((r) => /^(grass|fern)/.test(r.id) && r.x >= apron.x0 && r.x <= apron.x1 && r.z >= apron.z0 && r.z <= apron.z1);
      expect(stray.map((r) => `${r.id} ${r.x},${r.z}`)).toEqual([]);
      const rim = all.filter((r) => /^(bench|post_lantern|planter-box-a)/.test(r.id) && Math.hypot(r.x - fountain.x, r.z - fountain.z) < 14);
      expect(rim.length).toBeGreaterThanOrEqual(8);
    }
    const centre = H2_SPLAT_ZONES.find((z) => z.id === 'h2.market-centre');
    expect(centre && centre.kind === 'yard' && centre.keepBlades).toBe(true); // trodden lawn, not paving
    if (centre?.kind === 'yard') {
      expect(centre.x0).toBeGreaterThanOrEqual(8752 - 8);
      expect(centre.x1).toBeLessThanOrEqual(8812 + 8);
      expect(centre.z0).toBeGreaterThanOrEqual(1490 - 8);
      expect(centre.z1).toBeLessThanOrEqual(1550 + 8);
    }
    for (const z of H2_SPLAT_ZONES) if (z.kind === 'yard' || z.kind === 'court') expect(z.x1 - z.x0, z.id).toBeLessThan(80);
  });
});

describe('H2 corridors and middle-ground dressing', () => {
  it('keeps the sheet corridors free of big props at the full half width', () => {
    const corridors: Array<[readonly [number, number], readonly [number, number], number]> = [
      [[8498, 1520], [8750, 1520], 9],
      [[8858, 1626], [8498, 1640], 8],
      [[8545, 1365], [8752, 1505], 7],
    ];
    const big = /fence|hedge|wall|haystack|cart|well|stall|tent|barn|cottage|stable|tree|oak|birch|elm|trough|keg/;
    for (const r of all) {
      if (!big.test(r.id)) continue;
      for (const [a, b, w] of corridors) expect(segDist(a, b, r.x, r.z), `${r.id} ${r.x},${r.z}`).toBeGreaterThanOrEqual(w - 0.05);
    }
  });

  it('adds the builder dressing at the eye cameras: at least 400 rows, every class of small prop, and trees', () => {
    const dressing = all.filter((r) => /^(fruit-tree|planter-box|bench|garden-bed|bush-)/.test(r.id));
    expect(dressing.length).toBeGreaterThan(400);
  });
});

describe('H2 review round 2', () => {
  const near = (cx: number, cz: number, r0: number, r1: number, re: RegExp): number => all.filter((r) => re.test(r.id) && Math.hypot(r.x - cx, r.z - cz) >= r0 && Math.hypot(r.x - cx, r.z - cz) <= r1).length;
  it('puts groups at 8 to 20 m of the alley eye, outside the coin trail / patrol box plus 4 m', () => {
    expect(near(8905, 1523.5, 8, 24, /^(bush|barrel|crate|sack)/)).toBeGreaterThanOrEqual(15);
    const g = all.filter((r) => /^(bush-round-a|barrel|crate_A_small)/.test(r.id) && r.x > 8908 && r.x < 8930 && r.z > 1510 - 5 && r.z < 1536 + 5);
    for (const r of g) expect(r.z <= 1510 || r.z >= 1536, `${r.id} ${r.x},${r.z}`).toBe(true);
  });
  it('puts carts, crates and trees just outside the market stall ring, and gathers goods beside the carts', () => {
    expect(near(8780, 1520, 31, 75, /^(cart-goods-a|haycart-a|crates-stacked-a)/)).toBeGreaterThanOrEqual(6);
    expect(near(8780, 1520, 31, 80, /^(fruit-tree|oak|birch)/)).toBeGreaterThanOrEqual(4);
    const cart = all.find((r) => r.id === 'cart-goods-a' && r.x === 8838 && r.z === 1478)!;
    expect(near(cart.x, cart.z, 2, 4.2, /^(barrel|sack|crate|bucket)/)).toBeGreaterThanOrEqual(2);
  });
  it('flanks the fountain eye with bench and planter pairs and bush groups at 6 to 12 m', () => {
    expect(near(8499, 1672, 6, 14, /^bench/)).toBeGreaterThanOrEqual(2);
    expect(near(8499, 1672, 6, 14, /^planter-box-a/)).toBeGreaterThanOrEqual(2);
    expect(near(8499, 1672, 6, 14, /^bush/)).toBeGreaterThanOrEqual(2);
  });
  it('closes the garden enclosures: gate openings are at most 10 m between module centres', () => {
    const F = /^(hedge-straight|wattle-fence|picket-fence|stonewall-low)$/;
    for (const [x0, x1, z0, z1] of [[8600, 8644, 1692, 1734], [8664, 8712, 1694, 1738], [8732, 8784, 1724, 1770], [8800, 8852, 1728, 1774], [8734, 8780, 1806, 1848], [8806, 8856, 1812, 1858], [8640, 8690, 1872, 1916], [8934, 8984, 1770, 1816], [8936, 8986, 1860, 1906]] as const) {
      const mods = all.filter((r) => F.test(r.id) && r.x >= x0 - 2 && r.x <= x1 + 2 && r.z >= z0 - 2 && r.z <= z1 + 2);
      for (const side of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x0, z1, x1, z1], [x0, z0, x0, z1]] as const) {
        const horiz = side[1] === side[3];
        const co = mods.filter((r) => Math.abs(horiz ? r.z - side[1] : r.x - side[0]) < 1.5).map((r) => (horiz ? r.x : r.z)).sort((a, b) => a - b);
        const full = [horiz ? side[0] : side[1], ...co, horiz ? side[2] : side[3]];
        for (let k = 0; k + 1 < full.length; k++) expect(full[k + 1]! - full[k]!, `gap on ${side} of ${x0},${z0}`).toBeLessThanOrEqual(10);
      }
    }
  });
  it('has a bush and tree group on the main street left flank at 10 to 25 m of the tile eye, and verge strips at the house feet', () => {
    expect(near(8485, 1452, 10, 40, /^(fruit-tree|oak-b|bush)/) - 0).toBeGreaterThanOrEqual(8);
    const h = HARROWMARK_LAYOUT.structures.find((s) => s.id === 'guild.hall')!;
    expect(all.filter((r) => /^(fern-a|flower-patch)/.test(r.id) && Math.abs(r.x - h.x) < h.footprint[0] / 2 + 3 && Math.abs(r.z - h.z) < h.footprint[1] / 2 + 3).length).toBeGreaterThan(10);
  });
});
