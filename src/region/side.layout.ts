// Act 1 side jobs (the quests thread; additive to thread 4's Brightwater layout, spread into BRIGHTWATER_LAYOUT after
// DENSITY_LAYOUT_A): the anchors, triggers, structures and NPCs of the Kettlewick jobs j01 and j02. The Dead Road jobs (j03,
// j04) sit in corridor.layout.ts with the other corridor sites, because the layout tests keep BRIGHTWATER's own structures
// inside the flat meadow. Engine metres, +Z north; headings are
// compass headings stored as yaw = heading + 180, as in brightwater.layout.ts. Every point was picked clear of the
// environment pass's props (3 m) and of every structure footprint, on flat meadow (height exactly 0). Later rounds add the
// Harrowmark and Underways jobs in their own layouts.
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
  // j01 Hob's Strayed Lambs: the fold east of Hob's post, and three lambs in the barley (the stubble-fire scar, the
  // scarecrow field, the stepping stones of the lane drain).
  a('j01.fold', 52, 30, 270, ['poi']),
  a('j01.lamb-1', 31, 41, 90, ['carry']),
  a('j01.lamb-2', 22, 26, 90, ['carry']),
  a('j01.lamb-3', 81, 110, 90, ['carry']),

  // j02 Edda's Bread Round: the basket on the bakery step, the widow at the lane end and the chapel sexton at his cottage
  // door (the north-east corner of house-10's yard).
  a('j02.basket', 15, 137, 90, ['interact']),
  a('npc-post.orla', 20.5, 114.5, 180, ['npc-post']),
  a('npc-post.osmund', -10, 48, 90, ['npc-post']),
];

const triggers: TriggerSpec[] = [
  { id: 'j01.fold', shape: 'sphere', x: 52, z: 30, radius: 4 },
  { id: 'j01.scar', shape: 'sphere', x: 31, z: 41, radius: 6 },
  { id: 'j01.scarecrows', shape: 'sphere', x: 22, z: 26, radius: 7 },
  { id: 'j01.ford', shape: 'sphere', x: 81, z: 110, radius: 6 },
];

const structures: StructureSpec[] = [
  // Hob's fold: a low open pen (no blocking footprint).
  { id: 'j01-fold-pen', kind: 'yard-fence', x: 52, z: 30, yawDeg: 0, footprint: [9, 7], mode: 'open' },
];

const npcs: NpcSpec[] = [
  // They are in the lanes once M02 is done (quests/content/objectiveFlags.ts), when Edda sends Cael round with the bread.
  { id: 'orla', post: 'npc-post.orla', idleClip: 'Idle', presentWhen: 'story.side.kettlewickOpen' },
  { id: 'osmund', post: 'npc-post.osmund', idleClip: 'Idle', presentWhen: 'story.side.kettlewickOpen' },
];

export const SIDE_LAYOUT_A: LayoutData = { anchors, triggers, structures, patrols: [], npcs, fields: [] };
