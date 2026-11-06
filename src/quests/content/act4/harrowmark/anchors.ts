// The anchors the Harrowmark quests add (prefix `harrowmark.a4.q.`, inside L0's reserved `harrowmark.a4.`). L2 is the master for
// Harrowmark's Act 4 sites, so most of these sit a short offset from one of L2's or the shipped city's anchors; the escort routes
// were walked on the city's nav grid (tools: a path search over HARROWMARK_LAYOUT's structures and env colliders) and are pinned
// by anchors.test.ts (no node or segment inside a blocking footprint). Interior extras keep the interior anchor's height.
import { ACT4_POSTS, spawnAnchor } from '../../../../harrowmark/act4/act4.layout';
import { CHECKPOINTS, R20_HUTS } from '../../../../harrowmark/act4/sites';

export const Q = 'harrowmark.a4.q';

/** `dy` lifts an anchor above the ground (the Rooftop Ward's roofs). */
export interface WorldAnchor { id: string; x: number; z: number; heading?: number; dy?: number }
/** An anchor a fixed offset from another one (an interior anchor, or one placed at runtime by another plugin). */
export interface NearAnchor { id: string; near: string; dx: number; dz: number; heading?: number; interior?: boolean }

const post = (id: keyof typeof ACT4_POSTS): { x: number; z: number } => ACT4_POSTS[id];
const cp = (id: (typeof CHECKPOINTS)[number]['id']): { x: number; z: number } => CHECKPOINTS.find((c) => c.id === id)!;
const at = (id: string, p: { x: number; z: number }, dx = 0, dz = 0, heading?: number): WorldAnchor =>
  ({ id, x: Math.round((p.x + dx) * 10) / 10, z: Math.round((p.z + dz) * 10) / 10, ...(heading === undefined ? {} : { heading }) });
const roof = (id: string, x: number, z: number, dy: number): WorldAnchor => ({ id, x, z, dy });
const route = (name: string, pts: ReadonlyArray<readonly [number, number]>): WorldAnchor[] =>
  pts.map(([x, z], i) => ({ id: `${Q}.route.${name}.${i + 1}`, x, z }));
export const routeIds = (name: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${Q}.route.${name}.${i + 1}`);
/** The route anchor ids of `name`, from node `from` to node `to` (1-based, inclusive). */
export const routeSlice = (name: string, from: number, to: number): string[] => routeIds(name, to).slice(from - 1);

const MERRIN = post('merrin');
const DUNSTAN = { x: 8178, z: 1496 };
const ROOK = { x: 8360, z: 1306 };

/** Escort routes (anchor ids `harrowmark.a4.q.route.<name>.<n>`), each ending at the Keep court below the chamber door. */
export const ROUTES: Readonly<Record<string, ReadonlyArray<readonly [number, number]>>> = {
  'm35.oswin': [[8776, 1996], [8700, 2260], [8701, 2383], [8624, 2471], [8607, 2487], [8605, 2504], [8543, 2572], [8533, 2582], [8532, 2584]],
  'm35.halvard': [[8214, 1745], [8437, 1872], [8496, 1900], [8505, 2470], [8532, 2584]],
  'm35.grisel': [[9280, 2178], [9245.8, 2170.2], [9216.6, 2163.6], [9150, 2148], [8906.5, 2097.5], [8746.5, 2205.5], [8708.5, 2249.5], [8701, 2383], [8607, 2487], [8605, 2504], [8532, 2584]],
  // the cart halts short of each post (nodes 5, 8 and 10, points on the walked lines) and the run ends at node 12
  'r20.convoy': [[8776, 2000], [8801, 2049], [8865, 2056], [9150, 2148], [9200, 2159.7], [9216.6, 2163.6], [9245.8, 2170.2], [9316.5, 2186.8], [9340, 2192.3], [9437.5, 2215.7], [9470, 2223.5], [9522, 2236]],
  'r21.miners': [[8712, 1570], [8935, 1495], [9010, 1488]],
};

export const QUEST_WORLD_ANCHORS: readonly WorldAnchor[] = [
  // M35: the court where each delegation stops, the River Gate chain, the lane where the masked men wait, the three searches
  at(`${Q}.m35.chain`, post('grisel-steward'), -3, 4),
  at(`${Q}.m35.lane`, { x: 9158, z: 2150 }),
  at(`${Q}.m35.ledger`, cp('river-gate'), -3, -4),
  at(`${Q}.m35.mask`, { x: 9160, z: 2156 }),
  at(`${Q}.m35.orders`, { x: 9138, z: 2142 }),
  // M36: the debt ledger at the Bastion, the forged page at the Archive door, the rooftop walk and its drop, Orrin's letter-case, the chalk board
  at(`${Q}.m36.ledger`, post('aldric-cole'), -4, 3),
  at(`${Q}.m36.page`, { x: 8806, z: 2080 }, 0, -4),
  // the roofs (ward blocks b10, b11, b12; L2's watch walks the alley east of them): up the ward stair onto b10, out along the
  // roofs to the skylit end of b12 and back to b10's stair head; the daggerman's four wait at the stair foot, where the rope drops
  roof(`${Q}.m36.roof.start`, 8850, 2262, 6.5),
  roof(`${Q}.m36.roof.mid`, 8850, 2478, 7.5),
  roof(`${Q}.m36.roof.end`, 8834, 2262, 6.5),
  roof(`${Q}.m36.roof.centre`, 8868, 2370, 7),
  ...[[8836, 2300, 6.5], [8862, 2392, 7], [8838, 2448, 7.5], [8862, 2312, 6.5]].map(([x, z, dy], i) => roof(`${Q}.m36.hide.${i + 1}`, x!, z!, dy!)),
  at(`${Q}.m36.drop`, { x: 8858, z: 2220 }),
  at(`${Q}.m36.letters`, post('grisel-steward'), 3, -4),
  at(`${Q}.m36.chalk`, MERRIN, 0, 5),
  // R19: the muster roll and the banners at the Bastion, the horn, Bran's bout ring by the stables, Tolly's letter
  at(`${Q}.r19.roll`, post('wystan.bastion'), 4, 2),
  at(`${Q}.r19.banner.1`, post('captain-morwen'), 6, 4),
  at(`${Q}.r19.banner.2`, post('captain-morwen'), -24, 4),
  at(`${Q}.r19.horn`, post('wystan.bastion'), -4, 4),
  at(`${Q}.r19.bout`, post('captain-bran'), 0, -10),
  at(`${Q}.r19.letter`, post('captain-tolly'), 0, 4),
  // R20: the manifest and the cart at the Counting-House, a sergeant and a tally at each of the three posts, the stealth boxes
  at(`${Q}.r20.manifest`, MERRIN, -4, -4),
  at(`${Q}.r20.load`, MERRIN, -6, 4),
  at(`${Q}.r20.tally.1`, cp('river-gate'), -6, -2),
  at(`${Q}.r20.tally.2`, R20_HUTS[0], 3, 4),
  at(`${Q}.r20.tally.3`, R20_HUTS[1], 3, 4),
  ...[1, 2, 3].flatMap((n) => {
    const c = n === 1 ? cp('river-gate') : R20_HUTS[n - 2]!;
    return [
      at(`${Q}.r20.cp${n}.centre`, c),
      at(`${Q}.r20.cp${n}.start`, c, -20, -12),
      at(`${Q}.r20.cp${n}.exit`, c, 20, 8),
      ...[[-8, 6], [8, -6], [-6, -8], [6, 8]].map(([dx, dz], i) => at(`${Q}.r20.cp${n}.hide.${i + 1}`, c, dx!, dz!)),
    ];
  }),
  // R21: the cellar-keeper, the cellar door, the back lanes (stealth box), the patrol's chalk, the sewer grate at the river wall
  at(`${Q}.r21.door`, post('wenna'), 8, 4),
  at(`${Q}.r21.cellar`, post('wenna'), 10, -4),
  at(`${Q}.r21.lanes.centre`, { x: 8860, z: 1540 }),
  at(`${Q}.r21.lanes.start`, { x: 8770, z: 1560 }),
  at(`${Q}.r21.lanes.mid`, { x: 8860, z: 1540 }),
  at(`${Q}.r21.lanes.exit`, { x: 8960, z: 1505 }),
  ...[[8800, 1552], [8830, 1530], [8890, 1528], [8930, 1515]].map(([x, z], i) => at(`${Q}.r21.hide.${i + 1}`, { x: x!, z: z! })),
  ...[[8820, 1556], [8880, 1540], [8940, 1512], [8880, 1540]].map(([x, z], i) => at(`${Q}.r21.patrol.${i + 1}`, { x: x!, z: z! })),
  at(`${Q}.r21.chalk`, { x: 8874, z: 1634 }),
  at(`${Q}.r21.grate`, { x: 9014, z: 1484 }),
  // R22: Dunstan's forge (bellows, quench, hilt) and the drawing on his bench
  at(`${Q}.r22.drawing`, DUNSTAN, 3, 2),
  at(`${Q}.r22.bellows`, DUNSTAN, -3, -3),
  at(`${Q}.r22.quench`, DUNSTAN, 3, -3),
  at(`${Q}.r22.hilt`, DUNSTAN, 0, -3),
  at(`${Q}.r22.anvil`, DUNSTAN, -3, 2),
  // R23: a sealed order near each witness, the watch-yard reading, the Council clerk at the Keep court
  at(`${Q}.r23.order.1`, post('witness-barracks'), 3, 3),
  at(`${Q}.r23.order.2`, post('witness-gatehouse'), 3, 3),
  at(`${Q}.r23.order.3`, post('witness-stables'), 3, 3),
  at(`${Q}.r23.order.4`, post('witness-chapel'), 3, 3),
  at(`${Q}.r23.order.5`, post('witness-anvil'), -3, 3),
  at(`${Q}.r23.reading`, ROOK, 0, 6),
  // Minor cast posts in the city
  at(`${Q}.post.cellar-keeper`, post('wenna'), 6, -2),
  at(`${Q}.post.hamon-quill`, post('wystan'), -12, -4, 180),
  ...[1, 2, 3].map((n) => at(`${Q}.post.r20-sergeant-${n}`, n === 1 ? cp('river-gate') : R20_HUTS[n - 2]!, -4, 3)),
  ...Object.entries(ROUTES).flatMap(([name, pts]) => route(name, pts)),
];

/** R22's three sites, a short walk from each region's waystone (no Act 4 prefix: they lie in Acts 2 and 3 land). */
export const R22_SITE_ANCHORS: readonly NearAnchor[] = [
  { id: 'cinderreach.q.r22.site', near: 'waystone.cinderford', dx: 60, dz: 40 },
  { id: 'greyfen.q.r22.site', near: 'waystone.mireweather-hut', dx: -50, dz: 45 },
  { id: 'dragonspine.q.r22.site', near: 'waystone.rime-pass', dx: 45, dz: -55 },
].flatMap((s) => {
  const region = s.id.split('.')[0];
  return [
    s,
    { id: `${region}.q.r22.find`, near: s.near, dx: s.dx + 4, dz: s.dz + 4 },
    { id: `${region}.q.r22.local`, near: s.near, dx: s.dx - 14, dz: s.dz - 10 },
    ...[1, 2, 3].map((n) => ({ id: `${region}.q.r22.guard.${n}`, near: s.near, dx: s.dx + 8 + n * 2, dz: s.dz - 6 })),
  ];
});

const INN = 'npc-post.tobb.tilted-anvil';
/** The Tilted Anvil (pinned interior): M37's props and Gaut's spot by the back corridor, as offsets from the inn's own anchors. */
export const M37_INN_ANCHORS: readonly NearAnchor[] = [
  { id: `${Q}.m37.feast`, near: INN, dx: -6, dz: -3.5, interior: true },
  { id: `${Q}.m37.seat.tobb`, near: INN, dx: -11.5, dz: -1, interior: true },
  { id: `${Q}.m37.seat.hrolf`, near: INN, dx: -11.5, dz: -4.5, interior: true },
  { id: `${Q}.m37.seat.aelfreda`, near: INN, dx: -5.5, dz: -1, interior: true },
  { id: `${Q}.m37.table`, near: INN, dx: -5.5, dz: -4.5, interior: true },
  { id: `${Q}.post.gaut.inn`, near: INN, dx: -3, dz: -6.5, heading: 180, interior: true },
];

const CAMP = 'harrowmark.a4.m41.camp';
/** The M41 camp outside the north wall (L1's anchor): the map table, the fire, two search points, and a spot for everyone the
 * camp scene brings out of the city, on a ring 6 to 9 m out (L4's benched companions stand 2 m round the anchor). */
export const M41_CAMP_ANCHORS: readonly NearAnchor[] = [
  { id: `${Q}.m41.map`, near: CAMP, dx: 4, dz: 3 },
  { id: `${Q}.m41.fire`, near: CAMP, dx: -1, dz: 5 },
  { id: `${Q}.m41.grandfather`, near: CAMP, dx: 6, dz: -1 },
  { id: `${Q}.m41.tunnel`, near: CAMP, dx: -9, dz: -6 },
  { id: `${Q}.m41.edric`, near: CAMP, dx: 2, dz: 6, heading: 180 },
  { id: `${Q}.m41.rook`, near: CAMP, dx: -3, dz: 7, heading: 180 },
  ...['wystan', 'merrin', 'wenna', 'dunstan', 'stane', 'pennard', 'gerta', 'ashdown'].map((id, i): NearAnchor => {
    const a = (Math.PI * (0.15 + i * 0.1)) * 2;
    return { id: `${Q}.m41.${id}`, near: CAMP, dx: Math.round(8 * Math.cos(a) * 10) / 10, dz: Math.round(-8 * Math.sin(a) * 10) / 10 };
  }),
];

export const NEAR_ANCHORS: readonly NearAnchor[] = [...R22_SITE_ANCHORS, ...M37_INN_ANCHORS, ...M41_CAMP_ANCHORS];

/** Spawn anchors of my own groups: R21's lane watch reuses its patrol nodes; R22's guards are in R22_SITE_ANCHORS. */
export const R21_WATCH_PATROL = [1, 2, 3, 4].map((n) => `${Q}.r21.patrol.${n}`);
export { spawnAnchor };
