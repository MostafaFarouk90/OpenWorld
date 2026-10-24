// R17's six wayside shrine sites along the Rime Pass: three between the shelter and the Last Anvil, three between the Anvil and
// the summit gate, about 300 m of road apart. Each is a built stone platform on the road verge (no terrain edits: K1 owns the
// ground), its top level with the road edge, and an anchor on it. K9 builds the shrines.
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, solid, type Part } from './helpers';
import { footprintMax } from './fit';
import { ROAD_HALF_WIDTH, type Sites } from './sites';

export const WAYSIDE_PAD = 8;
/** The platform's height above the highest ground under it. */
export const WAYSIDE_PAD_HEIGHT = 0.2;
const SLIDE = [0, 10, -10, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60];

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

/** The sites are about this far apart on the road (the plan's 300 m); closer when the stretch is short. */
export const WAYSIDE_SPACING = 300;

/** Where the six sites want to be on the road: three each side of the Anvil, `WAYSIDE_SPACING` apart (squeezed to fit the stretch). */
export function waysideTargets(shelterS: number, anvilS: number, roadEnd: number): number[] {
  const gap = Math.min(WAYSIDE_SPACING, (anvilS - shelterS - 100) / 3, (roadEnd - anvilS - 60) / 3);
  return [1, 2, 3, 4, 5, 6].map((i) => (i <= 3 ? anvilS - gap * (4 - i) : anvilS + gap * (i - 3)));
}

export function waysideLayout(s: Sites, shelterS: number, anvilS: number): { part: Part; info: WaysideInfo } {
  const offset = ROAD_HALF_WIDTH + 0.5 + WAYSIDE_PAD / 2;
  const sites: WaysideSite[] = [];
  const specs: StructureSpec[] = [];
  waysideTargets(shelterS, anvilS, s.road.length).forEach((want, i) => {
    let best: { score: number; s: number; side: 1 | -1 } | null = null;
    for (const ds of SLIDE) {
      const at = Math.min(Math.max(want + ds, 0), s.road.length);
      for (const side of [1, -1] as const) {
        const c = s.road.point(at, side * offset);
        const edge = s.road.point(at, side * ROAD_HALF_WIDTH);
        const rise = footprintMax(s.h, c.x, c.z, WAYSIDE_PAD + 2, WAYSIDE_PAD + 2) - s.h(edge.x, edge.z);
        const score = Math.abs(rise) + Math.abs(ds) * 0.002;
        if (!best || score < best.score) best = { score, s: at, side };
      }
    }
    const c = s.road.point(best!.s, best!.side * offset);
    const spec = solid(`dragonspine-wayside-pad-${i + 1}`, 'rock', c.x, c.z, WAYSIDE_PAD, WAYSIDE_PAD, WAYSIDE_PAD_HEIGHT);
    const top = footprintMax(s.h, c.x, c.z, WAYSIDE_PAD + 2, WAYSIDE_PAD + 2) + WAYSIDE_PAD_HEIGHT;
    specs.push(spec);
    sites.push({ index: i + 1, s: best!.s, x: spec.x, z: spec.z, side: best!.side, dy: top - s.h(spec.x, spec.z) });
  });
  const hawk = (id: string, i: number) => {
    const w = sites[i]!;
    const p = s.road.point(w.s + 20, -w.side * (ROAD_HALF_WIDTH + 14));
    return a(id, p.x, p.z, 0, ['spawn']);
  };
  const post = (n: number, i: number) => {
    const w = sites[i]!;
    const p = s.road.point(w.s - 6, -w.side * (ROAD_HALF_WIDTH + 1.5));
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
