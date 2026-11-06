// The Ashen Waste's ambient spawn anchors (Act 4 L5, plans/act4-L5.md section 6; owned sub-prefix `waste.fauna.` under
// L1's `waste.`). Anchors only: one per group member, on a small ring round the group centre. Each centre is a point on
// one of L1's rope-lines (an arc fraction along it) pushed off to one side, or an offset from one of L1's places, so
// nothing here names an absolute position. Plain data; WASTE_FAUNA_ANCHORS.md is generated from it by
// tools/gen-region-docs.ts.
import type { AnchorSpec, LayoutData } from '../../region/layoutTypes';
import { pointAt } from '../../region/act4/ropeLines';
import { ROPE_POINTS, type RopeLineId, GLASSLANDS, HUSK_CATHEDRAL, RIMFOOT } from '../../terrain/shape/waste';
import { wastePoi } from '../../waste/wasteSites';

export const WASTE_FAUNA_DOC = { title: 'Ashen Waste ambient spawn anchors (L5)', source: 'enemies/waste/wasteFauna.layout.ts' } as const;

export type WasteFaunaKind = 'striders' | 'husks' | 'hounds' | 'gnats' | 'golems' | 'husk-knight';

/** Where a group stands: along a rope-line (`at` 0..1 of its length, `off` metres to its right, negative to its left), or off a place. */
export type WasteFaunaSite =
  | { line: RopeLineId; at: number; off: number }
  | { place: 'glasslands' | 'husk-cathedral' | 'rimfoot'; dx: number; dz: number }
  | { poi: string; dx: number; dz: number };

export interface WasteFaunaGroup {
  id: string;
  kind: WasteFaunaKind;
  site: WasteFaunaSite;
  count: number;
  /** First-arrival groups cap at P + 2 (L0's `SpawnerDef.firstArrival`). */
  firstArrival?: boolean;
}

const PLACES = { glasslands: GLASSLANDS, 'husk-cathedral': HUSK_CATHEDRAL, rimfoot: RIMFOOT } as const;

/**
 * The ambient groups (section 6, with L11's 18:00 asks folded in: no group near M42's line past the arrival, none at the
 * chapel's nest, the cathedral's knight clear of the dying walker by the door, the Glasslands' gnats clear of the strike
 * stone). Strider herds hold the dune flanks, wraith knots the burned ground, gnats the glass flats and Rimfoot, golems the
 * cathedral approach, and a Husk Knight with husks before the cathedral and at the Glasslands line's east end.
 */
export const WASTE_FAUNA_GROUPS: readonly WasteFaunaGroup[] = [
  // The first group on the Cinder Road North out of Ashgate (husks, P + 2).
  { id: 'arrival.cinder-road', kind: 'husks', site: { line: 'rope.cinder-road-north', at: 0.12, off: 70 }, count: 3, firstArrival: true },
  // Strider herds on the dunes.
  { id: 'dunes.1', kind: 'striders', site: { line: 'rope.cinder-road-north', at: 0.3, off: -110 }, count: 3 },
  { id: 'dunes.2', kind: 'striders', site: { line: 'rope.camp-crossing', at: 0.35, off: 120 }, count: 3 },
  { id: 'dunes.3', kind: 'striders', site: { line: 'rope.camp-crossing', at: 0.75, off: -110 }, count: 3 },
  { id: 'dunes.4', kind: 'striders', site: { line: 'rope.camp-chapel', at: 0.35, off: 120 }, count: 3 },
  { id: 'dunes.5', kind: 'striders', site: { line: 'rope.camp-chapel', at: 0.7, off: -120 }, count: 3 },
  { id: 'dunes.6', kind: 'striders', site: { line: 'rope.crossing-glasslands', at: 0.3, off: 120 }, count: 3 },
  { id: 'dunes.7', kind: 'striders', site: { line: 'rope.crossing-glasslands', at: 0.6, off: -120 }, count: 3 },
  // Wraith knots (husks) on the burned ground by the Camp-Chapel line and the Glasslands-Cathedral line.
  { id: 'burned.1', kind: 'husks', site: { line: 'rope.camp-chapel', at: 0.55, off: 90 }, count: 4 },
  { id: 'burned.2', kind: 'husks', site: { line: 'rope.glasslands-cathedral', at: 0.45, off: 100 }, count: 4 },
  // Ember Hound packs on the Camp-Crossing dunes.
  { id: 'hounds.1', kind: 'hounds', site: { line: 'rope.camp-crossing', at: 0.55, off: 130 }, count: 3 },
  { id: 'hounds.2', kind: 'hounds', site: { line: 'rope.cinder-road-north', at: 0.62, off: 120 }, count: 3 },
  // Gnats on the glass flats (100 m and more from the shrine, so clear of the strike stone) and at Rimfoot's approach.
  { id: 'glass.gnats.1', kind: 'gnats', site: { place: 'glasslands', dx: -130, dz: -100 }, count: 1 },
  { id: 'glass.gnats.2', kind: 'gnats', site: { place: 'glasslands', dx: 120, dz: -90 }, count: 1 },
  { id: 'glass.gnats.3', kind: 'gnats', site: { place: 'glasslands', dx: -60, dz: 150 }, count: 1 },
  { id: 'glass.gnats.4', kind: 'gnats', site: { place: 'glasslands', dx: 160, dz: 110 }, count: 1 },
  { id: 'rimfoot.gnats.1', kind: 'gnats', site: { place: 'rimfoot', dx: -210, dz: -110 }, count: 1 },
  { id: 'rimfoot.gnats.2', kind: 'gnats', site: { place: 'rimfoot', dx: 130, dz: -170 }, count: 1 },
  // L1's points of interest (PR 2): husk knots in the three burned villages round the Cinder Chapel (14 m off each centre,
  // clear of the hearth L11's R25 lights), and a strider herd in the strider nest's ring of ribs.
  { id: 'village.shell.1', kind: 'husks', site: { poi: 'burned-village.1', dx: -12, dz: 8 }, count: 4 },
  { id: 'village.shell.2', kind: 'husks', site: { poi: 'burned-village.2', dx: 10, dz: -10 }, count: 4 },
  { id: 'village.shell.3', kind: 'husks', site: { poi: 'burned-village.3', dx: -10, dz: -10 }, count: 4 },
  { id: 'dunes.nest', kind: 'striders', site: { poi: 'strider-nest', dx: 0, dz: 0 }, count: 3 },
  // The cathedral's approach: golems on the road south, then the Husk Knight and its husks 90 m before the door.
  { id: 'cathedral.golems', kind: 'golems', site: { line: 'rope.glasslands-cathedral', at: 0.82, off: 60 }, count: 3 },
  { id: 'cathedral.knight', kind: 'husk-knight', site: { place: 'husk-cathedral', dx: -90, dz: -60 }, count: 4 },
  { id: 'glass.knight', kind: 'husk-knight', site: { line: 'rope.crossing-glasslands', at: 0.85, off: 90 }, count: 3 },
];

/** Members stand on a ring of this radius round the group centre (a single member stands at the centre). */
const RING = 4;
const r2 = (n: number): number => Math.round(n * 100) / 100;

export function wasteGroupCentre(g: WasteFaunaGroup): { x: number; z: number } {
  const s = g.site;
  if ('poi' in s) {
    const p = wastePoi(s.poi).at;
    return { x: r2(p[0] + s.dx), z: r2(p[1] + s.dz) };
  }
  if ('place' in s) {
    const p = PLACES[s.place];
    return { x: r2(p[0] + s.dx), z: r2(p[1] + s.dz) };
  }
  const pts = ROPE_POINTS[s.line];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  const p = pointAt(pts, total * s.at);
  // The tangent (dx, dz) turned a quarter clockwise seen from above is the line's right.
  const len = Math.hypot(p.dx, p.dz) || 1;
  const rx = -p.dz / len;
  const rz = p.dx / len;
  return { x: r2(p.x + rx * s.off), z: r2(p.z + rz * s.off) };
}

/** The anchor id of member `n` (1-based) of a group. */
export function wasteFaunaAnchorId(group: string, n: number): string {
  return `waste.fauna.${group}.${n}`;
}

function memberAnchors(g: WasteFaunaGroup): AnchorSpec[] {
  const c = wasteGroupCentre(g);
  const out: AnchorSpec[] = [];
  for (let i = 0; i < g.count; i++) {
    const a = (i / g.count) * Math.PI * 2;
    const r = g.count === 1 ? 0 : RING;
    out.push({ id: wasteFaunaAnchorId(g.id, i + 1), x: r2(c.x + Math.cos(a) * r), z: r2(c.z + Math.sin(a) * r), yawDeg: 0, tags: ['fauna', g.kind] });
  }
  return out;
}

export const WASTE_FAUNA_LAYOUT: LayoutData = {
  anchors: WASTE_FAUNA_GROUPS.flatMap(memberAnchors),
  triggers: [],
  structures: [],
  patrols: [],
  npcs: [],
  fields: [],
};
