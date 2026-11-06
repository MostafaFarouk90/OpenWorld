// The Act 4 world's anchors and triggers. L0 placed the fog wall faces (`ashroad.fog.*`, `waste.fog.*`); thread L1 the rest (prefixes `ashroad.`, `ashgate.`, `waste.`, `harrowmark.a4.` for the
// M41 camp only): the Ash Road's ends and junction, Ashgate and its refuge posts, the Waste's sites and L4's banter
// volumes. Positions come from act4Places.ts and src/terrain/shape/waste.ts. `waystone.*` and `npc-post.*` keep their
// contract names. Plain data; ACT4_WORLD_ANCHORS.md is generated from it by tools/gen-region-docs.ts (drift-tested).
import { ASH_ROAD_POINTS, CINDER_CHAPEL, CROSSING, GLASSLANDS, HUSK_CATHEDRAL, M41_CAMP, R24_SPRING, RIMFOOT, WALKER_CAMP, type XZ } from '../../terrain/shape/waste';
import type { Act4FogFaceId } from '../act4Fog';
import type { AnchorSpec, LayoutData, TriggerSpec } from '../layoutTypes';
import {
  ASHGATE_ARCH,
  ASHGATE_HORSE_POST,
  ASHGATE_WAYSTONE,
  HILD_POST,
  HILD_SHOP,
  REFUGE_ANVIL,
  REFUGE_BANNERS,
  REFUGE_CASKS,
  REFUGE_COMPANION_SPOTS,
  REFUGE_COMPANIONS,
  REFUGE_MINERS,
  REFUGE_NPCS,
  REFUGE_POSTS,
  REFUGE_REST,
  REFUGE_TRAINERS,
  REFUGE_VENDORS,
  refugeShop,
  refugeTrainer,
  WASTE_SITE_TRIGGERS,
} from './act4Places';
import { ACT4_FOG_FACE_ANCHORS, ACT4_FOG_FACE_POINTS } from './act4World';
import { ROPE_ANCHORS } from './ropeLines';
import { ACT4_STRUCTURES } from './act4Structures';

export const ACT4_WORLD_DOC = { title: 'Act 4 world anchors (the Ash Road, Ashgate and its refuge, the Waste, the fog walls)', source: 'act4/act4World.layout.ts' } as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Compass heading (0 = +Z, 90 = +X) from `p` toward `q`. */
const facing = (p: XZ, q: XZ): number => r2((((Math.atan2(q[0] - p[0], q[1] - p[1]) * 180) / Math.PI) % 360 + 360) % 360);
const at = (id: string, p: XZ, tags: string[] = [], yawDeg = 0): AnchorSpec => ({ id, x: r2(p[0]), z: r2(p[1]), yawDeg, tags });
const toFire = (id: string, p: XZ, tags: string[]) => at(id, p, tags, facing(p, REFUGE_REST));

/** The refuge: present from `story.m41.complete` (the posts' rules are L0's tables, filled by L4 and L7). */
const refuge: AnchorSpec[] = [
  at('ashgate.refuge.rest', REFUGE_REST, ['rest', 'camp']),
  at('ashgate.refuge.companions', REFUGE_COMPANIONS, ['npc-post']),
  ...(Object.keys(REFUGE_COMPANION_SPOTS) as (keyof typeof REFUGE_COMPANION_SPOTS)[]).map((c) => toFire(`ashgate.refuge.companion.${c}`, REFUGE_COMPANION_SPOTS[c], ['npc-post'])),
  ...REFUGE_NPCS.map((n) => toFire(`npc-post.${n}.refuge`, REFUGE_POSTS[n], ['npc-post'])),
  ...REFUGE_VENDORS.map((v) => toFire(`ashgate.refuge.shop.${v}`, refugeShop(v), ['shop'])),
  ...REFUGE_TRAINERS.map((t) => toFire(`ashgate.refuge.trainer.${t}`, refugeTrainer(t), ['trainer'])),
  toFire('ashgate.refuge.anvil', REFUGE_ANVIL, ['forge']),
  ...(Object.keys(REFUGE_BANNERS) as (keyof typeof REFUGE_BANNERS)[]).map((h) => at(`ashgate.refuge.banners.${h}`, REFUGE_BANNERS[h], ['dressing'])),
  ...REFUGE_MINERS.map((p, i) => toFire(`ashgate.refuge.miners.${i + 1}`, p, ['dressing'])),
  at('ashgate.refuge.casks', REFUGE_CASKS, ['dressing']),
];

/** L0's fog wall faces (contracts v0.8 item 3). */
const fogFaces: AnchorSpec[] = (Object.keys(ACT4_FOG_FACE_ANCHORS) as Act4FogFaceId[]).map((k) => ({
  id: ACT4_FOG_FACE_ANCHORS[k],
  x: ACT4_FOG_FACE_POINTS[k].x,
  z: ACT4_FOG_FACE_POINTS[k].z,
  yawDeg: 0,
  tags: ['fog-wall'],
}));

const first = ASH_ROAD_POINTS[0];
const last = ASH_ROAD_POINTS[ASH_ROAD_POINTS.length - 1];

const anchors: AnchorSpec[] = [
  at('ashroad.start', first, ['road'], facing(first, ASH_ROAD_POINTS[1])),
  at('ashroad.junction.underways', ASH_ROAD_POINTS[2], ['road', 'junction']),
  at('ashroad.end', last, ['road']),
  // L0's reserved id: M41's camp outside the north wall (L2 and L4 import it; the no-strand rule's target before M41).
  at('harrowmark.a4.m41.camp', M41_CAMP, ['camp']),
  // Ashgate, outside the Waste's south edge.
  at('ashgate.arch', ASHGATE_ARCH, ['gate'], 0),
  at('waystone.ashgate', ASHGATE_WAYSTONE, ['waystone']),
  at('npc-post.hild', HILD_POST, ['npc-post'], 180),
  at('ashgate.shop.hild', HILD_SHOP, ['shop'], 180),
  at('ashgate.horse-post', ASHGATE_HORSE_POST, ['mount']),
  ...refuge,
  // The Waste's sites (PR 2 builds on them).
  at('waste.crossing', CROSSING, ['road', 'junction']),
  at('waste.spring', R24_SPRING, ['poi']),
  at('waste.walker-camp', WALKER_CAMP, ['poi']),
  at('waste.cinder-chapel', CINDER_CHAPEL, ['poi']),
  // L0's reserved id: the Singing Slag shrine (SHRINE_ANCHORS['singing-slag']).
  at('waste.glasslands.singing-slag', GLASSLANDS, ['shrine']),
  at('waste.husk-cathedral.entry', HUSK_CATHEDRAL, ['poi']),
  // L0's reserved id: the Act 4 ending camp (ACT_ENDINGS act 4 campAnchorId).
  at('waste.rimfoot.fire', RIMFOOT, ['camp']),
  // The rope-lines' points and shelters (ROPE_LINES and SHELTERS name them).
  ...ROPE_ANCHORS,
  ...fogFaces,
];

const triggers: TriggerSpec[] = (Object.keys(WASTE_SITE_TRIGGERS) as (keyof typeof WASTE_SITE_TRIGGERS)[]).map((id) => ({
  id,
  x: WASTE_SITE_TRIGGERS[id].at[0],
  z: WASTE_SITE_TRIGGERS[id].at[1],
  who: 'player',
  shape: 'sphere',
  radius: WASTE_SITE_TRIGGERS[id].radius,
}));

export const ACT4_WORLD_LAYOUT: LayoutData = { anchors, triggers, structures: [...ACT4_STRUCTURES], patrols: [], npcs: [], fields: [] };
