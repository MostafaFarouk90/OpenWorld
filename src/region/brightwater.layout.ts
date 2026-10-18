// The Brightwater tutorial footprint, in engine metres from the origin, +Z north.
// Anchor facings are written as compass headings (0 faces north/+Z, 90 faces east/+X) and stored as the
// engine's yaw, where yaw 0 faces -Z, so yawDeg = heading + 180 (contracts/world-layout-and-npcs.md section 4).
// Everything sits inside the flat meadow (SPAWN_FLAT_RADIUS) except the beyond-the-village anchors.
import type { AnchorSpec, LayoutData, StructureSpec, TriggerSpec } from './layoutTypes';

const a = (id: string, x: number, z: number, heading: number, tags: string[] = [], rest: Partial<AnchorSpec> = {}): AnchorSpec => ({
  id,
  x,
  z,
  yawDeg: (heading + 180) % 360,
  tags,
  ...rest,
});

const anchors: AnchorSpec[] = [
  // Spawn and the barley loft (T01 to T02).
  a('brightwater.player-spawn', 0, 0, 0, ['spawn']),
  a('brightwater.loft-bed', 0, 2, 0, ['poi']),
  a('brightwater.gate', 0, 25, 0, ['poi']),
  a('brightwater.scarecrow', 3, 27, 0, ['spawn', 'scarecrow']),

  // The lane.
  a('lane.start', 0, 32, 0, ['poi']),
  a('lane.cart', 0, 66, 0, ['poi']),
  a('lane.fence', 0, 87, 0, ['poi']),
  a('lane.end', 0, 108, 0, ['poi']),

  // Kettlewick.
  a('kettlewick.square', 3, 127, 0, ['poi']),
  a('kettlewick.gate', 0, 165, 0, ['poi']),
  a('kettlewick.bakery-door', 17, 132, 90, ['poi']),
  a('kettlewick.bakery-counter', 25, 132, 270, ['poi']),
  a('kettlewick.barrel', 27, 135, 0, ['interact']),
  a('kettlewick.bakery-hearth', 21.5, 129, 0, ['interact'], { onStructure: 'bakery' }),
  a('kettlewick.bakery-fire', 26, 128, 0, ['fx'], { onStructure: 'bakery' }),
  a('kettlewick.notice-board', -9, 124, 0, ['interact']),
  a('kettlewick.tavern-door', -16, 132, 270, ['poi']),

  // Practice Yard and the Replay board.
  a('yard.centre', -45, 120, 0, ['poi']),
  a('yard.board', -45, 127, 180, ['poi']),
  a('yard.dummy-1', -40, 117, 0, ['dummy']),
  a('yard.dummy-2', -50, 117, 0, ['dummy']),
  a('yard.blocker', -52, 125, 90, ['replay']),
  a('yard.dodge-lane', -36, 125, 0, ['replay']),
  a('yard.pole-1', -53.5, 111, 90, ['replay']),
  a('yard.pole-2', -53.5, 121, 90, ['replay']),

  // Brightwater Chapel and the churchyard to its west.
  a('chapel.yard-centre', 32, 60, 90, ['poi']),
  a('chapel.door', 46, 60, 90, ['poi', 'door']),
  a('chapel.kneel', 53, 60, 90, ['poi'], { onStructure: 'chapel' }),
  a('chapel.altar', 57, 60, 90, ['poi'], { onStructure: 'altar' }),
  // T02 look targets: banners hung on the chapel's west face, either side of the door.
  a('chapel.banner-1', 45.6, 54, 270, ['elevated', 'banner'], { dy: 5 }),
  a('chapel.banner-2', 45.6, 57, 270, ['elevated', 'banner'], { dy: 5 }),
  a('chapel.banner-3', 45.6, 63, 270, ['elevated', 'banner'], { dy: 5 }),

  // Waystones: the anchor is where the player stands (fast travel, respawn), 1.8 m south of the stone, facing it.
  // Thread 6 owns the stones' behaviour and finds them by tag.
  a('waystone.chapel', 40, 45, 0, ['waystone']),
  a('waystone.kettlewick', 12, 156, 0, ['waystone', 'waystone-lit']),
  a('waystone.north', 10, 310, 0, ['waystone']),

  // NPC posts.
  a('npc-post.gaut', -3, 24, 180, ['npc-post']),
  a('npc-post.edda', 25, 131, 270, ['npc-post']),
  a('npc-post.stane', -40, 128, 90, ['npc-post']),
  a('npc-post.aelfreda', 52, 64, 90, ['npc-post'], { onStructure: 'chapel' }),
  a('npc-post.hob', 42, 47, 0, ['npc-post']),
  a('npc-post.wynn', -9, 44, 90, ['npc-post']),

  // Tutorial beats: where each starts.
  a('beat.t01.start', 0, 2, 0, ['beat']),
  a('beat.t02.start', 3, 26, 0, ['beat']),
  a('beat.t03.start', 0, 32, 0, ['beat']),
  a('beat.t04.start', 40, 60, 90, ['beat']),
  a('beat.t05.start', 38, 60, 90, ['beat']),
  a('beat.t06.start', 40, 60, 270, ['beat']),
  a('beat.t07.start', 0, 62, 0, ['beat']),
  a('beat.t08.start', 0, 95, 0, ['beat']),
  a('beat.t09.start', 0, 112, 0, ['beat']),
  a('beat.t10.start', 0, 114, 0, ['beat']),
  a('beat.t11.start', 0, 120, 0, ['beat']),
  a('beat.t12.start', 14, 132, 90, ['beat']),
  a('beat.t13.start', 24, 133, 0, ['beat']),
  a('beat.t14.start', 38, 48, 0, ['beat']),
  a('beat.t15.start', 0, 158, 0, ['beat']),

  // Enemy spawn points per beat.
  a('spawn.t05.wraith-1', 30, 52, 90, ['spawn']),
  a('spawn.t05.wraith-2', 30, 68, 90, ['spawn']),
  a('spawn.t05.wraith-3', 36, 60, 90, ['spawn']),
  a('spawn.t08.wraith-1', -3, 104, 180, ['spawn']),
  a('spawn.t08.wraith-2', 3, 106, 180, ['spawn']),
  a('spawn.t08.wraith-3', 0, 110, 180, ['spawn']),
  a('spawn.t09.soldier-1', 0, 120, 180, ['spawn']),
  a('spawn.t10.wraith-1', 0, 124, 180, ['spawn']),
  a('spawn.t11.wraith-1', -8, 138, 180, ['spawn']),
  a('spawn.t11.wraith-2', 8, 138, 180, ['spawn']),
  a('spawn.t11.wraith-3', 0, 142, 180, ['spawn']),
  a('spawn.t15.wave-1', -8, 190, 180, ['spawn']),
  a('spawn.t15.wave-2', 8, 190, 180, ['spawn']),
  a('spawn.t15.wave-3', -4, 198, 180, ['spawn']),
  a('spawn.t15.wave-4', 4, 198, 180, ['spawn']),

  // M01 "Ash on the Wind": villagers to carry, wraiths in the lanes.
  a('m01.villager-1', -18, 150, 90, ['villager']),
  a('m01.villager-2', 22, 110, 270, ['villager']),
  a('m01.villager-3', -10, 56, 90, ['villager']),
  a('spawn.m01.wraith-1', 0, 45, 0, ['spawn']),
  a('spawn.m01.wraith-2', 0, 80, 0, ['spawn']),
  a('spawn.m01.wraith-3', -4, 128, 0, ['spawn']),
  a('spawn.m01.wraith-4', 4, 150, 0, ['spawn']),
  a('spawn.m01.wraith-5', -6, 112, 0, ['spawn']),

  // First open-world patrol, a ring of radius 20 around (0, 400): 215 m past the Kettlewick gate.
  a('patrol.north.1', 20, 400, 0, ['patrol']),
  a('patrol.north.2', 0, 420, 0, ['patrol']),
  a('patrol.north.3', -20, 400, 0, ['patrol']),
  a('patrol.north.4', 0, 380, 0, ['patrol']),
  a('spawn.patrol.wraith-1', 0, 400, 0, ['spawn']),
];

const triggers: TriggerSpec[] = [
  { id: 'trg.t01.gate', shape: 'sphere', x: 0, z: 25, radius: 3 },
  { id: 'trg.t03.stane', shape: 'sphere', x: -38, z: 122, radius: 5 },
  { id: 'trg.t03.edda', shape: 'sphere', x: 22, z: 131, radius: 4 },
  { id: 'trg.t04.chapel', shape: 'sphere', x: 50, z: 60, radius: 5 },
  { id: 'trg.t06.start', shape: 'sphere', x: 40, z: 60, radius: 3 },
  { id: 'trg.t06.end', shape: 'sphere', x: 0, z: 60, radius: 3 },
  { id: 'trg.t07.cart', shape: 'sphere', x: 0, z: 74, radius: 2.5 },
  { id: 'trg.t07.fence', shape: 'sphere', x: 0, z: 94, radius: 2.5 },
  { id: 'trg.t11.square', shape: 'box', x: 0, z: 130, half: [12, 30, 12] },
  { id: 'trg.t12.bakery', shape: 'box', x: 24, z: 132, half: [4.5, 30, 4.5] },
  { id: 'trg.t14.chapel', shape: 'sphere', x: 40, z: 45, radius: 4 },
  { id: 'trg.t14.kettlewick', shape: 'sphere', x: 12, z: 156, radius: 4 },
  { id: 'trg.t15.gate', shape: 'sphere', x: 0, z: 165, radius: 8 },
  { id: 'trg.yard.board', shape: 'sphere', x: -45, z: 127, radius: 6 },
  { id: 'trg.region.brightwater-north', shape: 'box', x: 0, z: 240, half: [80, 400, 4] },
  { id: 'm01.chapel-door', shape: 'sphere', x: 43, z: 60, radius: 3 },
  { id: 'm02.bakery', shape: 'box', x: 24, z: 132, half: [4.5, 30, 4.5] },
];

const house = (id: string, x: number, z: number): StructureSpec => ({
  id,
  kind: 'house',
  x,
  z,
  yawDeg: 0,
  footprint: [8, 8],
  mode: 'solid',
});

const structures: StructureSpec[] = [
  { id: 'loft', kind: 'loft', x: 0, z: 0, yawDeg: 0, footprint: [8, 8], mode: 'open' },
  { id: 'gate-lane', kind: 'gate', x: 0, z: 25, yawDeg: 0, footprint: [8, 1], mode: 'open' },
  { id: 'gate-kettlewick', kind: 'gate', x: 0, z: 165, yawDeg: 0, footprint: [10, 1], mode: 'open' },
  // T07: a cart and a fence that must be jumped (apex of a jump is about 1.05 m, so both stay low), with
  // fences either side so the lane is walled from house to house.
  { id: 'cart', kind: 'cart', x: 0, z: 70, yawDeg: 0, footprint: [4, 1], mode: 'solid', height: 0.6 },
  { id: 'fence-cart-w', kind: 'fence', x: -9, z: 70, yawDeg: 0, footprint: [14, 0.6], mode: 'solid', height: 0.6 },
  { id: 'fence-cart-e', kind: 'fence', x: 9, z: 70, yawDeg: 0, footprint: [14, 0.6], mode: 'solid', height: 0.6 },
  { id: 'fence-lane', kind: 'fence', x: 0, z: 90, yawDeg: 0, footprint: [32, 0.6], mode: 'solid', height: 0.6 },
  // Kettlewick: fourteen houses (bakery and tavern included), mill and well.
  {
    id: 'bakery',
    kind: 'bakery',
    x: 24,
    z: 132,
    yawDeg: 0,
    footprint: [10, 10],
    mode: 'enterable',
    door: { name: 'bakery', side: 'W', width: 2.4 },
  },
  { id: 'tavern', kind: 'tavern', x: -24, z: 132, yawDeg: 0, footprint: [12, 10], mode: 'solid' },
  house('house-01', -16, 100),
  house('house-02', 16, 104),
  house('house-03', -17, 118),
  house('house-04', -24, 150),
  house('house-05', 24, 150),
  house('house-06', -22, 164),
  house('house-07', 22, 164),
  house('house-08', -16, 80),
  house('house-09', 14, 76),
  house('house-10', -16, 56),
  house('house-11', -28, 96),
  house('house-12', 28, 110),
  { id: 'mill', kind: 'mill', x: -45, z: 165, yawDeg: 0, footprint: [10, 10], mode: 'solid' },
  { id: 'well', kind: 'well', x: 0, z: 130, yawDeg: 0, footprint: [2, 2], mode: 'solid' },
  { id: 'notice-board', kind: 'board', x: -9, z: 125, yawDeg: 0, footprint: [2, 0.4], mode: 'solid' },
  // Practice Yard.
  { id: 'yard-fence', kind: 'yard-fence', x: -45, z: 120, yawDeg: 0, footprint: [24, 24], mode: 'open' },
  { id: 'replay-board', kind: 'board', x: -45, z: 130, yawDeg: 0, footprint: [3, 0.4], mode: 'solid' },
  { id: 'pole-1', kind: 'pole', x: -55, z: 111, yawDeg: 0, footprint: [0.4, 0.4], mode: 'solid', height: 2.5 },
  { id: 'pole-2', kind: 'pole', x: -55, z: 121, yawDeg: 0, footprint: [0.4, 0.4], mode: 'solid', height: 2.5 },
  // Brightwater Chapel (door on the west wall, facing the churchyard).
  {
    id: 'chapel',
    kind: 'chapel',
    x: 52,
    z: 60,
    yawDeg: 0,
    footprint: [12, 18],
    mode: 'enterable',
    height: 8,
    door: { name: 'chapel', side: 'W', width: 2.4, openWhen: ['tutorial.t04.begin', 'tutorial.skipped'] },
  },
  { id: 'altar', kind: 'altar', x: 57, z: 60, yawDeg: 0, footprint: [1.6, 3], mode: 'solid', height: 1.1, inside: 'chapel' },
  { id: 'waystone-chapel', kind: 'waystone', x: 40, z: 46.8, yawDeg: 0, footprint: [1.6, 1.6], mode: 'solid', height: 2.4 },
  { id: 'waystone-kettlewick', kind: 'waystone', x: 12, z: 157.8, yawDeg: 0, footprint: [1.6, 1.6], mode: 'solid', height: 2.4 },
  { id: 'waystone-north', kind: 'waystone', x: 10, z: 311.8, yawDeg: 0, footprint: [1.6, 1.6], mode: 'solid', height: 2.4 },
];

export const BRIGHTWATER_LAYOUT: LayoutData = {
  anchors,
  triggers,
  structures,
  patrols: [{ id: 'patrol.north', points: ['patrol.north.1', 'patrol.north.2', 'patrol.north.3', 'patrol.north.4'], loop: true }],
  npcs: [
    { id: 'gaut', post: 'npc-post.gaut', idleClip: 'Idle' },
    { id: 'edda', post: 'npc-post.edda', idleClip: 'Idle' },
    { id: 'stane', post: 'npc-post.stane', idleClip: 'Idle' },
    { id: 'aelfreda', post: 'npc-post.aelfreda', idleClip: 'Idle' },
    { id: 'hob', post: 'npc-post.hob', idleClip: 'Idle' },
    { id: 'wynn', post: 'npc-post.wynn', idleClip: 'Idle' },
  ],
  fields: [
    { id: 'barley-west', x0: -40, z0: 8, x1: -8, z1: 50, count: 3500 },
    { id: 'barley-east', x0: 8, z0: 8, x1: 34, z1: 40, count: 2500 },
  ],
};
