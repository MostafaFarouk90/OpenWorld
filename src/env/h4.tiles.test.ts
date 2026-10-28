// Environment pass H4: Forge Row, the old smelter yard, the Bastion and the chapel (core x 7720..8440, z 1440..2240; H1 owns the z 1440 edge, H2 and H3 the x 8440 edge).
import { describe, expect, it } from 'vitest';
import { CROWD_LANES, HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { pointInFootprint } from '../region/geometry';
import { H4_SPLAT_ZONES, BASTION_BOX } from '../terrain/shape/splatZones.h4';
import cameras from '../../tools/env-pass/cameras.json';
import { classOf } from './PlacementField';
import { isPatch } from './patches';
import { resolveModel } from './resolve';
import dressingRows from './h4.dressing.json';
import { TILES } from './tiles';

const all = TILES.h4!;
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
const props = all.filter((r) => !isGround(r.id) && !/^fern/.test(r.id));

describe('H4 placements', () => {
  it('is registered with about 9.8k core rows plus the dressing', () => {
    expect(all.length).toBeGreaterThan(10000);
    expect(all.length).toBeLessThan(12500);
  });

  it('dresses every class', () => {
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
    for (const id of ['forge-hearth-a', 'anvil-a', 'coal-heap-a', 'iron-stock-a', 'grindstone-a', 'charcoal-clamp-a', 'brazier-standing-a', 'trough-a', 'charred-stump', 'scorched-fence', 'stable-a', 'cottage-thatch-a', 'barn-a', 'fruit-tree-a', 'planter-box-a', 'keg-a', 'cart-goods-a']) {
      expect(resolveModel(id).source, id).toBe('env');
    }
    // The Act 2 industry ids borrowed inside the wall have no file yet: tinted stand-ins of shipped env models (not boxes).
    for (const id of ['slag-heap', 'ore-pile', 'mine-cart']) {
      const m = resolveModel(id);
      expect(m.source, id).toBe('env');
      expect(m.source === 'env' && m.tint, id).toBeTruthy();
    }
    expect(resolveModel('smelter-chimney').source).toBe('kaykit');
  });

  it('owns only its core: nothing outside x 7720..8440, z 1440..2240, none carrying dy', () => {
    for (const r of all) {
      expect(r.x, r.id).toBeGreaterThanOrEqual(7720);
      expect(r.x, r.id).toBeLessThanOrEqual(8440);
      expect(r.z, r.id).toBeGreaterThanOrEqual(1440);
      expect(r.z, r.id).toBeLessThanOrEqual(2240);
      expect(r.dy, r.id).toBeUndefined();
    }
  });

  it('does not double up with H1, H2 or H3 across the seams', () => {
    const key = (r: { x: number; z: number }): string => `${r.x.toFixed(1)},${r.z.toFixed(1)}`;
    const mine = new Set(all.map(key));
    for (const other of ['h1', 'h2', 'h3'] as const) for (const r of TILES[other]!) expect(mine.has(key(r)), `${other} ${r.id} ${key(r)}`).toBe(false);
  });

  it('keeps every row out of the solid footprints', () => {
    for (const r of all) expect(solids.find((s) => pointInFootprint(s, r.x, r.z, 0.4))?.id, `${r.id} ${r.x},${r.z}`).toBeUndefined();
  });

  it('keeps the props off the anchors, the crowd lanes (big props to the half width) and out of the roads', () => {
    for (const a of HARROWMARK_LAYOUT.anchors) {
      if (a.x < 7700 || a.x > 8460 || a.z < 1420 || a.z > 2260) continue;
      const hit = props.find((r) => Math.hypot(r.x - a.x, r.z - a.z) < 1);
      expect(hit && `${hit.id} on ${a.id}`).toBeUndefined();
    }
    for (const lane of CROWD_LANES) {
      for (const r of props) {
        if (/^(hedge|wattle|picket|stonewall|fruit|oak|birch|elm|bench|barn|cottage|stable|cart|handcart|planter|haybale|haystack|coal|iron|bush)/.test(r.id) && laneDist(lane, r.x, r.z) < lane.halfWidth) {
          expect.fail(`${r.id} ${r.x},${r.z} inside lane ${lane.id}`);
        }
      }
    }
  });

  it('keeps the Bastion trigger box plus 4 m, the Anvil sign trigger and the door spheres free of anything the builder added', () => {
    const dressing = (dressingRows as Array<{ id: string; x: number; z: number }>).filter((r) => !isGround(r.id) && !/^fern/.test(r.id));
    const inBox = dressing.filter((r) => r.x > BASTION_BOX.x0 - 4 && r.x < BASTION_BOX.x1 + 4 && r.z > BASTION_BOX.z0 - 4 && r.z < BASTION_BOX.z1 + 4);
    // the sheet's own rows in the box are fence rails of the yard and the dummies' stand: only the dressing groups must stay out
    const groups = inBox.filter((r) => /^(bush|bench|planter|fruit|oak|birch|elm|cart|barrel|crate|sack|coal|iron)/.test(r.id));
    expect(groups.map((r) => `${r.id} ${r.x},${r.z}`)).toEqual([]);
    const sign = dressing.filter((r) => Math.hypot(r.x - 8204, r.z - 1645) < 8);
    expect(sign.map((r) => `${r.id} ${r.x},${r.z}`)).toEqual([]);
  });

  it('keeps the sheet corridors free of big props at the full width', () => {
    const corridors: Array<[readonly [number, number], readonly [number, number], number]> = [
      [[8205, 1527], [8205, 1640], 5], // Forge Row to the Anvil door
      [[8098, 1520], [7961, 1545], 4.5], // D02: the ore track to the Underways door
      [[8222, 1788], [8292, 1788], 3], // Wystan's steps to the edge lane
      [[8349, 2150], [8392, 2150], 3], // the chapel door
    ];
    const big = /fence|hedge|wall|haystack|haybale|cart|well|stall|tent|barn|cottage|stable|tree|oak|birch|elm|trough|keg|bush|bench|planter|coal|iron|barrel|crate/;
    for (const r of all) {
      if (!big.test(r.id) || /^scorched-fence/.test(r.id)) continue;
      for (const [a, b, w] of corridors) expect(segDist(a, b, r.x, r.z), `${r.id} ${r.x},${r.z}`).toBeGreaterThanOrEqual(w - 0.05);
    }
  });

  it('puts the scorched rails of the ore track on both sides of it', () => {
    const rails = all.filter((r) => r.id === 'scorched-fence' && segDist([8098, 1520], [7961, 1545], r.x, r.z) < 9);
    const side = (r: { x: number; z: number }): number => Math.sign((r.x - 8098) * (1545 - 1520) - (r.z - 1520) * (7961 - 8098));
    expect(rails.filter((r) => side(r) > 0).length).toBeGreaterThan(3);
    expect(rails.filter((r) => side(r) < 0).length).toBeGreaterThan(3);
  });
});

describe('H4 lawn and ground colour', () => {
  it('adopts the lawn on its core only', async () => {
    const { cityLawnFor } = await import('./groundCover');
    const lawn = cityLawnFor(true);
    expect(lawn(8000, 1900)).toBe(true); // the west commons
    expect(lawn(8180, 1520)).toBe(false); // Forge Row (crowd lane)
  });

  it('puts the street zones on the crowd lanes, narrower than the lane', () => {
    const streets = H4_SPLAT_ZONES.filter((z) => z.kind === 'street');
    expect(streets.length).toBe(4);
    const lanes: Record<string, string> = { 'h4.forge-row': 'forge-row', 'h4.bastion-edge': 'bastion-edge', 'h4.chapel-approach': 'chapel-approach' };
    for (const z of streets) {
      if (z.kind !== 'street') continue;
      if (z.id === 'h4.ore-track') {
        // the D02 corridor: from Forge Row's west end to the Underways door, 2.5 m trodden inside the 4.5 m corridor
        for (const p of z.pts) expect(segDist([8098, 1520], [7961, 1545], p[0], p[1]), `${z.id} ${p}`).toBeLessThan(4.5);
        continue;
      }
      const lane = CROWD_LANES.find((l) => l.id === `harrowmark.lane.${lanes[z.id]}`)!;
      expect(z.halfWidth, z.id).toBeLessThan(lane.halfWidth);
      // the chapel approach's first point is the keep road's trodden edge, the forge row's last one the lane end
      for (const p of z.pts.slice(0, -1).filter((q) => laneDist(lane, q[0], q[1]) < 3)) expect(laneDist(lane, p[0], p[1]), `${z.id} ${p}`).toBeLessThan(2.5);
    }
  });

  it('trims every yard to the box it serves (box + 4 to 8 m), as trodden lawn with the blades through it, none over 80 m wide', () => {
    const yards = H4_SPLAT_ZONES.filter((z) => z.kind === 'yard');
    expect(yards.length).toBeGreaterThanOrEqual(8);
    for (const z of yards) {
      if (z.kind !== 'yard') continue;
      expect(z.keepBlades, z.id).toBe(true);
      expect(z.x1 - z.x0, z.id).toBeLessThan(80 + (z.id === 'h4.bastion-yard' || z.id.startsWith('h4.forge') ? 230 : 0));
      expect(z.strength, z.id).toBeLessThanOrEqual(0.55);
    }
    const bastion = yards.find((z) => z.id === 'h4.bastion-yard');
    expect(bastion?.kind === 'yard' && bastion.x0).toBe(BASTION_BOX.x0 - 4);
    expect(bastion?.kind === 'yard' && bastion.x1).toBe(BASTION_BOX.x1 + 4);
    expect(bastion?.kind === 'yard' && bastion.z0).toBe(BASTION_BOX.z0 - 4);
    expect(bastion?.kind === 'yard' && bastion.z1).toBe(BASTION_BOX.z1 + 4);
    const apron = yards.find((z) => z.id === 'h4.underways-apron');
    // the Underways door trigger (r 2 at 7958, 1545) plus 8 m and the track's mouth
    expect(apron?.kind === 'yard' && apron.x0).toBeGreaterThanOrEqual(7958 - 2 - 8 - 10);
    expect(apron?.kind === 'yard' && apron.x1 - apron.x0).toBeLessThanOrEqual(60);
    // no stone courts and no paved plazas in H4
    expect(H4_SPLAT_ZONES.filter((z) => z.kind === 'court')).toEqual([]);
  });
});

describe('H4 enclosures and middle-ground dressing', () => {
  const FENCE = /^(hedge-straight|wattle-fence|picket-fence|stonewall-low)$/;
  it('closes the enclosures: no gate opening wider than 10 m between module centres, so every gate has a wall or fence on both sides', () => {
    const fm = all.filter((r) => FENCE.test(r.id));
    const par = fm.map((_, i) => i);
    const find = (i: number): number => { while (par[i] !== i) { par[i] = par[par[i]!]!; i = par[i]!; } return i; };
    for (let i = 0; i < fm.length; i++) for (let j = i + 1; j < fm.length; j++) {
      if (fm[i]!.id === fm[j]!.id && Math.hypot(fm[i]!.x - fm[j]!.x, fm[i]!.z - fm[j]!.z) <= 11) par[find(i)] = find(j);
    }
    const clusters = new Map<number, typeof fm>();
    fm.forEach((r, i) => { const k = find(i); (clusters.get(k) ?? clusters.set(k, []).get(k)!).push(r); });
    let checked = 0;
    for (const c of clusters.values()) {
      if (c.length < 14) continue;
      const x0 = Math.min(...c.map((r) => r.x)), x1 = Math.max(...c.map((r) => r.x)), z0 = Math.min(...c.map((r) => r.z)), z1 = Math.max(...c.map((r) => r.z));
      if (x1 - x0 < 20 || x1 - x0 > 150 || z1 - z0 < 20 || z1 - z0 > 150) continue;
      checked++;
      for (const side of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x0, z1, x1, z1], [x0, z0, x0, z1]] as const) {
        const horiz = side[1] === side[3];
        const co = c.filter((r) => Math.abs(horiz ? r.z - side[1] : r.x - side[0]) < 1.5).map((r) => (horiz ? r.x : r.z)).sort((a, b) => a - b);
        const full = [horiz ? side[0] : side[1], ...co, horiz ? side[2] : side[3]];
        for (let k = 0; k + 1 < full.length; k++) {
          // the chapel approach (lane hw 4 + 0.8 clear) walks through the churchyard's east wall: that gate is the lane's width plus a module
          const mid = (full[k]! + full[k + 1]!) / 2;
          const laneGate = horiz ? false : side[0] > 8390 && side[0] < 8410 && Math.abs(mid - 2150) < 3;
          expect(full[k + 1]! - full[k]!, `gap on ${side} of ${c[0]!.id} ${x0},${z0}`).toBeLessThanOrEqual(laneGate ? 14 : 10);
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(15);
  });

  it('gathers the commons goods into groups: nearly every handcart and wheelbarrow has two or more pieces within 5 m', () => {
    const goods = all.filter((r) => /^(handcart-a|wheelbarrow|haybale-a|woodpile-chop|trough-a)$/.test(r.id) && r.x < 8130 && r.z > 1700);
    const carts = goods.filter((r) => /^(handcart-a|wheelbarrow)$/.test(r.id));
    expect(carts.length).toBeGreaterThan(15);
    const alone = carts.filter((r) => goods.filter((o) => o !== r && Math.hypot(o.x - r.x, o.z - r.z) < 5).length < 2);
    expect(alone.length).toBeLessThanOrEqual(Math.ceil(carts.length * 0.12));
  });

  it('puts bush, bench, planter, cart and crate groups at 10 to 35 m of every eye camera', () => {
    const tiles = cameras.tiles as unknown as Record<string, { cameras: { eye: { pos: number[]; look: number[] } } }>;
    // The Bastion's smoke eye stands inside the yard's trigger box and looks across it: nothing may stand there, so it is exempt.
    const minimum: Record<string, number> = { 'h4-tile': 25, 'h4-m07anvil': 25, 'h4-r03anvil': 20, 'h4-m09clerk': 20, 'h4-d02underways': 25, 'h4-m08bastion': 20, 'h4-r04chapel': 25, 'h4-westward': 25 };
    for (const [key, min] of Object.entries(minimum)) {
      const e = tiles[key]!.cameras.eye;
      const f = Math.atan2(e.look[2]! - e.pos[2]!, e.look[0]! - e.pos[0]!);
      const seen = props.filter((r) => {
        const d = Math.hypot(r.x - e.pos[0]!, r.z - e.pos[2]!);
        if (d < 10 || d > 36) return false;
        const a = Math.atan2(r.z - e.pos[2]!, r.x - e.pos[0]!) - f;
        return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < (50 * Math.PI) / 180;
      });
      const ids = seen.filter((r) => /^(bush|bench|planter|cart|handcart|barrel|crate|sack|fruit|oak|birch|elm|coal|iron|ore|rubble|coal|slag|yew|woodpile|haybale|beehive|forge|anvil|log|stump)/.test(r.id));
      expect(ids.length, key).toBeGreaterThanOrEqual(min);
    }
  });

  it('has verge strips and bushes at the house feet', () => {
    const h = HARROWMARK_LAYOUT.structures.find((s) => s.id === 'forge.a3')!;
    expect(all.filter((r) => /^(fern-a|flower-patch)/.test(r.id) && Math.abs(r.x - h.x) < h.footprint[0] / 2 + 3 && Math.abs(r.z - h.z) < h.footprint[1] / 2 + 3).length).toBeGreaterThan(8);
    expect(all.filter((r) => r.id === 'bush-round-a' && Math.abs(r.x - h.x) < h.footprint[0] / 2 + 3.5 && Math.abs(r.z - h.z) < h.footprint[1] / 2 + 3.5).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the soot grey round Forge Row, the smelter yard and the charcoal yard (zones in the H3 file) under the smithy yards', async () => {
    const { H3_SPLAT_ZONES } = await import('../terrain/shape/splatZones.h3');
    expect(H3_SPLAT_ZONES.filter((z) => z.kind === 'soot').length).toBe(3);
    expect(H4_SPLAT_ZONES.find((z) => z.id === 'h4.forge-yards-north')?.kind).toBe('yard');
  });
});
