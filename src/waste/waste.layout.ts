// The Waste's places (Act 4 L1 PR 2, plans/act4-L1.md section 16): anchors, triggers and greybox structures of the Walker
// Camp, the Cinder Chapel and its village, the Glasslands and the Singing Slag, the Husk Cathedral's shell, the Cinder Road
// North's cairns, the Rimfoot camp and the eleven points of interest. Positions come from wasteSites.ts. Prefixes `waste.`
// and `trg.waste.`; `waystone.*` and `npc-post.*` keep their contract names. Plain data; WASTE_ANCHORS.md is generated
// from it by tools/gen-region-docs.ts (drift-tested).
import type { AnchorSpec, LayoutData, TriggerSpec } from '../region/layoutTypes';
import type { XZ } from '../terrain/shape/waste';
import { CINDER_CHAPEL_OUTSIDE } from './interiors/cinderChapel';
import { WASTE_STRUCTURES } from './wasteStructures';
import {
  CAIRN_CLEARING,
  CAIRNS,
  CAMP,
  CATHEDRAL,
  CHAPEL,
  CHAPEL_HEARTHS,
  CHAPEL_MUSIC_BOX,
  CHAPEL_NEST,
  GLASS_DRIFT,
  headingTo,
  poiAnchorId,
  poiTriggerId,
  R25_HEARTHS,
  RIMFOOT_CAMP,
  SLAG,
  WASTE_POIS,
  WULFHILD_SHOP_POINT,
} from './wasteSites';

export const WASTE_DOC = { title: "The Waste's places (the Walker Camp, the Cinder Chapel, the Glasslands, the cathedral, Rimfoot, POIs)", source: 'waste/waste.layout.ts' } as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const at = (id: string, p: XZ, tags: string[] = [], yawDeg = 0): AnchorSpec => ({ id, x: r2(p[0]), z: r2(p[1]), yawDeg: r2(yawDeg), tags });
const toward = (id: string, p: XZ, q: XZ, tags: string[] = []): AnchorSpec => at(id, p, tags, headingTo(p, q));
const sphere = (id: string, p: XZ, radius: number): TriggerSpec => ({ id, x: r2(p[0]), z: r2(p[1]), who: 'player', shape: 'sphere', radius });

const camp: AnchorSpec[] = [
  at('waste.walker-camp.rest', CAMP.rest, ['rest', 'camp']),
  ...CAMP.pyres.map((p, i) => toward(`waste.walker-camp.pyre.${i + 1}`, p, CAMP.rest, ['quest'])),
  ...CAMP.cisterns.map((p, i) => at(`waste.walker-camp.cistern.${i + 1}`, p, ['dressing'])),
  at('waste.walker-camp.trial-ring', CAMP.trialRing, ['quest']),
  toward('waste.walker-camp.storm-walk.start', CAMP.stormWalkStart, CAMP.stormWalkEnd, ['quest']),
  toward('waste.walker-camp.storm-walk.end', CAMP.stormWalkEnd, CAMP.stormWalkStart, ['quest']),
  ...CAMP.stormWalkKnots.map((p, i) => toward(`waste.walker-camp.storm-walk.knot.${i + 1}`, p, CAMP.stormWalkEnd, ['quest'])),
  toward('waste.walker-camp.gate', CAMP.gate, CAMP.rest, ['quest', 'gate']),
  toward('waste.walker-camp.shop.wulfhild', WULFHILD_SHOP_POINT, CAMP.rest, ['shop']),
  at('waystone.walker-camp', CAMP.waystone, ['waystone']),
  ...(Object.keys(CAMP.posts) as (keyof typeof CAMP.posts)[]).map((k) => toward(`npc-post.${k}.camp`, CAMP.posts[k], k === 'hrodna' ? CAMP.trialRing : CAMP.rest, ['npc-post'])),
];

const chapel: AnchorSpec[] = [
  at(CINDER_CHAPEL_OUTSIDE, CHAPEL.door, ['door'], 180),
  at('npc-post.ebba.chapel', CHAPEL.ebba, ['npc-post'], 180),
  at('waystone.cinder-chapel', CHAPEL.waystone, ['waystone']),
  ...CHAPEL.houses.map((p, i) => at(`waste.cinder-chapel.house.${i + 1}`, p, ['poi'])),
  at('waste.cinder-chapel.house.2.nest', CHAPEL_NEST, ['spawn']),
  at('waste.cinder-chapel.house.3.music-box', CHAPEL_MUSIC_BOX, ['quest']),
  ...CHAPEL_HEARTHS.map((p, i) => at(`waste.cinder-chapel.hearth.${i + 1}`, p, ['dressing'], 270)),
];

const slag: AnchorSpec[] = [
  toward('waste.glasslands.strike', SLAG.strike, SLAG.pillars[2], ['quest']),
  ...SLAG.pillarFaces.map((p, i) => toward(`waste.glasslands.pillar.${i + 1}`, p, SLAG.pillars[i], ['puzzle'])),
  ...SLAG.plaques.map((p, i) => toward(`waste.glasslands.plaque.${i + 1}`, p, SLAG.shrine, ['puzzle'])),
  at('waystone.glasslands', SLAG.waystone, ['waystone']),
];

const roadNorth: AnchorSpec[] = [
  ...CAIRNS.flatMap((c, i) => [
    toward(`waste.cinder-road.cairn.${i + 1}`, c.at, c.stones, ['quest']),
    toward(`waste.cinder-road.cairn.${i + 1}.lore`, c.lore, c.stones, ['quest']),
    at(`waste.cinder-road.cairn.${i + 1}.clearing`, c.lane, ['spawn']),
  ]),
  at('waste.cinder-road.glass-drift', GLASS_DRIFT.at, ['dressing'], GLASS_DRIFT.yawDeg),
];

const rimfoot: AnchorSpec[] = [
  toward('npc-post.wulfhild.rimfoot', RIMFOOT_CAMP.wulfhild, RIMFOOT_CAMP.fire, ['npc-post']),
  ...(Object.keys(RIMFOOT_CAMP.companions) as (keyof typeof RIMFOOT_CAMP.companions)[]).map((c) =>
    toward(`waste.rimfoot.companion.${c}`, RIMFOOT_CAMP.companions[c], RIMFOOT_CAMP.fire, ['npc-post']),
  ),
  // L13's camp scene camera: it looks north over the fire toward the Caldera's glow.
  at('waste.rimfoot.cam', RIMFOOT_CAMP.cam, ['camera'], 0),
];

const pois: AnchorSpec[] = WASTE_POIS.flatMap((p) => [
  at(poiAnchorId(p.id), p.at, ['poi'], p.facing),
  ...(p.template === 'burned-village' ? [toward(poiAnchorId(p.id, 'hearth'), R25_HEARTHS[Number(p.id.slice(-1)) - 1], p.at, ['quest'])] : []),
  ...(p.template === 'walker-cairn' || p.template === 'buried-bell' ? [at(poiAnchorId(p.id, 'lore'), [p.at[0] + 3, p.at[1]] as XZ, ['lore'], 270)] : []),
]);

const anchors: AnchorSpec[] = [
  ...camp,
  ...chapel,
  ...slag,
  at('waste.husk-cathedral', CATHEDRAL.shell, ['poi'], 180),
  ...roadNorth,
  ...rimfoot,
  ...pois,
];

const triggers: TriggerSpec[] = [
  sphere('trg.waste.walker-camp.storm-walk.end', CAMP.stormWalkEnd, 8),
  sphere('trg.waste.walker-camp.trial-ring', CAMP.trialRing, 9),
  sphere('trg.waste.glasslands', SLAG.shrine, 40),
  ...CAIRNS.map((c, i) => sphere(`trg.waste.cinder-road.cairn.${i + 1}`, c.lane, CAIRN_CLEARING)),
  ...WASTE_POIS.map((p) => sphere(poiTriggerId(p.id), p.at, Math.max(15, p.radius + 4))),
];

export const WASTE_LAYOUT: LayoutData = { anchors, triggers, structures: [...WASTE_STRUCTURES], patrols: [], npcs: [], fields: [] };
