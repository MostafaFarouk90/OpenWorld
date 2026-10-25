// The Greyfen's ambient spawn anchors (K6b, sub-prefix `greyfen.fauna.`; coordinator ruling B, K3 confirmed it will not use it).
// Anchors only: one per group member, in a small ring around the group's centre, each centre an offset from a named site.
// Plain data; GREYFEN_FAUNA_ANCHORS.md is generated from it by tools/gen-region-docs.ts (drift-tested).
import type { AnchorSpec, LayoutData } from '../../region/layoutTypes';

export const GREYFEN_FAUNA_DOC = { title: 'Greyfen ambient spawn anchors (K6b)', source: 'enemies/fen/greyfenFauna.layout.ts' } as const;

/**
 * The Greyfen sites the fauna is placed from (engine metres). **Provisional:** these are the plan's Part 3.5 positions and
 * K6b's points of interest; when K1 publishes `ACT3_PLATEAUS` and K2 its POI anchors, `greyfenSite` reads them instead and
 * only this table changes. Nothing else in K6b names a position.
 */
const SITES = {
  reedgate: [3200, 10200],
  mere: [3000, 12500],
  mereShrine: [3000, 12050],
  mireweather: [5600, 12300],
  greywatch1: [1200, 13900],
  greywatch2: [2300, 14300],
  greywatch3: [3500, 14500],
  greywatch4: [4400, 14100],
  sunkenChapel: [2600, 14700],
  mirewaterDeeps: [2300, 12000],
  /** Where the Spine Road enters the fen (the Greyfen-second first arrival). */
  spineEdge: [6500, 12800],
  /** Where the Fen Road enters the fen box (the Greyfen-first approach). */
  fenRoadCorner: [6300, 9400],
  // K6b's points of interest, until K2's templates publish theirs.
  reedIsland: [1500, 12900],
  peatCutting: [4200, 11000],
  stiltCamp: [1800, 11200],
  drownedChurch: [1000, 14800],
} as const satisfies Record<string, readonly [number, number]>;

export type GreyfenSiteId = keyof typeof SITES;

/** A Greyfen site's position (engine metres). */
export function greyfenSite(id: GreyfenSiteId): { x: number; z: number } {
  const [x, z] = SITES[id];
  return { x, z };
}

/** The Mere's deep water (not swimmable, plan 3.5): no ambient group stands inside it. */
export const MERE_DEEP_RADIUS = 400;

/** The quest sites ambient groups keep 150 m from (K3's quest-only spawns are at these; refined when K3's sites.ts lands). */
export const QUEST_SITES: readonly GreyfenSiteId[] = [
  'reedgate', 'mereShrine', 'mireweather', 'greywatch1', 'greywatch2', 'greywatch3', 'greywatch4', 'sunkenChapel', 'mirewaterDeeps',
];

/** The two first-arrival points (6.1): Reedgate (Greyfen first) and the Spine Road's fen edge (Greyfen second). */
export const ARRIVAL_SITES: readonly GreyfenSiteId[] = ['reedgate', 'spineEdge'];

/** The Fen Road's last leg inside the fen, corner to Reedgate (the road the fauna keeps off); K1's polyline replaces it. */
export const FEN_ROAD_PROXY: readonly (readonly [number, number])[] = [SITES.fenRoadCorner, SITES.reedgate];

export type FaunaKind = 'leech' | 'shambler' | 'hunters' | 'wraiths';

/** One ambient group: its id (the anchor middle part), kind, site and offset from it, member count. */
export interface FaunaGroup {
  id: string;
  kind: FaunaKind;
  site: GreyfenSiteId;
  dx: number;
  dz: number;
  count: number;
  /** First-arrival groups roll at most L + 1 (`SpawnerDef.blockSpan`). */
  firstArrival?: boolean;
}

export const GREYFEN_FAUNA_GROUPS: readonly FaunaGroup[] = [
  // Leech knots: causeway verges, the Mere's shallows, the Greywatch and Mireweather causeways, the reed island.
  { id: 'leech.reedgate-causeway', kind: 'leech', site: 'reedgate', dx: -50, dz: 450, count: 3, firstArrival: true },
  { id: 'leech.mere-causeway', kind: 'leech', site: 'reedgate', dx: -100, dz: 950, count: 3 },
  { id: 'leech.mere-west', kind: 'leech', site: 'mere', dx: -460, dz: 0, count: 3 },
  { id: 'leech.mere-east', kind: 'leech', site: 'mere', dx: 460, dz: 0, count: 3 },
  { id: 'leech.mere-north', kind: 'leech', site: 'mere', dx: 0, dz: 460, count: 3 },
  { id: 'leech.greywatch-causeway', kind: 'leech', site: 'greywatch2', dx: 600, dz: 100, count: 3 },
  { id: 'leech.mireweather-causeway', kind: 'leech', site: 'mireweather', dx: -1300, dz: 100, count: 3 },
  { id: 'leech.reed-island', kind: 'leech', site: 'reedIsland', dx: 0, dz: 0, count: 3 },
  { id: 'leech.west-fen', kind: 'leech', site: 'stiltCamp', dx: -1200, dz: 300, count: 3 },
  { id: 'leech.north-east-reeds', kind: 'leech', site: 'mireweather', dx: -700, dz: 1100, count: 3 },
  // Shambler bogs (each registers its own peat patch).
  { id: 'shambler.peat-cutting', kind: 'shambler', site: 'peatCutting', dx: 0, dz: 0, count: 1 },
  { id: 'shambler.mere-east-a', kind: 'shambler', site: 'mere', dx: 900, dz: 400, count: 1 },
  { id: 'shambler.mere-east-b', kind: 'shambler', site: 'mere', dx: 700, dz: -700, count: 1 },
  { id: 'shambler.mireweather-north', kind: 'shambler', site: 'mireweather', dx: 0, dz: 800, count: 1 },
  { id: 'shambler.church-bog', kind: 'shambler', site: 'drownedChurch', dx: -300, dz: -600, count: 1 },
  // Hunter camps: three spearmen and a harpooner (the pack leader).
  { id: 'hunters.stilt-camp', kind: 'hunters', site: 'stiltCamp', dx: 0, dz: 0, count: 4 },
  { id: 'hunters.north-reeds', kind: 'hunters', site: 'greywatch4', dx: -500, dz: -400, count: 4 },
  { id: 'hunters.east-edge', kind: 'hunters', site: 'spineEdge', dx: -450, dz: 50, count: 4, firstArrival: true },
  { id: 'hunters.south-west-reeds', kind: 'hunters', site: 'reedgate', dx: -2300, dz: 100, count: 4 },
  // The drowned dead at the church ruin.
  { id: 'wraiths.drowned-church', kind: 'wraiths', site: 'drownedChurch', dx: 0, dz: 0, count: 4 },
];

/** Peat patch radius of an ambient shambler bog. */
export const BOG_RADIUS = 10;
/** Members stand on a ring of this radius around the group centre (a single member stands at the centre). */
const RING = 4;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A group's centre (engine metres). */
export function groupCentre(g: FaunaGroup): { x: number; z: number } {
  const s = greyfenSite(g.site);
  return { x: s.x + g.dx, z: s.z + g.dz };
}

/** The anchor id of member `n` (1-based) of a group. */
export function faunaAnchorId(group: string, n: number): string {
  return `greyfen.fauna.${group}.${n}`;
}

function memberAnchors(g: FaunaGroup): AnchorSpec[] {
  const c = groupCentre(g);
  const out: AnchorSpec[] = [];
  for (let i = 0; i < g.count; i++) {
    const a = (i / g.count) * Math.PI * 2;
    const r = g.count === 1 ? 0 : RING;
    out.push({ id: faunaAnchorId(g.id, i + 1), x: r2(c.x + Math.cos(a) * r), z: r2(c.z + Math.sin(a) * r), yawDeg: 0, tags: ['fauna', g.kind] });
  }
  return out;
}

export const GREYFEN_FAUNA_LAYOUT: LayoutData = {
  anchors: GREYFEN_FAUNA_GROUPS.flatMap(memberAnchors),
  triggers: [],
  structures: [],
  patrols: [],
  npcs: [],
  fields: [],
};
