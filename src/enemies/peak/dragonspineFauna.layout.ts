// The Dragonspine's ambient spawn anchors (K6b PR 2, owned sub-prefix `dragonspine.fauna.` under K4's `dragonspine.`).
// Anchors only: one per group member, in a small ring around the group's centre, each centre an offset from one of K1's
// plateau centres or road points. Plain data; DRAGONSPINE_FAUNA_ANCHORS.md is generated from it by tools/gen-region-docs.ts.
import type { AnchorSpec, LayoutData } from '../../region/layoutTypes';
import { DEEPGATE_TRACK_POINTS, DRAGONSPINE_SITES, SPINE_ROAD_EAST_POINTS } from '../../terrain/shape/dragonspine';

export const DRAGONSPINE_FAUNA_DOC = { title: 'Dragonspine ambient spawn anchors (K6b)', source: 'enemies/peak/dragonspineFauna.layout.ts' } as const;

const pt = (p: readonly [number, number]) => ({ x: p[0], z: p[1] });

/** The places the fauna is placed from: K1's plateau centres and road points. Nothing else in K6b names a position. */
const SITES = {
  lodge: DRAGONSPINE_SITES.wyrmwatchLodge,
  shelter: DRAGONSPINE_SITES.rimePassShelter,
  anvil: DRAGONSPINE_SITES.lastAnvil,
  hawkCliffs: DRAGONSPINE_SITES.hawkCliffsFoot,
  cave: DRAGONSPINE_SITES.collapsedCave,
  crag: DRAGONSPINE_SITES.m28Crag,
  summitGate: DRAGONSPINE_SITES.summitGate,
  hearth: DRAGONSPINE_SITES.wyrmsHearth,
  skyhold: DRAGONSPINE_SITES.skyholdTop,
  aerie: DRAGONSPINE_SITES.frostfangAerie,
  /** Where the Spine Road enters the Dragonspine (the Dragonspine-first arrival from the fen). */
  spineEntry: pt(SPINE_ROAD_EAST_POINTS[2]!),
  /** The Deepgate Track's first point inside the Dragonspine (the arrival from Deepgate). */
  deepgateEntry: pt(DEEPGATE_TRACK_POINTS.find(([x]) => x <= 16500)!),
} as const;

export type DragonspineSiteId = keyof typeof SITES;

export function dragonspineSite(id: DragonspineSiteId): { x: number; z: number } {
  const s = SITES[id];
  return { x: s.x, z: s.z };
}

/** The two first-arrival points (6.1): the Spine Road's entry and the Deepgate Track's. */
export const DS_ARRIVAL_SITES: readonly DragonspineSiteId[] = ['spineEntry', 'deepgateEntry'];

export type PeakFaunaKind = 'hawks' | 'ogres' | 'hunters' | 'wyrm';

/** One ambient group: its id (the anchor middle part), kind, site and offset, members, and where it stands. */
export interface PeakFaunaGroup {
  id: string;
  kind: PeakFaunaKind;
  site: DragonspineSiteId;
  dx: number;
  dz: number;
  count: number;
  /** `summit`: inside the summit area (K0's `area: 'dragonspine-summit'`, the Q9 cap); else the `dragonspine-lower` block. */
  summit?: boolean;
  /** First-arrival groups roll at most L + 1 (`SpawnerDef.blockSpan`). */
  firstArrival?: boolean;
  /** A lone hawk perched on its own nest (its anchor). */
  nest?: boolean;
}

export const DRAGONSPINE_FAUNA_GROUPS: readonly PeakFaunaGroup[] = [
  // Lower slopes: hawk pairs soaring over the Spine Road, the west ridge, Rime Pass east and the Anvil approach, and two
  // lone hawks on crag nests.
  { id: 'hawks.spine-road', kind: 'hawks', site: 'spineEntry', dx: 450, dz: 0, count: 2, firstArrival: true },
  { id: 'hawks.west-ridge', kind: 'hawks', site: 'hawkCliffs', dx: 600, dz: -300, count: 2 },
  { id: 'hawks.rime-pass-east', kind: 'hawks', site: 'shelter', dx: 350, dz: -250, count: 2 },
  { id: 'hawks.anvil-approach', kind: 'hawks', site: 'anvil', dx: -400, dz: -600, count: 2 },
  { id: 'hawk.crag-nest-west', kind: 'hawks', site: 'lodge', dx: -1000, dz: 500, count: 1, nest: true },
  { id: 'hawk.crag-nest-east', kind: 'hawks', site: 'lodge', dx: 1300, dz: 400, count: 1, nest: true },
  // Lone ogres on the crag's north shoulder, the cave road, and between the shelter and the Anvil.
  { id: 'ogre.crag-shoulder', kind: 'ogres', site: 'crag', dx: 0, dz: 250, count: 1 },
  { id: 'ogre.cave-road', kind: 'ogres', site: 'cave', dx: 250, dz: -250, count: 1 },
  { id: 'ogre.shelter-anvil', kind: 'ogres', site: 'shelter', dx: 850, dz: 300, count: 1 },
  // Hunter camps: three spearmen and a harpooner (the pack leader).
  { id: 'hunters.deepgate-track', kind: 'hunters', site: 'deepgateEntry', dx: -150, dz: 400, count: 4, firstArrival: true },
  { id: 'hunters.east-ridge', kind: 'hunters', site: 'anvil', dx: 800, dz: -600, count: 4 },
  { id: 'hunters.below-gate', kind: 'hunters', site: 'summitGate', dx: 400, dz: -300, count: 4 },
  // Ember Wyrm roosts on the west and east ridges (not K6a's lodge towers or K1's roost shelf).
  { id: 'wyrm.west-ridge', kind: 'wyrm', site: 'cave', dx: -700, dz: 500, count: 1 },
  { id: 'wyrm.east-ridge', kind: 'wyrm', site: 'anvil', dx: 1500, dz: 0, count: 1 },
  // The summit: hawks over Skyhold and the Aerie's west lip, an ogre pair on the road below the Wyrm's Hearth, and two
  // wyrms by the Aerie (coordinator change E: none on the Hearth's rim; both sent off while Skarl's fight is armed).
  { id: 'hawks.skyhold', kind: 'hawks', site: 'skyhold', dx: 0, dz: 150, count: 2, summit: true },
  { id: 'hawks.aerie-west', kind: 'hawks', site: 'aerie', dx: -500, dz: 0, count: 2, summit: true },
  { id: 'ogres.summit-road', kind: 'ogres', site: 'summitGate', dx: 200, dz: 350, count: 2, summit: true },
  { id: 'wyrm.aerie-south', kind: 'wyrm', site: 'aerie', dx: 0, dz: -450, count: 1, summit: true },
  { id: 'wyrm.aerie-east', kind: 'wyrm', site: 'aerie', dx: 600, dz: 50, count: 1, summit: true },
];

/** Members stand on a ring of this radius around the group centre (a single member stands at the centre). */
const RING = 4;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function peakGroupCentre(g: PeakFaunaGroup): { x: number; z: number } {
  const s = dragonspineSite(g.site);
  return { x: s.x + g.dx, z: s.z + g.dz };
}

/** The anchor id of member `n` (1-based) of a group. */
export function peakFaunaAnchorId(group: string, n: number): string {
  return `dragonspine.fauna.${group}.${n}`;
}

function memberAnchors(g: PeakFaunaGroup): AnchorSpec[] {
  const c = peakGroupCentre(g);
  const out: AnchorSpec[] = [];
  for (let i = 0; i < g.count; i++) {
    const a = (i / g.count) * Math.PI * 2;
    const r = g.count === 1 ? 0 : RING;
    out.push({ id: peakFaunaAnchorId(g.id, i + 1), x: r2(c.x + Math.cos(a) * r), z: r2(c.z + Math.sin(a) * r), yawDeg: 0, tags: ['fauna', g.kind] });
  }
  return out;
}

export const DRAGONSPINE_FAUNA_LAYOUT: LayoutData = {
  anchors: DRAGONSPINE_FAUNA_GROUPS.flatMap(memberAnchors),
  triggers: [],
  structures: [],
  patrols: [],
  npcs: [],
  fields: [],
};
