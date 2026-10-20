// Harrowmark inside the ring wall: districts, anchors, patrols, chase nodes, hide spots, crowd lanes.
// Engine metres, +Z north, centre (8500, 2000). Headings are compass (0 north, 90 east); `a()` stores yaw = heading + 180.
// Ownership: prefix `harrowmark.` is thread 17's. Unprefixed ids (`npc-post.*`, `shop.*`, `chest.harrowmark.*`, `m06.*`, `hide.m06.*`,
// `stealth.m06.*`, `patrol.m06.*`, `chase.m10.*`, ...) are the requested exceptions listed in plans/slice-2-harrowmark-city.md.
// The Counting-House's own stealth anchors (`stealth.m09.*`, `hide.m09.*`, `patrol.m09.hall`) come from thread 3a's interior def.
import type { AnchorSpec, LayoutData, NpcSpec, PatrolSpec, StructureSpec, TriggerSpec } from '../region/layoutTypes';
import { GATE_NAMES, gateBearing, inward, outward, polar, wallStructures, PORTCULLIS_ID } from './city';
import { a, numbered, open, solid, stairs } from './layout.helpers';
import { DENSITY_LAYOUT_HM } from './density.layout';

export const H = (id: string) => `harrowmark.${id}`;

// ---------------------------------------------------------------- the wall and the gates
const gateAnchors: AnchorSpec[] = GATE_NAMES.flatMap((g, i) => {
  const b = gateBearing(i);
  const out = polar(b, 756);
  const inn = polar(b, 738);
  return [a(H(`gate.${g}`), out.x, out.z, outward(b), ['poi', 'gate']), a(H(`gate.${g}.inside`), inn.x, inn.z, inward(b), ['poi', 'gate'])];
});

// ---------------------------------------------------------------- hide spots (thread 18 builds the `hide:<name>` interactables)
interface Hide {
  name: string;
  x: number;
  z: number;
  heading: number;
  /** Rooftop spots: block id the spot sits on and the roof height. */
  roof?: { host: string; height: number };
}
const HIDES: Hide[] = [
  { name: 'gate-cart', x: 8575, z: 1296, heading: 90 },
  { name: 'gate-barrels', x: 8425, z: 1296, heading: 270 },
  { name: 'gate-wall-shadow', x: 8470, z: 1262, heading: 180 },
  { name: 'stable-hay', x: 8668, z: 1356, heading: 0 },
  { name: 'barracks-woodpile', x: 8325, z: 1382, heading: 90 },
  { name: 'forge-coalbin', x: 8120, z: 1500, heading: 0 },
  { name: 'anvil-alley', x: 8180, z: 1604, heading: 180 },
  { name: 'guild-crates', x: 8720, z: 1540, heading: 90 },
  { name: 'guild-awning', x: 8830, z: 1490, heading: 0 },
  { name: 'thieves-barrel', x: 8950, z: 1520, heading: 90 },
  { name: 'fountain-arch', x: 8540, z: 1740, heading: 270 },
  { name: 'oswin-hedge', x: 8770, z: 1960, heading: 0 },
  { name: 'archive-columns', x: 8790, z: 2112, heading: 180 },
  { name: 'chapel-buttress', x: 8370, z: 2120, heading: 270 },
  { name: 'keep-road-urn-1', x: 8470, z: 2300, heading: 90 },
  { name: 'keep-road-urn-2', x: 8530, z: 2400, heading: 270 },
];

/** Prop (crate or chimney) standing 2 m behind the spot, long side across the heading. */
const behind = (h: { x: number; z: number; heading: number }): { x: number; z: number } => {
  const r = (h.heading * Math.PI) / 180;
  return { x: h.x - 2 * Math.sin(r), z: h.z - 2 * Math.cos(r) };
};

// ---------------------------------------------------------------- the Rooftop Ward: 3 x 3 blocks, 3 m alleys, tops 0.5 m apart
export const WARD = { cx: 8850, cz: 2390, size: 91, pitch: 94 } as const;
const wardBlock = (i: number, j: number) => ({
  id: `ward.b${i}${j}`,
  x: WARD.cx + (i - 1) * WARD.pitch,
  z: WARD.cz + (j - 1) * WARD.pitch,
  height: 6 + 0.5 * (i + j),
});

const wardBlocks: StructureSpec[] = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
  const b = wardBlock(i, j);
  wardBlocks.push(solid(b.id, 'block', b.x, b.z, WARD.size, WARD.size, b.height));
}

const ROOF_HIDES: Hide[] = [
  { name: 'rooftop-chimney-1', x: 8830, z: 2300, heading: 180, roof: { host: 'ward.b10', height: wardBlock(1, 0).height } },
  { name: 'rooftop-chimney-2', x: 8780, z: 2470, heading: 90, roof: { host: 'ward.b02', height: wardBlock(0, 2).height } },
  { name: 'rooftop-skylight', x: 8930, z: 2420, heading: 0, roof: { host: 'ward.b21', height: wardBlock(2, 1).height } },
];

// ---------------------------------------------------------------- structures
const stalls: StructureSpec[] = [30, 60, 120, 150, 210, 240, 300, 330].map((deg) => {
  const p = { x: 8780 + 22 * Math.sin((deg * Math.PI) / 180), z: 1520 + 22 * Math.cos((deg * Math.PI) / 180) };
  return solid(`guild.stall-${deg}`, 'stall', Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, 4, 3, 2.6, deg);
});

const keepRoadHouses: StructureSpec[] = [1850, 1930, 2010, 2090, 2230, 2310, 2470].flatMap((z) => [
  solid(`keep-road.w${z}`, 'house', 8450, z, 24, 40, 7),
  solid(`keep-road.e${z}`, 'house', 8550, z, 24, 40, 7),
]);

const hidePropFor = (h: Hide): StructureSpec => {
  const p = behind(h);
  return h.roof
    ? { ...solid(`hide-prop.${h.name}`, 'crate', p.x, p.z, 3.2, 1.6, h.roof.height + 1.8, h.heading), inside: h.roof.host }
    : solid(`hide-prop.${h.name}`, 'crate', p.x, p.z, 3.2, 1.6, 1.8, h.heading);
};

const structures: StructureSpec[] = [
  ...wallStructures(),
  // Gate square
  solid('barracks.hall', 'house', 8360, 1330, 44, 30, 7),
  solid('stables.hall', 'house', 8640, 1330, 40, 30, 6),
  solid('gate.brazier-m06', 'crate', 8537, 1286, 1.4, 1.4, 1.0),
  // Forge Row
  ...[8110, 8144, 8178, 8212, 8246].map((x, i) => solid(i === 2 ? 'forge.dunstan' : `forge.a${i}`, 'house', x, 1480, 30, 24, 6)),
  ...[8110, 8144, 8178, 8246].map((x, i) => solid(`forge.b${i}`, 'house', x, 1560, 30, 24, 6)),
  solid('tilted-anvil', 'tavern', 8200, 1668, 30, 24, 7),
  solid('underways.gatehouse', 'house', 7948, 1545, 10, 12, 5),
  // Bastion
  solid('bastion.hall', 'house', 8200, 1810, 80, 30, 9),
  open('bastion.yard-fence', 'yard-fence', 8200, 1735, 140, 110, 1.6),
  solid('bastion.drill-blocker', 'block', 8165, 1710, 6, 1.2, 2.2),
  // Fountain
  solid('fountain', 'fountain', 8500, 1700, 12, 12, 1.2),
  // Guild Quarter
  solid('guild.hall', 'house', 8870, 1600, 40, 28, 8),
  solid('guild.house-w1', 'house', 8690, 1475, 26, 20, 7),
  solid('guild.house-w2', 'house', 8690, 1560, 26, 20, 7),
  solid('guild.house-e1', 'house', 8870, 1480, 30, 20, 7),
  solid('guild.alley-a', 'house', 8950, 1508, 30, 20, 7),
  solid('guild.alley-b', 'house', 8950, 1538, 30, 20, 7),
  ...stalls,
  // Counting-House, Archive, Chapel, Keep
  solid('counting-house', 'house', 8820, 1990, 60, 40, 9),
  solid('archive', 'house', 8830, 2080, 40, 36, 9),
  solid('chapel', 'chapel', 8330, 2150, 30, 40, 8),
  solid('keep.hall', 'house', 8500, 2625, 100, 50, 24),
  ...[[8444, 2604], [8556, 2604], [8444, 2646], [8556, 2646]].map(([x, z], i) => solid(`keep.tower-${i}`, 'tower', x, z, 12, 12, 30)),
  ...keepRoadHouses,
  // Rooftop Ward with its stair from the south and the vault crate on the chase run
  ...wardBlocks,
  ...stairs('ward.stair', WARD.cx, 2232, 'N', wardBlock(1, 0).height, 4),
  solid('chase.low-wall', 'crate', 8900, 2060, 6, 1.2, 1.0),
  // Hide spots: props and the three roof chimneys
  ...HIDES.map(hidePropFor),
  ...ROOF_HIDES.map(hidePropFor),
];

// ---------------------------------------------------------------- NPC posts (anchors) and NpcSpecs
interface Post {
  id: string;
  x: number;
  z: number;
  heading: number;
}
const POSTS: Post[] = [
  { id: 'rook', x: 8360, z: 1306, heading: 180 },
  { id: 'rook.gate', x: 8486, z: 1238, heading: 180 },
  { id: 'gaut.bastion', x: 8150, z: 1745, heading: 180 },
  { id: 'stane.bastion', x: 8175, z: 1745, heading: 180 },
  { id: 'pennard.bastion', x: 8200, z: 1745, heading: 180 },
  { id: 'gerta.bastion', x: 8225, z: 1745, heading: 180 },
  { id: 'ashdown.bastion', x: 8250, z: 1745, heading: 180 },
  { id: 'wystan', x: 8185, z: 1787, heading: 180 },
  { id: 'dunstan', x: 8178, z: 1496, heading: 0 },
  { id: 'wace', x: 8625, z: 1356, heading: 90 },
  { id: 'aldith', x: 8212, z: 1648, heading: 180 },
  { id: 'merrin', x: 8782, z: 1995, heading: 270 },
  { id: 'whitlock', x: 8800, z: 2087, heading: 270 },
  { id: 'pennard.archive', x: 8800, z: 2073, heading: 270 },
  { id: 'edric', x: 8488, z: 2575, heading: 180 },
  { id: 'vey.keep', x: 8512, z: 2575, heading: 180 },
  { id: 'aelfreda.chapel', x: 8362, z: 2158, heading: 90 },
  // Tobb's waits (thread 4b): off the gate square, and a few metres off the Keep door and its arrival point.
  { id: 'tobb.south-gate', x: 8540, z: 1275, heading: 180 },
  { id: 'tobb.keep', x: 8520, z: 2588, heading: 180 },
  { id: 'gerta.guild', x: 8780, z: 1520, heading: 180 },
];
const postAnchors = POSTS.map((p) => a(`npc-post.${p.id}`, p.x, p.z, p.heading, ['npc-post']));

/** Trainer spots 2.5 m in front of each Bastion post (thread 12 stands the trainer UI there, never on the NPC's talk spot). */
const trainerAnchors = ['gaut', 'stane', 'pennard', 'gerta', 'ashdown'].map((id) => {
  const p = POSTS.find((q) => q.id === `${id}.bastion`)!;
  return a(H(`bastion.trainer.${id}`), p.x, p.z - 2.5, p.heading, ['trainer']);
});

export const HARROWMARK_NPCS: NpcSpec[] = [
  { id: 'rook', post: 'npc-post.rook' },
  { id: 'aldith', post: 'npc-post.aldith' },
  { id: 'gerta', post: 'npc-post.gerta.guild' },
  { id: 'whitlock', post: 'npc-post.whitlock' },
  { id: 'pennard', post: 'npc-post.pennard.archive' },
  { id: 'ashdown', post: 'npc-post.ashdown.bastion', presentWhen: 'story.m07.started' },
  { id: 'dunstan', post: 'npc-post.dunstan' },
  { id: 'wace', post: 'npc-post.wace' },
  { id: 'wystan', post: 'npc-post.wystan' },
  { id: 'merrin', post: 'npc-post.merrin' },
  { id: 'edric', post: 'npc-post.edric' },
  { id: 'vey', post: 'npc-post.vey.keep', presentWhen: 'story.m08.started' },
];

// ---------------------------------------------------------------- patrols, chase, lanes
type Pts = Array<[number, number]>;
const ring = (cx: number, cz: number, r: number, n: number, phase = 0): Pts =>
  Array.from({ length: n }, (_, k) => {
    const t = phase + (k * 2 * Math.PI) / n;
    return [Math.round(cx + r * Math.sin(t)), Math.round(cz + r * Math.cos(t))] as [number, number];
  });
const arc = (from: number, to: number, step: number, r: number): Pts => {
  const out: Pts = [];
  for (let b = from; b <= to + 1e-6; b += step) {
    const p = polar(b, r);
    out.push([Math.round(p.x), Math.round(p.z)]);
  }
  return out;
};

const PATROLS: Array<{ id: string; pts: Pts; loop: boolean; tags?: string[] }> = [
  { id: H('patrol.gate-square'), loop: true, pts: [[8455, 1285], [8455, 1345], [8500, 1365], [8545, 1345], [8545, 1285], [8500, 1272]] },
  { id: 'patrol.m06.gate-square', loop: true, pts: [[8470, 1275], [8470, 1320], [8530, 1320], [8530, 1275], [8500, 1298]] },
  { id: H('patrol.gate-wall-walk'), loop: false, pts: arc(130, 170, 5, 735) },
  { id: H('patrol.keep-road'), loop: true, pts: [[8478, 1780], [8478, 2000], [8478, 2300], [8478, 2540], [8522, 2540], [8522, 2300], [8522, 2000], [8522, 1780]] },
  { id: H('patrol.guild-alley'), loop: false, pts: [[8935, 1523.5], [8975, 1523.5], [9010, 1523.5], [9045, 1524]] },
  { id: H('patrol.counting-yard'), loop: true, pts: [[8760, 1975], [8760, 2020], [8725, 2020], [8725, 1975]] },
  { id: H('patrol.barracks'), loop: true, pts: [[8330, 1295], [8395, 1295], [8395, 1365], [8330, 1365]] },
  { id: H('patrol.keep-court'), loop: true, pts: [[8470, 2560], [8470, 2590], [8530, 2590], [8530, 2560], [8500, 2545], [8500, 2570]] },
];

/** Chase nodes for M10; the tag says how the courier crosses to the next node. Rooftop nodes carry dy = roof height. */
interface ChaseNode {
  x: number;
  z: number;
  tag: 'run' | 'vault' | 'drop' | 'gap';
  roof?: number;
}
const b10 = wardBlock(1, 0).height;
const b11 = wardBlock(1, 1).height;
const b01 = wardBlock(0, 1).height;
const b02 = wardBlock(0, 2).height;
export const CHASE_M10: ChaseNode[] = [
  { x: 8900, z: 1620, tag: 'run' },
  { x: 8900, z: 1760, tag: 'run' },
  { x: 8900, z: 1900, tag: 'run' },
  { x: 8900, z: 2040, tag: 'vault' },
  { x: 8900, z: 2200, tag: 'run' },
  { x: 8850, z: 2262, tag: 'run', roof: b10 },
  { x: 8850, z: 2338, tag: 'gap', roof: b10 },
  { x: 8850, z: 2400, tag: 'run', roof: b11 },
  { x: 8812, z: 2390, tag: 'gap', roof: b11 },
  { x: 8750, z: 2390, tag: 'run', roof: b01 },
  { x: 8756, z: 2430, tag: 'gap', roof: b01 },
  { x: 8756, z: 2490, tag: 'run', roof: b02 },
  { x: 8716, z: 2490, tag: 'drop', roof: b02 },
  { x: 8690, z: 2494, tag: 'run' },
  { x: 8600, z: 2494, tag: 'run' },
  { x: 8510, z: 2494, tag: 'run' },
];
const CHASE_ALT: Pts = [[8900, 2100], [9010, 2200], [9010, 2400], [9000, 2540], [8850, 2548], [8690, 2540]];

export interface CrowdLane {
  id: string;
  points: string[];
  loop: boolean;
  halfWidth: number;
}
const LANES: Array<{ name: string; pts: Pts; loop: boolean; halfWidth: number }> = [
  { name: 'main-street-south', loop: false, halfWidth: 8, pts: [[8490, 1290], [8490, 1360], [8490, 1440], [8490, 1520], [8490, 1590], [8490, 1640], [8462, 1670], [8460, 1700]] },
  { name: 'main-street-north', loop: false, halfWidth: 8, pts: [[8490, 1770], [8490, 1850], [8490, 1930], [8490, 2010], [8490, 2090], [8490, 2170], [8490, 2250], [8490, 2330], [8490, 2375], [8490, 2420], [8490, 2470], [8490, 2520]] },
  { name: 'market-ring', loop: true, halfWidth: 3, pts: ring(8780, 1520, 30, 8) },
  { name: 'forge-row', loop: false, halfWidth: 6, pts: [[8100, 1520], [8140, 1520], [8180, 1520], [8230, 1520], [8290, 1520]] },
  { name: 'guild-alley', loop: false, halfWidth: 1.5, pts: [[8940, 1525], [8958, 1525], [8985, 1525], [9015, 1525], [9040, 1532], [9060, 1542]] },
  { name: 'gate-queue', loop: false, halfWidth: 4, pts: [[8500, 1262], [8500, 1285], [8500, 1312], [8495, 1345]] },
  { name: 'fountain-circuit', loop: true, halfWidth: 4, pts: ring(8500, 1700, 32, 8, Math.PI / 8) },
  { name: 'chapel-approach', loop: false, halfWidth: 4, pts: [[8480, 2150], [8430, 2150], [8392, 2150], [8358, 2150]] },
  { name: 'bastion-edge', loop: false, halfWidth: 5, pts: [[8292, 1690], [8292, 1740], [8292, 1790], [8292, 1850]] },
  { name: 'rooftop-ward-streets', loop: false, halfWidth: 1.0, pts: [[8897, 2250], [8897, 2310], [8897, 2380], [8897, 2430], [8897, 2480], [8897, 2528], [8897, 2540]] },
];

export const CROWD_LANES: CrowdLane[] = LANES.map((l) => ({
  id: H(`lane.${l.name}`),
  loop: l.loop,
  halfWidth: l.halfWidth,
  points: l.pts.map((_, i) => H(`lane.${l.name}.${i + 1}`)),
}));

// ---------------------------------------------------------------- world-change anchors
export const BRAZIER_COUNT = 21;
export const BANNER_COUNT = { bastion: 4, keep: 6 } as const;
const brazierAnchors: AnchorSpec[] = Array.from({ length: BRAZIER_COUNT }, (_, k) =>
  a(H(`brazier.keep-road.${String(k + 1).padStart(2, '0')}`), k % 2 ? 8508 : 8492, 1760 + 39 * k, 0, ['brazier']),
);
const bastionBanners = [8165, 8185, 8215, 8235].map((x, k) => a(H(`banner.bastion.${k + 1}`), x, 1794.2, 180, ['banner', 'elevated'], { dy: 8 }));
const keepBanners = [8458, 8474, 8490, 8510, 8526, 8542].map((x, k) => a(H(`banner.keep.${k + 1}`), x, 2598.5, 180, ['banner', 'elevated'], { dy: 10 }));

// ---------------------------------------------------------------- doors
export const DOORS = [
  { doorId: 'tilted-anvil', anchor: H('tilted-anvil.door'), x: 8200, z: 1652, heading: 180 },
  { doorId: 'tilted-anvil-back', anchor: H('tilted-anvil-back.door'), x: 8200, z: 1683.5, heading: 0 },
  { doorId: 'keep-hall', anchor: H('keep-hall.door'), x: 8500, z: 2596, heading: 180 },
  { doorId: 'counting-house', anchor: H('counting-house.door'), x: 8786, z: 1990, heading: 270 },
  { doorId: 'archive', anchor: H('archive.door'), x: 8806, z: 2080, heading: 270 },
  { doorId: 'underways', anchor: H('underways.door'), x: 7958, z: 1545, heading: 90 },
] as const;

// ---------------------------------------------------------------- everything else
const anchors: AnchorSpec[] = [
  ...gateAnchors,
  a(H('gate.south.threshold'), 8500, 1256, 0, ['poi', 'gate']),
  ...numbered(H('gate.south.queue'), [[8488, 1226], [8500, 1214], [8512, 1202]], ['poi'], 0),
  a(H('square.gate'), 8500, 1330, 0, ['poi', 'flood-seed']),
  a(H('square.fountain'), 8500, 1745, 0, ['poi']),
  a(H('square.market'), 8780, 1520, 0, ['poi']),
  a(H('keep-road.start'), 8500, 1760, 0, ['poi']),
  a(H('keep-road.end'), 8500, 2550, 0, ['poi']),
  a(H('barracks.yard'), 8362, 1380, 0, ['poi']),
  a(H('barracks.door'), 8360, 1311, 180, ['poi']),
  a(H('stables.yard'), 8640, 1375, 0, ['poi']),
  a(H('stables.door'), 8640, 1311, 180, ['poi']),
  a(H('forge-row.centre'), 8180, 1520, 0, ['poi']),
  a(H('dunstan.forge'), 8178, 1496, 0, ['poi']),
  a(H('guildhall.door'), 8870, 1583, 180, ['poi']),
  a(H('chapel.court'), 8365, 2150, 90, ['poi']),
  a(H('chapel.door'), 8349, 2150, 90, ['poi']),
  a(H('bastion.yard'), 8200, 1735, 180, ['poi']),
  a(H('bastion.steps'), 8200, 1787, 180, ['poi']),
  a(H('bastion.drill.blocker'), 8165, 1712, 0, ['drill']),
  a(H('bastion.drill.dodge-lane'), 8240, 1710, 0, ['drill']),
  a(H('rooftop.centre'), WARD.cx, 2220, 0, ['poi']),
  a(H('keep.court'), 8500, 2575, 180, ['poi']),
  a(H('smelter-gate'), polar(231.4, 738).x, polar(231.4, 738).z, inward(231.4), ['poi']),
  ...DOORS.map((d) => a(d.anchor, d.x, d.z, d.heading, ['poi', 'door'])),
  ...trainerAnchors,
  ...postAnchors,
  // Economy (thread 19): talking and shopping are separate spots, at least 3 m apart.
  a('shop.wystan', 8171, 1787, 180, ['shop']),
  a('shop.merrin', 8782, 1978, 270, ['shop']),
  a('shop.dunstan', 8183, 1501, 0, ['shop']),
  a('shop.gerta', 8791, 1512, 300, ['shop', 'needs-attendant']),
  a('shop.ashdown', 8262, 1739, 90, ['shop']),
  a('chest.harrowmark.1', 8270, 1520, 270, ['chest']),
  a('chest.harrowmark.2', 8925, 1523, 90, ['chest']),
  a('chest.harrowmark.3', 8830, 2115, 180, ['chest']),
  a('chest.harrowmark.4', 8540, 2520, 270, ['chest']),
  // Quest anchors (thread 6)
  a('m06.gate-brazier', 8533.5, 1284, 90, ['quest']),
  // M06 watch-guard posts on the gate square, facing the gate (thread 5's spawner reads these; the yaw is the starting facing).
  a('spawn.m06.watch-1', 8478, 1270, 180, ['spawn']),
  a('spawn.m06.watch-2', 8522, 1270, 180, ['spawn']),
  a('spawn.m06.watch-3', 8512, 1300, 180, ['spawn']),
  a('m07.bastion-yard', 8200, 1715, 180, ['quest']),
  a('m07.satchel', 8975, 1523, 90, ['quest', 'pickup']),
  ...numbered('m07.thieves', [[8990, 1514], [8995, 1530], [8984, 1536]], ['spawn'], 270),
  a('r03.brewing-copper', 8870, 1620, 0, ['quest', 'pickup']),
  ...numbered('r03.guildhall', [[8850, 1577], [8890, 1577], [8870, 1566]], ['spawn'], 180),
  a('m10.courier-orders', 8600, 2475, 180, ['quest', 'pickup']),
  a('r04.page-1', 8700, 1510, 0, ['quest', 'pickup']),
  a('r04.page-2', 8150, 1530, 0, ['quest', 'pickup']),
  a('r04.page-3', 8330, 2195, 0, ['quest', 'pickup']),
  // Stealth (thread 18)
  a('stealth.m06.start', 8500, 1234, 0, ['stealth']),
  a('stealth.m06.cp.inside', 8500, 1275, 0, ['stealth']),
  a('stealth.m06.end', 8500, 1300, 0, ['stealth']),
  ...['gate-cart', 'gate-barrels', 'gate-wall-shadow', 'stable-hay'].map((n, k) => {
    const h = HIDES.find((q) => q.name === n)!;
    return a(`hide.m06.${k + 1}`, h.x, h.z, h.heading, ['hide']);
  }),
  ...HIDES.map((h) => a(H(`hide.${h.name}`), h.x, h.z, h.heading, ['hide'])),
  ...ROOF_HIDES.map((h) => a(H(`hide.${h.name}`), h.x, h.z, h.heading, ['hide', 'elevated'], { dy: h.roof!.height })),
  ...PATROLS.flatMap((p) => numbered(`${p.id}`, p.pts, ['patrol'], 0)),
  // Chase
  ...CHASE_M10.map((n, i) => a(`chase.m10.${i}`, n.x, n.z, 0, ['chase', n.tag, ...(n.roof ? ['elevated'] : [])], n.roof ? { dy: n.roof } : {})),
  ...numbered('chase.m10.alt', CHASE_ALT, ['chase', 'run'], 0),
  // Crowd lanes (17b)
  ...LANES.flatMap((l) => numbered(H(`lane.${l.name}`), l.pts, ['lane'], 0)),
  // World change
  ...brazierAnchors,
  ...bastionBanners,
  ...keepBanners,
];

const triggers: TriggerSpec[] = [
  ...DOORS.map((d) => ({ id: `trg.harrowmark.door.${d.doorId}`, shape: 'sphere' as const, x: d.x, z: d.z, radius: 2 })),
  { id: 'trg.harrowmark.gate-south', shape: 'sphere', x: 8500, z: 1256, radius: 6 },
  // The Bastion training yard (fence 140 x 110 about (8200, 1735)); the quests plan uses it.
  { id: 'trg.harrowmark.bastion-yard', shape: 'box', x: 8200, z: 1735, half: [70, 6, 55] },
];

const patrols: PatrolSpec[] = PATROLS.map((p) => ({ id: p.id, loop: p.loop, points: p.pts.map((_, i) => `${p.id}.${i + 1}`) }));

export const HARROWMARK_LAYOUT: LayoutData = {
  // the Act 1 density pass adds its anchors, triggers and NPCs (src/harrowmark/density.layout.ts)
  anchors: [...anchors, ...DENSITY_LAYOUT_HM.anchors],
  triggers: [...triggers, ...DENSITY_LAYOUT_HM.triggers],
  structures,
  patrols,
  npcs: [...HARROWMARK_NPCS, ...DENSITY_LAYOUT_HM.npcs],
  fields: [],
};

export { PORTCULLIS_ID };
