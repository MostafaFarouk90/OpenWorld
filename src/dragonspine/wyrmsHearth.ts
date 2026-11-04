// The Wyrm's Hearth (PR 2) on K1's wyrms-hearth plateau: a black-glass amphitheatre (low glass tiers in two arcs, east and west,
// leaving the south entry and the north rim open), the hearth basin round the shrine site `dragonspine.hearth.shrine` (K9 PR 2
// builds the shrine and its rekindle), `waystone.wyrms-hearth` beside it, the keeper-stone (M32's shard), four hearth carvings and
// two glide markers (M34's searches), the hoard (M32's searches; the R16 axe lies on it after `give`, see worldChanges.ts),
// Ysmeryth's resting perch and scene marks (`dragonspine.hearth.ysmeryth.*`, K6a PR 2 and K13), Eadgyth's wait post and the
// companions' marks. Nothing stands in a launch run.
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, headingTo, open, polar, solid, sphere, type Part } from './helpers';
import type { XZ } from './inputs';
import { Placer } from './placer';
import type { Road } from './road';
import { clearOfRuns, forwardOf, type SummitSites } from './summitSites';

/** The shrine clearing K9 builds in: nothing of mine but the open basin stands within it. */
export const SHRINE_CLEAR = 16;
export const BASIN = 18;
/** The tiers: three rows, each 0.35 m higher than the one inside it, in arcs of 12-degree segments. */
export const TIER_ROWS = 3;
export const TIER_STEP = 0.35;
export const TIER_DEPTH = 2.8;
export const TIER_PITCH = 3.4;
const TIER_ARCS: ReadonlyArray<readonly [number, number]> = [
  [40, 140],
  [220, 320],
];
const CARVING_AT = [200, 250, 290, 335];

export interface HearthInfo {
  centre: XZ;
  entry: XZ;
  shrine: XZ;
  keeperStone: XZ;
  hoard: XZ;
  hoardSpot: XZ;
  /** The three hoard searches, in the order a player walks them. */
  hoardSearches: XZ[];
  carvings: XZ[];
  glideMarkers: XZ[];
  perch: StructureSpec;
  waystone: XZ;
  specs: StructureSpec[];
}

const fail = (msg: string): never => {
  throw new Error(`dragonspine: ${msg}`);
};

export function wyrmsHearthLayout(s: SummitSites, pass: Road, roadClear: number): { part: Part; info: HearthInfo } {
  const H = s.hearth;
  const C = { x: H.cx, z: H.cz };
  const placer = new Placer({ minX: H.minX + 3, maxX: H.maxX - 3, minZ: H.minZ + 3, maxZ: H.maxZ - 3 }, pass, roadClear);
  const runCheck = (spec: StructureSpec): StructureSpec => (clearOfRuns(spec, s.runs) ? spec : fail(`"${spec.id}" stands in a launch run`));
  const basin = placer.add(open('dragonspine-hearth-basin', 'dragonspine-hearth-basin', C.x, C.z, BASIN, BASIN));
  placer.reserve(C.x, C.z, SHRINE_CLEAR);

  // The amphitheatre: segments of three rows, skipped where a run or the plateau edge would cut them.
  const r0 = Math.min(H.w, H.d) * 0.275;
  const tiers: StructureSpec[] = [];
  for (let k = 0; k < TIER_ROWS; k++) {
    const r = r0 + k * TIER_PITCH;
    const len = 2 * r * Math.sin((5.5 * Math.PI) / 180);
    for (const [from, to] of TIER_ARCS) {
      for (let b = from + 6; b <= to - 6; b += 12) {
        const [x, z] = polar(C.x, C.z, b, r);
        const spec = solid(`dragonspine-hearth-tier-${k + 1}-${b}`, 'dragonspine-glass-tier', x, z, len, TIER_DEPTH, TIER_STEP * (k + 1), b % 360);
        if (!clearOfRuns(spec, s.runs)) continue;
        tiers.push(placer.add(spec));
      }
    }
  }
  if (tiers.length < 12) fail(`the Wyrm's Hearth has room for only ${tiers.length} glass tiers`);

  const stone = placer.place('dragonspine-waystone-wyrms-hearth', 'waystone', { x: C.x + 24, z: C.z - 20 }, 1.6, 1.6, { height: 2.4, margin: 3 });
  const keeper = runCheck(placer.place('dragonspine-hearth-keeper-stone', 'dragonspine-keeper-stone', { x: C.x - 28, z: C.z + 28 }, 1.6, 1.2, { height: 2.6, margin: 2 }));
  const hoardSpec = runCheck(placer.place('dragonspine-hearth-hoard', 'dragonspine-hoard', { x: C.x + 30, z: C.z + 36 }, 8, 6, { mode: 'open', margin: 3 }));
  const hoard = { x: hoardSpec.x, z: hoardSpec.z };
  const carvingR = Math.min(H.w, H.d) / 2 - 14;
  const carvings = CARVING_AT.map((b, i) => {
    const [x, z] = polar(C.x, C.z, b, carvingR);
    return runCheck(placer.place(`dragonspine-hearth-carving-${i + 1}`, 'dragonspine-carving', { x, z }, 1.4, 0.6, { height: 2.2, margin: 2, yawDeg: b % 360 }));
  });
  // Glide markers (M34): a cairn beside the summit-skyhold and hearth-updraft lips, on the plateau and off the runs.
  const glideMarkers = (['summit-skyhold', 'hearth-updraft'] as const).map((id, i) => {
    const l = s.ledges[id];
    const f = forwardOf(l);
    const want = { x: l.ledge.x - f.x * 6 - f.z * 12, z: l.ledge.z - f.z * 6 + f.x * 12 };
    return runCheck(placer.place(`dragonspine-hearth-glide-marker-${i + 1}`, 'dragonspine-glide-marker', want, 1.2, 1.2, { mode: 'open', margin: 1 }));
  });
  const perch = placer.place('dragonspine-hearth-perch', 'rock', { x: H.maxX - 16, z: H.maxZ - 14 }, 12, 10, { height: 5, margin: 2 });

  const toward = (p: XZ, d: number): XZ => {
    const l = Math.hypot(C.x - p.x, C.z - p.z) || 1;
    return { x: p.x + ((C.x - p.x) / l) * d, z: p.z + ((C.z - p.z) / l) * d };
  };
  const entry = { x: pass.points[pass.points.length - 1]![0], z: pass.points[pass.points.length - 1]![1] };
  const keeperAt = { x: keeper.x, z: keeper.z - 2.4 };
  const hoardAt = { x: hoard.x, z: hoard.z - 5 };
  const eadgyth = { x: C.x - 14, z: H.minZ + 18 };
  const hoardSearches = [
    { x: hoard.x - 6, z: hoard.z },
    { x: hoard.x, z: hoard.z + 5 },
    { x: hoard.x + 6, z: hoard.z },
  ];
  const anchors = [
    a('dragonspine.hearth.shrine', C.x, C.z, 180, ['objective']),
    a('waystone.wyrms-hearth', stone.x, stone.z - 1.8, 0, ['waystone']),
    a('dragonspine.hearth.entry', entry.x, entry.z + 6, 0, ['poi']),
    a('dragonspine.hearth.keeper-stone', keeperAt.x, keeperAt.z, 0, ['objective']),
    a('dragonspine.hearth.hoard', hoardAt.x, hoardAt.z, 0, ['objective']),
    a('dragonspine.hearth.axe', hoard.x + 1.5, hoard.z - 4, 0, ['objective']),
    // The hoard's searches: the gold, the crown-smith's hammer, the broken chain.
    ...hoardSearches.map((p, i) => a(`dragonspine.hearth.hoard.search.${i + 1}`, p.x, p.z, headingTo(p.x, p.z, hoard.x, hoard.z), ['objective'])),
    ...carvings.map((c, i) => {
      const p = toward(c, 2.5);
      return a(`dragonspine.hearth.carving.${i + 1}`, p.x, p.z, headingTo(p.x, p.z, c.x, c.z), ['objective']);
    }),
    ...glideMarkers.map((g, i) => {
      const p = toward(g, 2.2);
      return a(`dragonspine.hearth.glide-marker.${i + 1}`, p.x, p.z, headingTo(p.x, p.z, g.x, g.z), ['objective']);
    }),
    a('dragonspine.hearth.ysmeryth.perch', perch.x, perch.z, 225, ['poi', 'elevated'], { onStructure: perch.id, dy: 5 }),
    a('dragonspine.hearth.ysmeryth.land', C.x, C.z + H.d * 0.2, 180, ['poi']),
    a('dragonspine.hearth.ysmeryth.reveal', C.x + 18, C.z + 18, 225, ['poi']),
    a('dragonspine.hearth.ysmeryth.oath', C.x, C.z + 22, 180, ['poi']),
    a('dragonspine.hearth.eadgyth', eadgyth.x, eadgyth.z, 0, ['npc-post']),
    ...[-4, 0, 4].map((dx, i) => a(`dragonspine.hearth.companion.${i + 1}`, eadgyth.x - 8 + dx, eadgyth.z - 3, 0, ['poi'])),
  ];
  const part: Part = {
    ...emptyPart(),
    anchors,
    triggers: [sphere('trg.dragonspine.hearth', C.x, C.z, Math.min(H.w, H.d) / 2), sphere('trg.dragonspine.hearth.hoard', hoard.x, hoard.z, 12)],
    structures: [basin, ...tiers, stone, keeper, hoardSpec, ...carvings, ...glideMarkers, perch],
  };
  return {
    part,
    info: { centre: C, entry, shrine: C, keeperStone: keeperAt, hoard: hoardAt, hoardSpot: hoard, hoardSearches, carvings: carvings.map((c) => toward(c, 2.5)), glideMarkers: glideMarkers.map((g) => toward(g, 2.2)), perch, waystone: { x: stone.x, z: stone.z - 1.8 }, specs: part.structures },
  };
}
