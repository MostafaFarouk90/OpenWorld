// Act 5 thread N1 PR 1 (plans/act5-N1.md section 1): the master positions of every Caldera exterior. Every Act 5 thread
// imports these (never hard-codes a site); interiors are N2's (plans/act5-N2.md). Each point is an export of the terrain
// layer (src/terrain/shape/caldera.ts) or an offset from one, so nothing is placed twice. Plain data, worker-safe (no
// THREE). Engine metres; compass headings: 0 = +Z (north), 90 = +X (east). Heights are the shaped ground's (the layout
// resolves them; calderaSites.test.ts pins the bowl's).
import {
  ANVIL,
  CAUSEWAY_HALF_WIDTH,
  CAUSEWAY_POINTS,
  COOLING_HALL_DOOR,
  FLOOR_HEIGHT,
  FLOOR_WALL_RADIUS,
  INNER_GATE_RAMP_POINTS,
  ISLAND_HEIGHT,
  ISLAND_R,
  LAKE_HALF_WIDTH,
  LAKE_INNER_R,
  LAKE_OUTER_R,
  LAKE_RING,
  LAKE_SURFACE,
  LAVA_STAIR_POINTS,
  RIM_GATE,
  RIM_STAIRS_HALF_WIDTH,
  RIM_STAIRS_POINTS,
  RING_HEIGHT,
  STOKERS_POST,
  TERRACE_LEDGES,
  TERRACE_PATH_POINTS,
  TERRACES_POINTS,
  TUNNEL_MOUTH,
  TUNNEL_PATH_POINTS,
  WARHOST_CAMP,
  type XZ,
} from '../terrain/shape/caldera';
import { RIMFOOT } from '../terrain/shape/waste';

export type { XZ };
export { FLOOR_WALL_RADIUS, LAKE_INNER_R, LAKE_OUTER_R, ISLAND_R };

const r2 = (n: number): number => Math.round(n * 100) / 100;
export const off = (p: XZ, dx: number, dz: number): XZ => [r2(p[0] + dx), r2(p[1] + dz)];
/** A point `r` metres from `p` on compass bearing `deg`. */
export const polarFrom = (p: XZ, deg: number, r: number): XZ => {
  const a = (deg * Math.PI) / 180;
  return [r2(p[0] + Math.sin(a) * r), r2(p[1] + Math.cos(a) * r)];
};
/** Compass heading from `p` toward `q`. */
export const headingTo = (p: XZ, q: XZ): number => r2((((Math.atan2(q[0] - p[0], q[1] - p[1]) * 180) / Math.PI) % 360 + 360) % 360);
/** Distance from the Anvil. */
export const radiusOf = (p: XZ): number => Math.hypot(p[0] - ANVIL[0], p[1] - ANVIL[1]);

// ---- the Rim Gate and the siege's ground (the gate stands in a 28 m cut through the crest, on `fog.caldera-rim.s`)

export const RIM_GATE_SITE = {
  gate: RIM_GATE,
  /** The outer landing: the rim stairs' top, the rams' target and Wystan's sally ground (Waste side). */
  landing: RIM_STAIRS_POINTS[RIM_STAIRS_POINTS.length - 1],
  /** The gatehouse towers inside the cut, either side of the leaf, 20 m in from the face (where the cut's floor is level). */
  towers: [off(RIM_GATE, -11, 20), off(RIM_GATE, 11, 20)] as readonly XZ[],
  /** The leaf's line, between the towers. */
  leaf: off(RIM_GATE, 0, 20),
  /** The leaf spans the cut between the towers (visual; the fog face does the holding). */
  leafHalfWidth: 8.5,
  /** M47's winch on the west tower's outer stair: outside the face, reachable before the gate opens. */
  winch: off(RIM_GATE, -9, -6),
  /** The court: the cut behind the gate, where a breach is cleared. */
  court: off(RIM_GATE, 0, 90),
} as const;

/** The rim stairs: Rimfoot to the Rim Gate (the M52 siege lane). */
export const RIM_STAIRS = {
  points: RIM_STAIRS_POINTS,
  halfWidth: RIM_STAIRS_HALF_WIDTH,
  foot: RIM_STAIRS_POINTS[0],
  hairpin: RIM_STAIRS_POINTS[3],
} as const;

// ---- the Rim Camp (the rim shelf, 295 m: x 10870 to 11130, z 6680 to 6810)

const FIRE: XZ = [11000, 6745];
/** Vendors' shop points (N7's ids, `caldera.camp.shop.<id>`), the west row and the anvils. */
const SHOPS = {
  dunstan: [10895, 6700],
  wystan: [10895, 6720],
  merrin: [10895, 6740],
  wenna: [10895, 6760],
  wulfhild: [10895, 6780],
  maud: [10895, 6800],
  gerta: [10930, 6700],
  ashdown: [10930, 6720],
  alric: [11060, 6722],
} as const satisfies Record<string, XZ>;
/** Trainers' desks (N7's ids, `caldera.camp.trainer.<id>`), the east row. */
const TRAINERS = {
  stane: [11105, 6700],
  pennard: [11105, 6722],
  gerta: [11105, 6744],
  ashdown: [11105, 6766],
  rook: [11105, 6788],
  hrolf: [11075, 6800],
} as const satisfies Record<string, XZ>;

export const RIM_CAMP = {
  fire: FIRE,
  /** The rest point (tag `rest`), beside the fire. */
  rest: off(FIRE, 0, -4),
  waystone: off(FIRE, -35, -10),
  shops: SHOPS,
  trainers: TRAINERS,
  /** Dunstan's forge beside his shop; Alric's rim anvil (from M47) beside his. */
  forgeDunstan: off(SHOPS.dunstan, -8, 0),
  anvilAlric: off(SHOPS.alric, 0, -7),
  /** Talk posts (`npc-post.<id>.rim`): a vendor's 3 m in front of its shop, the rest round the fire. */
  talk: {
    wystan: off(SHOPS.wystan, 3, 0),
    merrin: off(SHOPS.merrin, 3, 0),
    wenna: off(SHOPS.wenna, 3, 0),
    wulfhild: off(SHOPS.wulfhild, 3, 0),
    maud: off(SHOPS.maud, 3, 0),
    alric: off(SHOPS.alric, -3, 0),
    edric: off(FIRE, 30, 45),
    rook: off(TRAINERS.rook, -4, 0),
    ansgar: off(FIRE, 95, 15),
  },
  /** The benched companions' wait spots (L4's wait director, from M47). */
  companions: { tobb: off(FIRE, -25, 30), hrolf: off(FIRE, -12, 44), aelfreda: off(FIRE, 15, 40) },
  /** Aelfreda's Act 5 Hearth Rite, the war table (M49 and M52's briefing), and a camera for scenes. */
  rite: off(FIRE, 15, -15),
  warTable: off(FIRE, 30, 22),
  sceneCam: off(FIRE, -40, -50),
  tents: [off(FIRE, -110, 60), off(FIRE, -70, 60), off(FIRE, 70, 60), off(FIRE, 110, 60), off(FIRE, -60, -55), off(FIRE, 60, -55)] as readonly XZ[],
} as const;

// ---- the Lava Stair, the Cooling Hall, the tunnel, the stokers' post

export const LAVA_STAIR = {
  points: LAVA_STAIR_POINTS,
  head: LAVA_STAIR_POINTS[0],
  mid: LAVA_STAIR_POINTS[2],
  foot: LAVA_STAIR_POINTS[LAVA_STAIR_POINTS.length - 1],
} as const;

/** Exterior door points (N2 owns every interior; `caldera.door.<id>` anchors face out, toward the way in). */
export const CALDERA_DOORS = {
  coolingHall: COOLING_HALL_DOOR,
  /**
   * On the bowl floor 25 m past the Inner Gate ramp's foot, behind the face: reached only once the gate opens (M53). The floor
   * is flat there, as an interior's exit needs (it lands at the anchor's height, 1.6 m out).
   */
  foundry: [11000, 7625] as XZ,
  tunnel: TUNNEL_MOUTH,
} as const;
/** Where each door's way in comes from (the anchors face it). */
export const CALDERA_DOOR_APPROACH: Readonly<Record<keyof typeof CALDERA_DOORS, XZ>> = {
  coolingHall: LAVA_STAIR_POINTS[LAVA_STAIR_POINTS.length - 1],
  foundry: INNER_GATE_RAMP_POINTS[1],
  tunnel: TUNNEL_PATH_POINTS[TUNNEL_PATH_POINTS.length - 1],
};

export const STOKERS = { post: STOKERS_POST, gong: off(STOKERS_POST, 8, 6) } as const;

// ---- the Wyrm Terraces, the Inner Gate, the floor, the lake and the Anvil

export const WYRM_TERRACES = {
  ledges: TERRACE_LEDGES,
  waystone: TERRACE_LEDGES[1].at,
  path: TERRACE_PATH_POINTS,
  shelves: TERRACES_POINTS,
} as const;

export const INNER_GATE = {
  /** The face on the floor wall (`fog.caldera.inner`, anchor `caldera.fog.inner`): the floor hole's edge, r 520. */
  face: [ANVIL[0], ANVIL[1] - FLOOR_WALL_RADIUS] as XZ,
  faceHalfLength: 14,
  pillars: [[10992, ANVIL[1] - FLOOR_WALL_RADIUS], [11008, ANVIL[1] - FLOOR_WALL_RADIUS]] as readonly XZ[],
  /** The apron outside the face (the ring's height), the waystone (lit from M53) on it. */
  head: INNER_GATE_RAMP_POINTS[0],
  waystone: [11030, 7425] as XZ,
  ramp: INNER_GATE_RAMP_POINTS,
} as const;

export const LAVA_LAKE = {
  centre: ANVIL,
  /** N3's volume: a closed ribbon on these points (the first repeated) with this half width. */
  ribbon: LAKE_RING,
  halfWidth: LAKE_HALF_WIDTH,
  surfaceY: LAKE_SURFACE,
  /** The causeway's strip (its top is above the surface, so walking it never burns). */
  causeway: { x0: CAUSEWAY_POINTS[0][0] - CAUSEWAY_HALF_WIDTH, x1: CAUSEWAY_POINTS[0][0] + CAUSEWAY_HALF_WIDTH, z0: CAUSEWAY_POINTS[0][1], z1: CAUSEWAY_POINTS[1][1] },
  /**
   * Safe lips for a throw (N3: the nearest lip from where Cael stepped in): eight on the island's rim (r 50), both ends of
   * the causeway, and every 15 degrees on the outer shore (r 270, just past the lava's edge).
   */
  safeLips: [
    ...Array.from({ length: 8 }, (_, i) => polarFrom(ANVIL, i * 45, ISLAND_R - 3)),
    CAUSEWAY_POINTS[0],
    off(CAUSEWAY_POINTS[1], 0, -12),
    ...Array.from({ length: 24 }, (_, i) => polarFrom(ANVIL, i * 15, LAKE_OUTER_R + 15)),
  ] as readonly XZ[],
} as const;

export const ANVIL_ISLAND = { centre: ANVIL, r: ISLAND_R, top: ISLAND_HEIGHT, causeway: CAUSEWAY_POINTS } as const;

export const BOWL_HEIGHTS = { floor: FLOOR_HEIGHT, ring: RING_HEIGHT, island: ISLAND_HEIGHT, lake: LAKE_SURFACE } as const;

// ---- the named places (N9's labels, N10 to N12's landings)

export const CALDERA_PLACES = {
  rimfoot: RIMFOOT,
  rimStairsFoot: RIM_STAIRS.foot,
  rimStairsHairpin: RIM_STAIRS.hairpin,
  rimGateLanding: RIM_GATE_SITE.landing,
  rimGate: RIM_GATE,
  siegeCourt: RIM_GATE_SITE.court,
  rimCamp: FIRE,
  rimCampWaystone: RIM_CAMP.waystone,
  stokersPost: STOKERS_POST,
  tunnelMouth: TUNNEL_MOUTH,
  lavaStairHead: LAVA_STAIR.head,
  lavaStairFoot: LAVA_STAIR.foot,
  coolingHall: COOLING_HALL_DOOR,
  wyrmTerraces: WYRM_TERRACES.waystone,
  innerGate: INNER_GATE.face,
  innerGateWaystone: INNER_GATE.waystone,
  foundry: CALDERA_DOORS.foundry,
  /** A label point only: the Hammer Hall is an interior chained from the Foundry (N2). */
  hammerHall: [11000, 7700] as XZ,
  anvil: ANVIL,
  warhostCamp: WARHOST_CAMP,
} as const satisfies Record<string, XZ>;
export type CalderaPlaceId = keyof typeof CALDERA_PLACES;

// ---- N4's siege points (plans/act5-N4.md section 13)

const G = RIM_GATE;
export const SIEGE_POINTS = {
  /** The gate line, across the leaf just inside the face. */
  gate: [off(G, -6, 25), off(G, -2, 25), off(G, 2, 25), off(G, 6, 25)] as readonly XZ[],
  /** Lane heads on the rim stairs' upper leg, from the hairpin up, and the ram's stand below the landing. */
  lanes: [RIM_STAIRS_POINTS[4], [11300, 6405], RIM_STAIRS_POINTS[5], [11100, 6436]] as readonly XZ[],
  ram: RIM_STAIRS_POINTS[6],
  /** The tower tops (archers). */
  wallLeft: RIM_GATE_SITE.towers[0],
  wallRight: RIM_GATE_SITE.towers[1],
  court: RIM_GATE_SITE.court,
  /** The lee ring's centre, 14 m behind the gate line. */
  lee: off(G, 0, 39),
  banner: off(G, 0, 150),
  orders: off(G, 8, 160),
  crates: off(G, -8, 140),
  aid: off(G, 7, 120),
  /** The wave start safe point: in the court, out of the lanes. */
  start: off(G, 0, 110),
  /** Dragon loop marks round the stairs and the court: ground points, flown at `skyHeights` metres above them (N4). */
  sky: [0, 60, 120, 180, 240, 300].map((deg) => polarFrom(off(G, 120, -40), deg, 160)) as readonly XZ[],
  skyHeights: [45, 50, 55, 60, 65, 70] as readonly number[],
} as const;

// ---- N5's ambient sites (each names its area; N5 defines `caldera.fauna.*` on them)

export interface CalderaFaunaSite {
  id: string;
  at: XZ;
  area: 'caldera-rim' | 'caldera-stair' | 'caldera-terraces' | 'caldera-foundry';
}
const fauna = (id: string, at: XZ, area: CalderaFaunaSite['area']): CalderaFaunaSite => ({ id, at, area });
export const CALDERA_FAUNA_SITES: readonly CalderaFaunaSite[] = [
  // The rim stairs are on the Waste side of the crest, outside the Rim Gate.
  fauna('rim-stairs.1', RIM_STAIRS_POINTS[1], 'caldera-rim'),
  fauna('rim-stairs.2', RIM_STAIRS_POINTS[2], 'caldera-rim'),
  fauna('rim-stairs.hairpin', [11410, 6345], 'caldera-rim'),
  fauna('rim-stairs.3', RIM_STAIRS_POINTS[4], 'caldera-rim'),
  fauna('rim-stairs.4', RIM_STAIRS_POINTS[5], 'caldera-rim'),
  fauna('rim-perch.1', [10800, 6420], 'caldera-rim'),
  fauna('rim-perch.2', [11250, 6440], 'caldera-rim'),
  fauna('rim-perch.3', [11550, 6430], 'caldera-rim'),
  fauna('lava-stair.1', LAVA_STAIR_POINTS[1], 'caldera-stair'),
  fauna('lava-stair.2', LAVA_STAIR_POINTS[2], 'caldera-stair'),
  fauna('lava-stair.3', LAVA_STAIR_POINTS[3], 'caldera-stair'),
  ...TERRACE_LEDGES.map((t, i) => fauna(`terraces.scout.${i + 1}`, off(t.at, 0, i === 1 ? -40 : 30), 'caldera-terraces')),
  fauna('cooling-hall.apron', off(COOLING_HALL_DOOR, -12, -12), 'caldera-stair'),
  fauna('inner-gate.head', off(INNER_GATE_RAMP_POINTS[0], -30, -20), 'caldera-foundry'),
];
