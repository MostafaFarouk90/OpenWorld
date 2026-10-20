// Act 1 density pass, batch 1 (the quests thread; additive to thread 4's Brightwater layout): the anchors, triggers,
// structures and NPCs the fuller M01, M02, M03, M04 and R01 need. Engine metres, +Z north; headings are compass
// headings stored as yaw = heading + 180, as in brightwater.layout.ts. Everything stays clear of the tutorial's beat
// triggers and of the solid footprints (the validator proves it).
import type { AnchorSpec, LayoutData, NpcSpec, StructureSpec, TriggerSpec } from './layoutTypes';

const a = (id: string, x: number, z: number, heading: number, tags: string[] = [], rest: Partial<AnchorSpec> = {}): AnchorSpec => ({
  id,
  x,
  z,
  yawDeg: (heading + 180) % 360,
  tags,
  ...rest,
});

const anchors: AnchorSpec[] = [
  // M01: well buckets for the Grey Goose door, its fire, the mill's wraiths and the miller.
  a('m01.bucket-1', 2.2, 128.6, 90, ['carry']),
  a('m01.bucket-2', 2.2, 131.4, 90, ['carry']),
  a('kettlewick.fire-tavern-door', -17.4, 135.2, 90, ['fx']),
  a('spawn.m01.mill-1', -37, 158, 0, ['spawn']),
  a('spawn.m01.mill-2', -53, 158, 0, ['spawn']),
  a('spawn.m01.mill-3', -37, 172, 180, ['spawn']),
  a('spawn.m01.mill-4', -53, 172, 180, ['spawn']),
  a('npc-post.aldwin', -38.6, 165, 90, ['npc-post']),
  a('m01.miller.walk-off', 39, 66, 90, ['poi']),

  // M02: well buckets for the bakery door, its fire, the thatch over the hearth, the oven yard, the badge in the loft,
  // the granary (Edda, Garrick, the Regent's order) and the common hearth in the Grey Goose yard.
  a('m02.bucket-1', -2.2, 128.6, 270, ['carry']),
  a('m02.bucket-2', -2.2, 131.4, 270, ['carry']),
  a('kettlewick.fire-bakery-door', 18.4, 135.4, 270, ['fx']),
  a('m02.rubble-1', 22.6, 130.2, 0, ['interact'], { onStructure: 'bakery' }),
  a('m02.rubble-2', 21, 131.4, 0, ['interact'], { onStructure: 'bakery' }),
  a('spawn.m02.oven-1', 32, 128, 270, ['spawn']),
  a('spawn.m02.oven-2', 32, 136, 270, ['spawn']),
  a('spawn.m02.oven-3', 34, 132, 270, ['spawn']),
  a('m02.badge', 20.6, 135.6, 90, ['interact'], { onStructure: 'bakery' }),
  a('npc-post.edda.granary', -36.4, 145, 270, ['npc-post']),
  a('npc-post.garrick', -36.6, 149, 270, ['npc-post']),
  a('m02.order-board', -36.8, 141.6, 270, ['interact']),
  a('m02.common-hearth', -11.5, 127, 0, ['interact']),

  // M03: the cracked font, the Kindling Ember read, the Hearthkeepers' record, the candle on the cliff ledge and
  // Brother Wulfric's grave on the churchyard's west edge.
  a('chapel.font', 48.4, 56.6, 90, ['interact'], { onStructure: 'chapel' }),
  a('chapel.ember-study', 55.4, 61.8, 90, ['interact'], { onStructure: 'chapel' }),
  a('chapel.record', 48.4, 66, 90, ['interact'], { onStructure: 'chapel' }),
  a('m03.candle', 73.2, 89.2, 180, ['poi', 'leap-gated'], { dy: 2, onStructure: 'chapel-ledge' }),
  a('m03.grave-wulfric', 23.5, 61, 90, ['interact']),

  // M04: the sergeant's spot on the bridge, the toll box, three chained wagons and the third carter.
  a('spawn.ford.sergeant', -419, -150, 90, ['spawn']),
  a('m04.toll-box', -411, -153.4, 270, ['interact']),
  a('m04.wagon-1', -439.4, -143.6, 0, ['interact']),
  a('m04.wagon-2', -447, -131.4, 0, ['interact']),
  a('m04.wagon-3', -435, -129.4, 0, ['interact']),
  a('npc-post.carter-3', -441, -126.8, 180, ['npc-post']),

  // R01: the shawl on the west fence, two scarecrows in the east field, the root's wraiths, the stakes of a saved
  // field, and the stubble fire of a scorched one with Wynn's trough buckets.
  a('r01.shawl', -7.2, 30, 270, ['interact']),
  a('r01.scarecrow.7', 14, 20, 0, ['spawn', 'r01-scarecrow']),
  a('r01.scarecrow.8', 28, 32, 0, ['spawn', 'r01-scarecrow']),
  a('spawn.r01.root-1', -30, 20, 0, ['spawn']),
  a('spawn.r01.root-2', -27, 17, 0, ['spawn']),
  a('spawn.r01.root-3', -33, 17, 0, ['spawn']),
  a('r01.stake-1', -20, 40, 0, ['interact']),
  a('r01.stake-2', -34, 36, 0, ['interact']),
  a('r01.stake-3', -14, 31, 0, ['interact']),
  a('r01.fire-stubble', 30, 38, 0, ['fx']),
  a('r01.bucket-1', -6, 48, 90, ['carry']),
  a('r01.bucket-2', -6, 50, 90, ['carry']),

  // ---- batch 2: the chapel altar where D01's censer is set ----
  a('d01.altar', 55.9, 60, 90, ['interact'], { onStructure: 'chapel' }),

  // ---- batch 2: the Dead Road (M05) ----
  // A pilgrim's pack under a toppled milestone, halfway between the second and third stones.
  a('m05.journal', 480, -134, 180, ['interact']),
  // The dead's last push at the Quenchstone basin, after the fifth stone.
  a('spawn.m05.shrine-1', 952, -174, 90, ['spawn']),
  a('spawn.m05.shrine-2', 978, -174, 270, ['spawn']),
  a('spawn.m05.shrine-3', 952, -154, 90, ['spawn']),
  a('spawn.m05.shrine-4', 978, -154, 270, ['spawn']),
  // Road points of interest (design 4.3, outside any quest): two waymarker stones of the road's dead and a barrow whose
  // two wraiths never respawn.
  a('poi.deadroad.stone-1', 200, -134, 180, ['poi']),
  a('poi.deadroad.stone-2', 700, -168, 0, ['poi']),
  a('poi.deadroad.barrow', 860, -126, 180, ['poi']),
  a('spawn.deadroad.barrow-1', 855, -122, 180, ['spawn']),
  a('spawn.deadroad.barrow-2', 865, -122, 180, ['spawn']),
];

const triggers: TriggerSpec[] = [
  { id: 'm01.tavern-door', shape: 'sphere', x: -15.5, z: 133, radius: 3 },
  { id: 'm02.bakery-door', shape: 'sphere', x: 17.6, z: 132.2, radius: 1.5 },
  { id: 'm02.granary', shape: 'sphere', x: -35.5, z: 145, radius: 4 },
  { id: 'r01.stubble', shape: 'sphere', x: 30, z: 38, radius: 3 },
];

const structures: StructureSpec[] = [
  // Kettlewick's granary, the one Cael refused to burn (design 1), between the Practice Yard and the mill.
  { id: 'granary', kind: 'house', x: -42, z: 145, yawDeg: 0, footprint: [8, 8], mode: 'solid' },
  // Two more stranded wagons at Hollin Ford.
  { id: 'ford-cart-2', kind: 'cart', x: -447, z: -133, yawDeg: 0, footprint: [2.6, 1.2], mode: 'solid', height: 1 },
  { id: 'ford-cart-3', kind: 'cart', x: -435, z: -131, yawDeg: 0, footprint: [2.6, 1.2], mode: 'solid', height: 1 },
];

const npcs: NpcSpec[] = [
  { id: 'aldwin', post: 'npc-post.aldwin', idleClip: 'Idle', walkOff: { whenFlag: 'story.m01.millerSafe', to: 'm01.miller.walk-off' } },
  { id: 'garrick', post: 'npc-post.garrick', idleClip: 'Idle' },
  { id: 'carter-3', post: 'npc-post.carter-3', idleClip: 'Idle', walkOff: { whenFlag: 'story.m04.cartersFreed', to: 'ford.carters.walk-off' } },
];

export const DENSITY_LAYOUT_A: LayoutData = { anchors, triggers, structures, patrols: [], npcs, fields: [] };
