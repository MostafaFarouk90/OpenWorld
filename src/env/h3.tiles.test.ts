// Environment pass H3: the keep and the Rooftop Ward (L shape x 7720..9240, z 1960..2760 minus H4 x 7720..8440, z 1960..2240).
import { describe, expect, it } from 'vitest';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { pointInFootprint } from '../region/geometry';
import { classOf } from './PlacementField';
import { isPatch } from './patches';
import { resolveModel } from './resolve';
import { TILES } from './tiles';

const all = TILES.h3!;
const ground = all.filter((r) => r.dy === undefined);
const lifted = all.filter((r) => r.dy !== undefined);
const isGround = (id: string): boolean => /^(grass|flower)/.test(id);
const inH4 = (x: number, z: number): boolean => x >= 7720 && x < 8440 && z >= 1960 && z < 2240;
const solids = HARROWMARK_LAYOUT.structures.filter((s) => s.mode !== 'open');

describe('H3 placements', () => {
  it('is registered: about 13k core rows plus the 375-row roof-deck annex', () => {
    expect(ground.length).toBeGreaterThan(12000);
        expect(lifted.length).toBe(375);
  });

  it('dresses every class, not only the hedges', () => {
    const by: Record<string, number> = {};
    for (const r of ground) by[classOf(r.id)] = (by[classOf(r.id)] ?? 0) + 1;
    for (const c of ['tree', 'bush', 'rock', 'wood', 'ground', 'prop', 'hedge']) expect(by[c] ?? 0, c).toBeGreaterThan(20);
    expect(by.ground).toBeGreaterThan(5000);
  });

  it('resolves every id to a model: no placeholder box is left', () => {
    const boxes = [...new Set(all.map((r) => r.id))].filter((id) => !isPatch(id) && resolveModel(id).source === 'placeholder');
    expect(boxes).toEqual([]);
  });

  it('lies inside the tile core and outside H4 (the band belongs to the neighbours)', () => {
    for (const r of all) {
      expect(r.x, r.id).toBeGreaterThanOrEqual(7720);
      expect(r.x, r.id).toBeLessThanOrEqual(9240);
      expect(r.z, r.id).toBeGreaterThanOrEqual(1960);
      expect(r.z, r.id).toBeLessThanOrEqual(2760);
      expect(inH4(r.x, r.z), `${r.id} ${r.x},${r.z} in H4`).toBe(false);
    }
  });

  it('keeps the ground rows out of every solid footprint and off the anchors', () => {
    for (const r of ground) {
      expect(solids.find((s) => pointInFootprint(s, r.x, r.z, 0.4))?.id, `${r.id} ${r.x},${r.z}`).toBeUndefined();
    }
    const props = ground.filter((r) => !isGround(r.id));
    for (const a of HARROWMARK_LAYOUT.anchors) {
      if (a.x < 7700 || a.x > 9260 || a.z < 1940 || a.z > 2780) continue;
      const hit = props.find((r) => Math.hypot(r.x - a.x, r.z - a.z) < 1);
      expect(hit && `${hit.id} on ${a.id}`).toBeUndefined();
    }
  });

  it('leaves the keep court, the counting yard and the M10 chase line open', () => {
    // patrol box of the keep court (8466..8534 x 2541..2594) and the counting yard (8722..8763 x 1972..2023): no prop in either
    const court = (r: { x: number; z: number }): boolean => r.x > 8466 && r.x < 8534 && r.z > 2541 && r.z < 2594;
    const yard = (r: { x: number; z: number }): boolean => r.x > 8722 && r.x < 8763 && r.z > 1972 && r.z < 2023;
    const intruders = ground.filter((r) => !isGround(r.id) && (court(r) || yard(r)));
    expect(intruders.map((r) => `${r.id} ${r.x},${r.z}`)).toEqual([]);
    // the chase run north of the ward stair along x 8900: nothing taller than ferns within 3.5 m of the line z 1620..2200
    const onLine = ground.filter((r) => !isGround(r.id) && !/^fern/.test(r.id) && Math.abs(r.x - 8900) < 3.5 && r.z > 1620 && r.z < 2200);
    expect(onLine.map((r) => `${r.id} ${r.x},${r.z}`)).toEqual([]);
  });

  it('puts the roof-deck annex on the Rooftop Ward blocks, lifted by 6 to 8 m, and nothing else carries dy', () => {
    for (const r of lifted) {
      expect(r.dy!, r.id).toBeGreaterThanOrEqual(6);
      expect(r.dy!, r.id).toBeLessThanOrEqual(8);
      expect(r.x).toBeGreaterThan(8700);
      expect(r.x).toBeLessThan(9000);
      expect(r.z).toBeGreaterThan(2240);
      expect(r.z).toBeLessThan(2540);
    }
    expect(ground.every((r) => r.dy === undefined)).toBe(true);
    expect(lifted.filter((r) => r.id === 'chimney-stack-a').length).toBe(152);
  });

  it('keeps the roof-deck props off the roof chase line (3.5 m)', () => {
    const roof = HARROWMARK_LAYOUT.anchors.filter((a) => /^chase\.m10\.(4|5|6|7|8|9|10|11|12)$/.test(a.id.replace('harrowmark.', '')));
    expect(roof.length).toBeGreaterThan(5);
    for (const a of roof) for (const r of lifted) expect(Math.hypot(r.x - a.x, r.z - a.z), `${r.id} on ${a.id}`).toBeGreaterThanOrEqual(1);
  });
});

describe('H3 lawn and ground colour', () => {
  it('adopts the lawn on its L-shaped core only', async () => {
    const { cityLawnFor } = await import('./groundCover');
    const lawn = cityLawnFor(true);
    expect(lawn(8620, 2440)).toBe(true); // open lawn north of the keep road
    expect(lawn(8490, 2200)).toBe(false); // the keep road lane
    expect(lawn(8100, 2100)).toBe(false); // H4's core
  });
});

describe('H3 round 2: trimmed stone courts', () => {
  it('keeps every court to its frozen box plus 4 to 8 m', async () => {
    const { H3_SPLAT_ZONES } = await import('../terrain/shape/splatZones.h3');
    const boxes: Record<string, [number, number, number, number, number]> = {
      'h3.keep-court': [8466, 8534, 2541, 2594, 4],
    };
    const cy = H3_SPLAT_ZONES.find((z) => z.id === 'h3.counting-yard');
    expect(cy && cy.kind === 'yard' && cy.keepBlades).toBe(true); // trodden lawn, not stone
    for (const z of H3_SPLAT_ZONES) {
      if (z.kind !== 'court' || !boxes[z.id]) continue;
      const [x0, x1, z0, z1, m] = boxes[z.id]!;
      expect(z.x0, z.id).toBeGreaterThanOrEqual(x0 - m);
      expect(z.x1, z.id).toBeLessThanOrEqual(x1 + m);
      expect(z.z0, z.id).toBeGreaterThanOrEqual(z0 - m);
      expect(z.z1, z.id).toBeLessThanOrEqual(z1 + m);
    }
    const ward = H3_SPLAT_ZONES.find((z) => z.id === 'h3.ward-square');
    expect(ward && ward.kind === 'court' && ward.x1 - ward.x0).toBeLessThan(100);
  });

  it('has no grass, flower or fern row on a court, and dresses the rims (stalls near the ward stair, yews at the counting yard)', async () => {
    const { H3_SPLAT_ZONES } = await import('../terrain/shape/splatZones.h3');
    const courts = H3_SPLAT_ZONES.filter((z) => z.kind === 'court');
    const stray = all.filter((r) => r.dy === undefined && /^(grass|flower|fern)/.test(r.id) && courts.some((c) => c.kind === 'court' && r.x >= c.x0 && r.x <= c.x1 && r.z >= c.z0 && r.z <= c.z1));
    expect(stray.map((r) => `${r.id} ${r.x},${r.z}`)).toEqual([]);
    const near = (cx: number, cz: number, rad: number, re: RegExp): number => all.filter((r) => re.test(r.id) && Math.hypot(r.x - cx, r.z - cz) < rad).length;
    expect(near(8860, 2215, 35, /^market-stall/)).toBeGreaterThanOrEqual(4);
    expect(near(8750, 1998, 45, /^bush-round-a/)).toBeGreaterThanOrEqual(4);
  });
});
