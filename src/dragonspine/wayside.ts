// R17's six wayside shrine sites along the Rime Pass: three between the shelter and the Last Anvil, three between the Anvil and
// the summit gate, about 200 m of road apart, numbered in road order (1 lowest, 6 nearest the summit gate). Each is a built stone platform on the road verge (no terrain edits: K1 owns the
// ground), its top level with the road edge, and an anchor on it. K9 builds the shrines.
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, solid, type Part } from './helpers';
import { footprintMax } from './fit';
import type { Sites } from './sites';

export const WAYSIDE_PAD = 8;
/** The most a platform may slide along the road from its target, in metres, looking for gentle ground. */
export const WAYSIDE_MAX_SLIDE = 90;
/** The most a platform's top may stand over the road edge's ground, in metres. */
export const WAYSIDE_MAX_STEP = 0.6;
/** The platform's height above the highest ground under it. */
export const WAYSIDE_PAD_HEIGHT = 0.2;
/** Consecutive pads are at least this far apart on the road (two never end up side by side). */
export const WAYSIDE_MIN_GAP = 120;
/** The first pad is this far past the shelter's road position, the pads either side of the Anvil this far from it. */
const SHELTER_CLEAR = 60;
const ANVIL_CLEAR = 40;
/** Slide candidates, nearest the target first: coarse (10 m) for the search, fine (2.5 m) around the winner. */
const slides = (step: number, reach: number): number[] => {
  const out = [0];
  for (let d = step; d <= reach; d += step) out.push(d, -d);
  return out;
};
const COARSE = slides(10, WAYSIDE_MAX_SLIDE);

export interface WaysideSite {
  index: number;
  /** Road arc position of the pad. */
  s: number;
  x: number;
  z: number;
  /** +1 left of travel, -1 right. */
  side: 1 | -1;
  /** Platform top above the terrain at the pad's centre (the anchor's dy). */
  dy: number;
}

export interface WaysideInfo {
  sites: WaysideSite[];
  specs: StructureSpec[];
}

/** The sites are about this far apart on the road (200 m of road between shrines); closer when the stretch is short. */
export const WAYSIDE_SPACING = 200;

/** Where the six sites want to be on the road: three each side of the Anvil, `WAYSIDE_SPACING` apart (squeezed to fit the stretch). */
export function waysideTargets(shelterS: number, anvilS: number, roadEnd: number): number[] {
  const gap = Math.min(WAYSIDE_SPACING, (anvilS - shelterS - 100) / 3, (roadEnd - anvilS - 60) / 3);
  return [1, 2, 3, 4, 5, 6].map((i) => (i <= 3 ? anvilS - gap * (4 - i) : anvilS + gap * (i - 3)));
}

export function waysideLayout(s: Sites, shelterS: number, anvilS: number): { part: Part; info: WaysideInfo } {
  // The pad's gap from the road edge: tried nearest first, a little further out when the verge is steep.
  const offsets = [0.5, 3, 6].map((gap) => s.roadHalf + gap + WAYSIDE_PAD / 2);
  const sites: WaysideSite[] = [];
  const specs: StructureSpec[] = [];
  /** The rise of a platform's footprint over the road edge, sampled on a `n` x `n` grid (coarse for the search, 1 m for the result). */
  const rise = (at: number, side: 1 | -1, offset: number, n: number): number => {
    const c = s.road.point(at, side * offset);
    const edge = s.road.point(at, side * s.roadHalf);
    return footprintMax(s.h, c.x, c.z, WAYSIDE_PAD + 2, WAYSIDE_PAD + 2, n) - s.h(edge.x, edge.z);
  };
  waysideTargets(shelterS, anvilS, s.road.length).forEach((want, i) => {
    // Pads are chosen in order, each at least WAYSIDE_MIN_GAP of road past the one before and on its side of the Anvil.
    const lo = Math.max(sites.length ? sites[sites.length - 1]!.s + WAYSIDE_MIN_GAP : shelterS + SHELTER_CLEAR, i < 3 ? 0 : anvilS + ANVIL_CLEAR);
    const hi = i < 3 ? anvilS - ANVIL_CLEAR : s.road.length;
    const search = (ds: readonly number[], centre: number, n: number) => {
      let best: { score: number; s: number; side: 1 | -1; offset: number } | null = null;
      for (const d of ds) {
        const at = centre + d;
        if (at < lo || at > hi) continue;
        for (const side of [1, -1] as const) {
          for (const offset of offsets) {
            const score = Math.abs(rise(at, side, offset, n)) + Math.abs(at - want) * 0.0005 + (offset - offsets[0]!) * 0.01;
            if (!best || score < best.score) best = { score, s: at, side, offset };
          }
        }
      }
      return best;
    };
    const coarse = search(COARSE, want, 4);
    if (!coarse) throw new Error(`dragonspine: no room for wayside pad ${i + 1} (needs road between ${Math.round(lo)} and ${Math.round(hi)})`);
    const best = search(slides(2.5, 10), coarse.s, 0)!;
    const c = s.road.point(best.s, best.side * best.offset);
    const spec = solid(`dragonspine-wayside-pad-${i + 1}`, 'rock', c.x, c.z, WAYSIDE_PAD, WAYSIDE_PAD, WAYSIDE_PAD_HEIGHT);
    const top = footprintMax(s.h, c.x, c.z, WAYSIDE_PAD + 2, WAYSIDE_PAD + 2) + WAYSIDE_PAD_HEIGHT;
    specs.push(spec);
    sites.push({ index: i + 1, s: best.s, x: spec.x, z: spec.z, side: best.side, dy: top - s.h(spec.x, spec.z) });
  });
  const hawk = (id: string, i: number) => {
    const w = sites[i]!;
    const p = s.road.point(w.s + 20, -w.side * (s.roadHalf + 14));
    return a(id, p.x, p.z, 0, ['spawn']);
  };
  const post = (n: number, i: number) => {
    const w = sites[i]!;
    const p = s.road.point(w.s - 6, -w.side * (s.roadHalf + 1.5));
    return a(`npc-post.pilgrim-${n}`, p.x, p.z, 0, ['npc-post']);
  };
  const part: Part = {
    ...emptyPart(),
    anchors: [
      ...sites.map((w) => a(`dragonspine.wayside.${w.index}`, w.x, w.z, 0, ['objective'], { onStructure: `dragonspine-wayside-pad-${w.index}`, dy: w.dy })),
      hawk('dragonspine.spawn.wayside.hawk-a', 1),
      hawk('dragonspine.spawn.wayside.hawk-b', 4),
      post(1, 1),
      post(2, 4),
    ],
    triggers: [],
    structures: specs,
  };
  return { part, info: { sites, specs } };
}
