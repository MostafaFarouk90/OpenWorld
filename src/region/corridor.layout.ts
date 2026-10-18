// Brightwater beyond Kettlewick (slice 2 thread 4, phase A): Hollin Ford, the Dead Road corridor, the chapel ledge and
// vault door, Wynn's field, the reed island, the wardstones, the Quenchstone basin and the fog gate. Engine metres,
// +Z north. Headings are written as compass headings and stored as yaw = heading + 180, as in brightwater.layout.ts.
// Heights are never stored; sites sit on flat ground (the validator proves it) because the terrain has no cliff,
// river or brook of its own: the ledges are rock structures and the water is a draped ribbon (waterRibbon.ts).
import { ROAD_EAST_X, ROAD_Z } from './deadRoad';
import type { AnchorSpec, LayoutData, NpcSpec, StructureSpec, TriggerSpec } from './layoutTypes';

const a = (id: string, x: number, z: number, heading: number, tags: string[] = [], rest: Partial<AnchorSpec> = {}): AnchorSpec => ({
  id,
  x,
  z,
  yawDeg: (heading + 180) % 360,
  tags,
  ...rest,
});

/** The ledge template: a 1.8 m platform, 6 m of rock behind it and either side, the open face to the south. */
export function ledgeCluster(prefix: string, cx: number, cz: number): StructureSpec[] {
  return [
    { id: `${prefix}-ledge`, kind: 'rock', x: cx, z: cz, yawDeg: 0, footprint: [6, 5], mode: 'solid', height: 1.8, role: 'ledge' },
    { id: `${prefix}-wall-n`, kind: 'rock', x: cx, z: cz + 4, yawDeg: 0, footprint: [12, 3], mode: 'solid', height: 6 },
    { id: `${prefix}-wall-w`, kind: 'rock', x: cx - 4.5, z: cz, yawDeg: 0, footprint: [3, 5], mode: 'solid', height: 6 },
    { id: `${prefix}-wall-e`, kind: 'rock', x: cx + 4.5, z: cz, yawDeg: 0, footprint: [3, 5], mode: 'solid', height: 6 },
  ];
}

/** Where the Dead Road ends in phase A: the slice fog wall. */
export const FOG_WALL_X = ROAD_EAST_X;

const anchors: AnchorSpec[] = [
  // Hollin Ford: toll-post on the bridge's east end, stranded cart and carters on the west bank.
  a('waystone.hollin-ford', -398, -140, 0, ['waystone']),
  a('ford.toll-post', -412, -150, 270, ['spawn', 'toll-post']),
  a('ford.carters.cart', -441, -139.5, 0, ['poi']),
  a('ford.carters.walk-off', -472, -166, 270, ['poi']),
  a('spawn.ford.pair-1', -395, -158, 270, ['spawn']),
  a('spawn.ford.pair-2', -395, -142, 270, ['spawn']),
  a('npc-post.gaut.ford', -405, -156, 270, ['npc-post']),
  a('npc-post.carter-1', -445, -142, 90, ['npc-post']),
  a('npc-post.carter-2', -438, -139.5, 270, ['npc-post']),

  // The Grey Goose: Tobb waits beside the door until he joins.
  a('npc-post.tobb', -13, 134, 90, ['npc-post']),

  // The chapel: Leap ledge, the Heartshard study, the vault door and Aelfreda's post there.
  a('poi.leap.chapel-ledge', 72, 90, 180, ['poi', 'leap-gated'], { dy: 1.8, onStructure: 'chapel-ledge' }),
  a('poi.leap.chapel-ledge.launch', 72, 83, 0, ['poi']),
  a('chapel.shard-study', 54.5, 63, 0, ['interact'], { onStructure: 'chapel' }),
  // Faces away from the stair (compass 180): the vault exit arrives 1.6 m in front of it.
  a('vault.door', 55.5, 64.5, 180, ['poi', 'door'], { onStructure: 'chapel' }),
  a('npc-post.aelfreda.vault', 53, 65.5, 90, ['npc-post'], { onStructure: 'chapel' }),

  // R01: Wynn's barley (barley-west, x -40..-8, z 8..50).
  a('r01.brazier.1', -16, 14, 0, ['fx']),
  a('r01.brazier.2', -30, 44, 0, ['fx']),
  a('r01.scarecrow.1', -38, 12, 0, ['spawn', 'r01-scarecrow']),
  a('r01.scarecrow.2', -38, 28, 0, ['spawn', 'r01-scarecrow']),
  a('r01.scarecrow.3', -38, 46, 0, ['spawn', 'r01-scarecrow']),
  a('r01.scarecrow.4', -10, 12, 0, ['spawn', 'r01-scarecrow']),
  a('r01.scarecrow.5', -10, 24, 0, ['spawn', 'r01-scarecrow']),
  a('r01.scarecrow.6', -24, 28, 0, ['spawn', 'r01-scarecrow']),

  // The reed island at the river's mouth.
  a('poi.leap.reed-island', 55, -300, 180, ['poi', 'leap-gated'], { dy: 1.8, onStructure: 'reed-island-ledge' }),
  a('poi.leap.reed-island.launch', 55, -307, 0, ['poi']),

  // Wardstones (anchors only; the stones are thread 7's).
  a('wardstone.1', 300, -146, 0, ['wardstone']),
  a('wardstone.2', 420, -146, 0, ['wardstone']),
  a('wardstone.3', 540, -146, 0, ['wardstone']),
  a('wardstone.4', 660, -146, 0, ['wardstone']),
  a('wardstone.5', 780, -146, 0, ['wardstone']),

  // The Quenchstone basin (the shrine is thread 7's; the waystone stands on its pillar).
  a('shrine.quenchstone.basin', 965, -165, 0, ['poi']),
  a('waystone.quenchstone', 965, -162, 0, ['waystone']),

  // The slice fog gate, a few metres west of the wall.
  a('fog.harrowmark', FOG_WALL_X, ROAD_Z, 90, ['poi']),

  // Road patrols (two members each, gated by thread 5).
  a('spawn.deadroad.patrol-1', 240, -150, 90, ['spawn']),
  a('spawn.deadroad.patrol-2', 620, -150, 90, ['spawn']),
  a('patrol.deadroad.1.1', 220, -150, 90, ['patrol']),
  a('patrol.deadroad.1.2', 240, -150, 90, ['patrol']),
  a('patrol.deadroad.1.3', 260, -150, 90, ['patrol']),
  a('patrol.deadroad.1.4', 240, -138, 90, ['patrol']),
  a('patrol.deadroad.2.1', 600, -150, 90, ['patrol']),
  a('patrol.deadroad.2.2', 620, -150, 90, ['patrol']),
  a('patrol.deadroad.2.3', 640, -150, 90, ['patrol']),
  a('patrol.deadroad.2.4', 620, -138, 90, ['patrol']),

  // Ash piles for Release (thread 1 spends them): the churchyard and the road.
  a('pile.churchyard.1', 28, 54, 0, ['pile']),
  a('pile.churchyard.2', 34, 58, 0, ['pile']),
  a('pile.churchyard.3', 30, 64, 0, ['pile']),
  a('pile.churchyard.4', 36, 66, 0, ['pile']),
  a('pile.deadroad.1', 150, -154, 0, ['pile']),
  a('pile.deadroad.2', 330, -154, 0, ['pile']),
  a('pile.deadroad.3', 450, -154, 0, ['pile']),
  a('pile.deadroad.4', 570, -154, 0, ['pile']),
  a('pile.deadroad.5', 690, -154, 0, ['pile']),
  a('pile.deadroad.6', 840, -154, 0, ['pile']),
];

const triggers: TriggerSpec[] = [
  { id: 'trg.ford.toll-post', shape: 'sphere', x: -410, z: -150, radius: 9 },
  { id: 'trg.leap.chapel-ledge', shape: 'sphere', x: 72, z: 90, dy: 1.8, radius: 2.5 },
  { id: 'trg.vault.door', shape: 'sphere', x: 55.5, z: 64.5, radius: 2 },
  { id: 'trg.wardstones.road', shape: 'box', x: 540, z: -146, half: [260, 40, 20] },
  { id: 'trg.shrine.basin', shape: 'sphere', x: 965, z: -165, radius: 10 },
];

const structures: StructureSpec[] = [
  { id: 'ford-bridge', kind: 'bridge', x: -420, z: -150, yawDeg: 0, footprint: [8, 4], mode: 'open' },
  { id: 'ford-cart', kind: 'cart', x: -441, z: -142, yawDeg: 0, footprint: [2.6, 1.2], mode: 'solid', height: 1 },
  { id: 'crypt-stair', kind: 'stair', x: 55.5, z: 66.4, yawDeg: 0, footprint: [2.4, 2.4], mode: 'open', inside: 'chapel' },
  ...ledgeCluster('chapel', 72, 90),
  ...ledgeCluster('reed-island', 55, -300),
  { id: 'waystone-hollin-ford', kind: 'waystone', x: -398, z: -138.2, yawDeg: 0, footprint: [1.6, 1.6], mode: 'solid', height: 2.4 },
  { id: 'waystone-quenchstone', kind: 'waystone', x: 965, z: -160.2, yawDeg: 0, footprint: [1.6, 1.6], mode: 'solid', height: 2.4 },
];

const npcs: NpcSpec[] = [
  { id: 'tobb', post: 'npc-post.tobb', idleClip: 'Idle', absentWhen: 'story.m05.tobbJoined' },
  { id: 'carter-1', post: 'npc-post.carter-1', idleClip: 'Idle', walkOff: { whenFlag: 'story.m04.cartersFreed', to: 'ford.carters.walk-off' } },
  { id: 'carter-2', post: 'npc-post.carter-2', idleClip: 'Idle', walkOff: { whenFlag: 'story.m04.cartersFreed', to: 'ford.carters.walk-off' } },
];

export const CORRIDOR_LAYOUT: LayoutData = {
  anchors,
  triggers,
  structures,
  patrols: [],
  npcs,
  fields: [],
};
