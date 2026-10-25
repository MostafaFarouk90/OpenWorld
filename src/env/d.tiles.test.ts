// D1, D2 and D3: the Dead Road corridor (x 1100..8000, 300 m either side of the road). Rows stay inside their tile, off the road, the anchors,
// the camps and the farm-ring structures, and the item palettes follow the ash curve that also colours the ground.
import { describe, expect, it } from 'vitest';
import { CORRIDOR_LAYOUT } from '../region/corridor.layout';
import { DEADROAD_LAYOUT } from '../region/deadroad.layout';
import { ROAD_WIDTH } from '../region/deadRoad';
import { pointInFootprint } from '../region/geometry';
import { ashCorridor, roadDistance } from './ashGradient';
import { classOf, type PlacementRow } from './PlacementField';
import { expandPatches, isPatch } from './patches';
import { resolveModel } from './resolve';
import { envReplacesScenery } from './groundCover';
import { LAZY_TILES, TILE_BOUNDS, TILES } from './tiles';
import cameras from '../../tools/env-pass/cameras.json';

const names = ['d1', 'd2', 'd3'] as const;
const X: Record<(typeof names)[number], [number, number]> = { d1: [1100, 3600], d2: [3600, 6000], d3: [6000, 8000] };
// D1 to D3 are lazy tiles (separate chunks): load them once for the whole file.
const ROWS = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await LAZY_TILES[n]!()] as const))) as Record<(typeof names)[number], readonly PlacementRow[]>;
const all = names.flatMap((n) => ROWS[n].map((r) => ({ ...r, tile: n })));
const ROAD_HALF = ROAD_WIDTH / 2;
const isGround = (id: string): boolean => /^(grass|flower)/.test(id);
const anchors = [...CORRIDOR_LAYOUT.anchors, ...DEADROAD_LAYOUT.anchors].filter((a) => a.x >= 1090 && a.x <= 8100);
const structures = [...CORRIDOR_LAYOUT.structures, ...DEADROAD_LAYOUT.structures].filter((s) => s.x >= 1090 && s.x <= 8100);

describe('D1 to D3 rows', () => {
  it('are registered, rich (29k core rows) and the patch rows expand to a far larger tuft count', () => {
    for (const n of names) expect(ROWS[n].length, n).toBeGreaterThan(8000);
    expect(all.length).toBeGreaterThan(28500);
    expect(all.length).toBeLessThan(31000);
    const tufts = expandPatches(all);
    expect(tufts.length).toBeGreaterThan(190000);
    expect(tufts.length).toBeLessThan(230000);
  });

  it('keep to their tile by x, and D3 leaves H1 s core (x >= 7760, z >= 1120) alone', () => {
    for (const r of all) {
      const [x0, x1] = X[r.tile];
      expect(r.x, `${r.id} ${r.tile}`).toBeGreaterThanOrEqual(x0);
      expect(r.x, `${r.id} ${r.tile}`).toBeLessThanOrEqual(x1);
      expect(Number.isFinite(r.x) && Number.isFinite(r.z), r.id).toBe(true);
      if (r.x >= 7760) expect(r.z, `${r.id} in H1 s core`).toBeLessThan(1120);
    }
  });

  it('stay inside the 600 m corridor strip', () => {
    for (const r of all) expect(roadDistance(r.x, r.z), `${r.id} at ${r.x},${r.z}`).toBeLessThanOrEqual(300.5);
  });

  it('use ids that resolve to a model: patches expand to real tufts, nothing is a placeholder', () => {
    const ids = [...new Set(all.map((r) => r.id))].filter((id) => !isPatch(id));
    expect(ids.filter((id) => resolveModel(id).source === 'placeholder')).toEqual([]);
    expect(ids).toContain('gibbet-post');
    expect(all.filter((r) => r.id === 'gibbet-post')).toHaveLength(1);
    expect(all.filter((r) => isPatch(r.id)).length).toBeGreaterThan(17000);
  });

  it('keep clear of the road ribbon (0.3 m past its edge for props; no tuft of a patch on it)', () => {
    for (const r of all) {
      if (/^(grass|flower)/.test(r.id)) continue;
      expect(roadDistance(r.x, r.z), `${r.id} on the road at ${r.x},${r.z}`).toBeGreaterThanOrEqual(ROAD_HALF + 0.29);
    }
    const bad = expandPatches(all).filter((t) => roadDistance(t.x, t.z) < ROAD_HALF);
    expect(bad.map((t) => `${t.id} ${t.x.toFixed(1)},${t.z.toFixed(1)}`).slice(0, 5)).toEqual([]);
  });

  it('keep clear of anchors (1 m, trees 3 m), the fog wall and structure footprints', () => {
    for (const a of anchors) {
      for (const r of all) {
        if (isGround(r.id)) continue;
        const d = Math.hypot(r.x - a.x, r.z - a.z);
        expect(d, `${r.id} on ${a.id}`).toBeGreaterThanOrEqual(classOf(r.id) === 'tree' ? 3 : 1);
      }
    }
    for (const s of structures) {
      if (s.id.startsWith('waystone-hollin') || s.id.startsWith('waystone-quench') || s.id.startsWith('ford') || s.id.startsWith('crypt')) continue;
      for (const r of all) {
        if (isGround(r.id)) continue;
        expect(pointInFootprint(s, r.x, r.z, 0.4), `${r.id} at ${r.x},${r.z} in ${s.id}`).toBe(false);
      }
    }
  });

  it('keep the Footman camp clearings (r 21) free of trees, bushes and hedges', () => {
    for (const c of [{ x: 3650, z: 692 }, { x: 4800, z: 848 }]) {
      for (const r of all) {
        const cls = classOf(r.id);
        if (cls === 'tree' || cls === 'bush') expect(Math.hypot(r.x - c.x, r.z - c.z), `${r.id} in the camp at ${c.x}`).toBeGreaterThanOrEqual(21);
      }
    }
  });

  it('start the fence, crow-post rhythm and ground at the fog wall (x 1100) without a gap', () => {
    const near = all.filter((r) => r.x < 1260);
    expect(near.length).toBeGreaterThan(300);
    expect(near.some((r) => r.id === 'crow-perch-post')).toBe(true);
  });

  it('have dead trees in the grey reach, live ones only in the green farm-ring', () => {
    const trees = all.filter((r) => classOf(r.id) === 'tree');
    const dead = (r: PlacementRow) => /^(ash-tree-dead|oak-ash)/.test(r.id);
    const grey = trees.filter((r) => ashCorridor(r.x, r.z) > 0.9);
    const green = trees.filter((r) => ashCorridor(r.x, r.z) < 0.2);
    expect(grey.length).toBeGreaterThan(500);
    expect(grey.filter(dead).length / grey.length).toBeGreaterThan(0.9);
    expect(green.length).toBeGreaterThan(150);
    expect(green.filter(dead).length / green.length).toBeLessThan(0.1);
  });

  it('dress eye level: ground patches within 20 m of the road every few metres along all three tiles', () => {
    for (const n of names) {
      const near = ROWS[n].filter((r) => isPatch(r.id) && roadDistance(r.x, r.z) < 20);
      const length = X[n][1] - X[n][0];
      expect(near.length / length, n).toBeGreaterThan(0.5); // more than one patch per 2 m of road
    }
  });

  it('leave every eye camera s line clear of trunks and boulders (15 m for trees by canopy, 8 m for boulders and logs, 3 m for hedge runs, 4 m for bushes; the line runs from the camera past the Knight 4 m ahead)', () => {
    const eyes = Object.entries((cameras as { tiles: Record<string, { cameras: Record<string, { pos: number[]; look: number[] }> }> }).tiles)
      .filter(([k, v]) => /^d[123]-/.test(k) && v.cameras.eye)
      .map(([, v]) => v.cameras.eye!);
    expect(eyes.length).toBe(10);
    for (const e of eyes) {
      const dx = e.look[0]! - e.pos[0]!;
      const dz = e.look[2]! - e.pos[2]!;
      const len = Math.hypot(dx, dz);
      for (const r of all) {
        const cls = classOf(r.id);
        if (cls !== 'tree' && cls !== 'rock' && cls !== 'wood' && cls !== 'hedge' && !(cls === 'bush' && !r.id.startsWith('fern'))) continue;
        const t = Math.min(14, Math.max(0, ((r.x - e.pos[0]!) * dx + (r.z - e.pos[2]!) * dz) / len));
        const d = Math.hypot(r.x - (e.pos[0]! + (dx / len) * t), r.z - (e.pos[2]! + (dz / len) * t));
        expect(d, `${r.id} at ${r.x},${r.z} fills the eye shot at ${e.pos[0]}`).toBeGreaterThanOrEqual(cls === 'hedge' ? 3 : cls === 'bush' ? 4 : cls === 'tree' ? 15 : 8);
      }
    }
  });

  it('stay out of the main bundle (lazy tiles, not in TILES) and replace the old verge posts inside their bounds, env on only', () => {
    for (const n of names) expect(TILES[n]).toBeUndefined();
    expect(Object.keys(TILE_BOUNDS)).toEqual(expect.arrayContaining([...names]));
    const hide = envReplacesScenery(true);
    expect(hide(2000, 200)).toBe(true);
    expect(hide(4000, 650)).toBe(true);
    expect(hide(7000, 750)).toBe(true);
    expect(hide(1000, -150)).toBe(false); // B4 and the Phase A road keep theirs
    expect(envReplacesScenery(false)(2000, 200)).toBe(false);
  });

  it('has dead trees only (no green canopy) in the full-grey reach west of x 2300, and no black dead-hedge blocks anywhere', () => {
    const live = all.filter((r) => r.x < 2300 && classOf(r.id) === 'tree' && !r.id.startsWith('ash-tree-dead'));
    expect(live.map((r) => `${r.id} ${r.x}`).slice(0, 5)).toEqual([]);
    expect(all.filter((r) => r.id === 'hedge-dead-a')).toHaveLength(0);
  });

  it('hangs a field gate between two gateposts at the D3 hedge gaps', () => {
    const leaves = all.filter((r) => r.id === 'field-gate-a');
    const posts = all.filter((r) => r.id === 'gatepost-a');
    expect(leaves.length).toBeGreaterThan(8);
    const near = (g: PlacementRow) => posts.filter((p) => Math.hypot(p.x - g.x, p.z - g.z) < 3).length;
    for (const g of leaves) expect(near(g), `gate at ${g.x},${g.z}`).toBeGreaterThanOrEqual(1); // a post can fall to a keep-out
    expect(leaves.filter((g) => near(g) >= 2).length).toBeGreaterThanOrEqual(leaves.length * 0.6);
  });

  it('puts clutter on both camps edges (r 18 to 21), the gibbet on the crest, bank oaks at the seam, and the farmyard set pieces', () => {
    for (const c of [{ x: 3650, z: 692 }, { x: 4800, z: 848 }]) {
      const edge = all.filter((r) => classOf(r.id) !== 'ground' && classOf(r.id) !== 'tree' && Math.hypot(r.x - c.x, r.z - c.z) >= 17.5 && Math.hypot(r.x - c.x, r.z - c.z) <= 21.5);
      expect(edge.length, `camp at ${c.x}`).toBeGreaterThanOrEqual(8);
    }
    expect(all.filter((r) => r.id === 'gibbet-post').map((r) => r.x)[0]).toBeGreaterThan(1700);
    const seamOaks = all.filter((r) => r.id === 'oak-a' && r.x > 7740 && r.x < 7870);
    expect(seamOaks.length).toBeGreaterThanOrEqual(2);
    for (const id of ['beehive-skep', 'woodpile-chop', 'washing-line', 'barrel', 'sack']) expect(all.filter((r) => r.id === id && r.x > 6700 && r.x < 6960).length, id).toBeGreaterThan(0);
  });
});
