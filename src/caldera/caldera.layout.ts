// The Caldera's places (Act 5 thread N1 PR 1, plans/act5-N1.md sections 1, 4 and 5): the anchors, triggers and greybox
// structures of the Rim Gate and its court, the Rim Camp, the Lava Stair's ends, the Wyrm Terraces, the Inner Gate, the
// doors N2's interiors hang on, the Anvil's shrine and the siege points N4 asked for. Positions come from
// calderaSites.ts. Prefixes `caldera.` and `trg.caldera.`; `waystone.*` and `npc-post.*` keep their contract names.
// Plain data; CALDERA_ANCHORS.md is generated from it by tools/gen-region-docs.ts (drift-tested).
import type { AnchorSpec, LayoutData, StructureSpec, TriggerSpec } from '../region/layoutTypes';
import { INNER_GATE_ANCHOR } from '../region/act5Fog';
import { ANVIL_SHRINE_ANCHOR } from '../map/ForgeMarks';
import {
  ANVIL_ISLAND,
  CALDERA_DOOR_APPROACH,
  CALDERA_DOORS,
  INNER_GATE,
  LAVA_STAIR,
  RIM_CAMP,
  RIM_GATE_SITE,
  SIEGE_POINTS,
  STOKERS,
  WYRM_TERRACES,
  headingTo,
  type XZ,
} from './calderaSites';

export const CALDERA_DOC = { title: "The Caldera's places (the Rim Gate, the Rim Camp, the Lava Stair, the Wyrm Terraces, the Inner Gate, the Anvil)", source: 'caldera/caldera.layout.ts' } as const;

/** The Rim Camp's vendors and trainers (N7's ids, plans/act5-N7.md section 5). */
export const rimShop = (vendor: string): string => `caldera.camp.shop.${vendor}`;
export const rimTrainer = (npc: string): string => `caldera.camp.trainer.${npc}`;
export const rimTalkPost = (npc: string): string => `npc-post.${npc}.rim`;
export const RIM_FORGE_DUNSTAN = 'caldera.camp.forge.dunstan';
export const RIM_ANVIL_ALRIC = 'caldera.camp.anvil.alric';
export const RIM_CAMP_REST = 'caldera.camp.rest';
export const RIM_CAMP_RITE = 'caldera.camp.rite';
export const RIM_CAMP_WAR_TABLE = 'caldera.camp.war-table';
export const RIM_CAMP_SCENE_CAM = 'caldera.camp.scene';
export const rimCompanion = (c: string): string => `caldera.camp.companion.${c}`;
export const RIM_GATE_WINCH = 'caldera.rim-gate.winch';
export const RIM_GATE_ANCHOR = 'caldera.rim-gate';
export const CALDERA_DOOR_ANCHORS = {
  coolingHall: 'caldera.door.cooling-hall',
  foundry: 'caldera.door.foundry',
  tunnel: 'caldera.door.tunnel',
} as const satisfies Record<keyof typeof CALDERA_DOORS, string>;
export const TUNNEL_MOUTH_ANCHOR = 'caldera.tunnel.mouth';
export const CALDERA_WAYSTONES = { 'rim-camp': RIM_CAMP.waystone, 'wyrm-terraces': WYRM_TERRACES.waystone, 'inner-gate': INNER_GATE.waystone } as const satisfies Record<string, XZ>;
export type CalderaWaystoneId = keyof typeof CALDERA_WAYSTONES;

export const CALDERA_TRIGGERS = {
  rimGate: 'trg.caldera.rim-gate',
  camp: 'trg.caldera.camp',
  lavaStairHead: 'trg.caldera.lava-stair.head',
  innerGate: 'trg.caldera.inner-gate',
  terraces: 'trg.caldera.terraces',
  coolingHall: 'trg.caldera.cooling-hall',
  tunnel: 'trg.caldera.tunnel',
} as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const at = (id: string, p: XZ, tags: string[] = [], yawDeg = 0, extra: Partial<AnchorSpec> = {}): AnchorSpec => ({ id, x: r2(p[0]), z: r2(p[1]), yawDeg: r2(yawDeg), tags, ...extra });
const toward = (id: string, p: XZ, q: XZ, tags: string[] = []): AnchorSpec => at(id, p, tags, headingTo(p, q));
const sphere = (id: string, p: XZ, radius: number): TriggerSpec => ({ id, x: r2(p[0]), z: r2(p[1]), who: 'player', shape: 'sphere', radius });
const box = (id: string, kind: string, p: XZ, footprint: [number, number], mode: StructureSpec['mode'], height?: number, yawDeg = 0): StructureSpec => ({
  id,
  kind,
  x: r2(p[0]),
  z: r2(p[1]),
  yawDeg,
  footprint,
  mode,
  ...(height === undefined ? {} : { height }),
});
/** The waystones' stones stand this far north of their anchors (the Waste's spacing), so the anchor stays reachable. */
export const CALDERA_WAYSTONE_STONE_OFFSET = 2.6;
const stone = (id: string, p: XZ): StructureSpec => box(id, 'waystone', [p[0], p[1] + CALDERA_WAYSTONE_STONE_OFFSET], [1.6, 1.6], 'solid', 2.4);

const F = RIM_CAMP.fire;
/** The gatehouse towers' height (the archers stand on top). */
export const RIM_GATE_TOWER_HEIGHT = 12;

// ---- anchors

const rimGate: AnchorSpec[] = [
  at(RIM_GATE_ANCHOR, RIM_GATE_SITE.gate, ['gate'], 0),
  toward(RIM_GATE_WINCH, RIM_GATE_SITE.winch, RIM_GATE_SITE.towers[0], ['quest']),
];

const camp: AnchorSpec[] = [
  at(RIM_CAMP_REST, RIM_CAMP.rest, ['rest', 'camp']),
  ...Object.entries(RIM_CAMP.shops).map(([v, p]) => toward(rimShop(v), p, F, ['shop'])),
  ...Object.entries(RIM_CAMP.trainers).map(([n, p]) => toward(rimTrainer(n), p, F, ['trainer'])),
  toward(RIM_FORGE_DUNSTAN, RIM_CAMP.forgeDunstan, F, ['shop']),
  toward(RIM_ANVIL_ALRIC, RIM_CAMP.anvilAlric, F, ['shop']),
  ...Object.entries(RIM_CAMP.talk).map(([n, p]) => toward(rimTalkPost(n), p, F, ['npc-post'])),
  ...Object.entries(RIM_CAMP.companions).map(([c, p]) => toward(rimCompanion(c), p, F, ['npc-post'])),
  toward(RIM_CAMP_RITE, RIM_CAMP.rite, F, ['quest']),
  toward(RIM_CAMP_WAR_TABLE, RIM_CAMP.warTable, F, ['quest']),
  at(RIM_CAMP_SCENE_CAM, RIM_CAMP.sceneCam, ['camera'], 0),
  toward('caldera.stokers.post', STOKERS.post, F, ['npc-post']),
  toward('caldera.stokers.gong', STOKERS.gong, STOKERS.post, ['quest']),
];

const waystones: AnchorSpec[] = Object.entries(CALDERA_WAYSTONES).map(([id, p]) => at(`waystone.${id}`, p, ['waystone']));

const doors: AnchorSpec[] = [
  ...(Object.keys(CALDERA_DOORS) as (keyof typeof CALDERA_DOORS)[]).map((k) => toward(CALDERA_DOOR_ANCHORS[k], CALDERA_DOORS[k], CALDERA_DOOR_APPROACH[k], ['door'])),
  toward(TUNNEL_MOUTH_ANCHOR, CALDERA_DOORS.tunnel, CALDERA_DOOR_APPROACH.tunnel, ['quest']),
];

const bowl: AnchorSpec[] = [
  toward('caldera.lava-stair.head', LAVA_STAIR.head, LAVA_STAIR.mid, ['path']),
  toward('caldera.lava-stair.foot', LAVA_STAIR.foot, LAVA_STAIR.mid, ['path']),
  ...WYRM_TERRACES.ledges.map((t, i) => at(`caldera.terraces.ledge.${i + 1}`, t.at, ['poi'], 270)),
  at(INNER_GATE_ANCHOR, INNER_GATE.face, ['fog-wall'], 0),
  toward('caldera.inner-gate.head', INNER_GATE.head, INNER_GATE.face, ['path']),
  at(ANVIL_SHRINE_ANCHOR, ANVIL_ISLAND.centre, ['shrine'], 0),
  toward('caldera.anvil.causeway', ANVIL_ISLAND.causeway[0], ANVIL_ISLAND.centre, ['path']),
];

// N4's siege points (plans/act5-N4.md section 13). The tower tops stand on the towers.
const siege: AnchorSpec[] = [
  ...SIEGE_POINTS.gate.map((p, i) => at(`caldera.siege.gate.${i + 1}`, p, ['siege'], 0)),
  ...SIEGE_POINTS.lanes.map((p, i) => toward(`caldera.siege.lane.${i + 1}`, p, RIM_GATE_SITE.landing, ['siege'])),
  toward('caldera.siege.ram', SIEGE_POINTS.ram, RIM_GATE_SITE.landing, ['siege']),
  at('caldera.siege.wall.left', SIEGE_POINTS.wallLeft, ['siege'], 180, { dy: RIM_GATE_TOWER_HEIGHT, onStructure: 'caldera.rim-gate.tower.w' }),
  at('caldera.siege.wall.right', SIEGE_POINTS.wallRight, ['siege'], 180, { dy: RIM_GATE_TOWER_HEIGHT, onStructure: 'caldera.rim-gate.tower.e' }),
  at('caldera.siege.court', SIEGE_POINTS.court, ['siege'], 180),
  at('caldera.siege.lee', SIEGE_POINTS.lee, ['siege'], 180),
  at('caldera.siege.banner', SIEGE_POINTS.banner, ['siege'], 180),
  at('caldera.siege.orders', SIEGE_POINTS.orders, ['siege'], 180),
  at('caldera.siege.crates', SIEGE_POINTS.crates, ['siege'], 180),
  at('caldera.siege.aid', SIEGE_POINTS.aid, ['siege'], 180),
  at('caldera.siege.start', SIEGE_POINTS.start, ['siege'], 180),
  // On the ground (anchors never float): N4 flies each at SIEGE_POINTS.skyHeights[i] metres above its anchor.
  ...SIEGE_POINTS.sky.map((p, i) => at(`caldera.siege.sky.${i + 1}`, p, ['siege', 'air'], 0)),
];

// ---- triggers (prop-free: calderaLayout.test.ts keeps every structure 2 m clear)

const triggers: TriggerSpec[] = [
  sphere(CALDERA_TRIGGERS.rimGate, RIM_GATE_SITE.landing, 8),
  // The camp's arrival: the cut's inner mouth, where the court opens onto the shelf.
  sphere(CALDERA_TRIGGERS.camp, [F[0], 6700], 8),
  sphere(CALDERA_TRIGGERS.lavaStairHead, LAVA_STAIR.head, 8),
  sphere(CALDERA_TRIGGERS.innerGate, INNER_GATE.head, 12),
  sphere(CALDERA_TRIGGERS.terraces, WYRM_TERRACES.shelves[1], 8),
  sphere(CALDERA_TRIGGERS.coolingHall, LAVA_STAIR.foot, 8),
  sphere(CALDERA_TRIGGERS.tunnel, CALDERA_DOOR_APPROACH.tunnel, 6),
];

// ---- greybox structures (the env pass dresses them; new kinds go on section V of the prompt list in PR 2)

const [TW, TE] = RIM_GATE_SITE.towers;
const structures: StructureSpec[] = [
  // The Rim Gate: two towers in the cut, the leaf between them is drawn by rimGate.ts (the fog face holds).
  box('caldera.rim-gate.tower.w', 'tower', TW, [5, 5], 'solid', RIM_GATE_TOWER_HEIGHT),
  box('caldera.rim-gate.tower.e', 'tower', TE, [5, 5], 'solid', RIM_GATE_TOWER_HEIGHT),
  box('caldera.rim-gate.winch.drum', 'well', [RIM_GATE_SITE.winch[0] - 1.6, RIM_GATE_SITE.winch[1]], [1.2, 1.2], 'open', 1),
  // The Rim Camp: the fire, tents round the shelf's edges, the war table, Dunstan's forge and Alric's anvil.
  box('caldera.camp.fire-ring', 'well', [F[0], F[1] + 2], [2.4, 2.4], 'open', 0.5),
  ...RIM_CAMP.tents.map((p, i) => box(`caldera.camp.tent.${i + 1}`, 'house', p, [6, 5], 'solid', 3)),
  box('caldera.camp.war-table.top', 'stall', [RIM_CAMP.warTable[0], RIM_CAMP.warTable[1] + 2], [3, 1.6], 'open', 1),
  box('caldera.camp.forge.dunstan.hearth', 'block', [RIM_CAMP.forgeDunstan[0] - 2, RIM_CAMP.forgeDunstan[1]], [1.6, 1.6], 'solid', 1.2),
  box('caldera.camp.anvil.alric.block', 'block', [RIM_CAMP.anvilAlric[0], RIM_CAMP.anvilAlric[1] - 1.8], [1.2, 0.6], 'solid', 0.8),
  ...Object.entries(RIM_CAMP.shops).map(([v, p]) => box(`caldera.camp.shop.${v}.stall`, 'stall', [p[0] - 2.4, p[1]], [1.4, 2.6], 'open', 1.1)),
  // The stokers' post (the gong's frame is PR 2's).
  box('caldera.stokers.hut', 'house', [STOKERS.post[0] + 6, STOKERS.post[1] - 6], [5, 4], 'solid', 2.6),
  // The Inner Gate's pillars (its portcullis is drawn by innerGate.ts; the face and the floor hole hold).
  ...INNER_GATE.pillars.map((p, i) => box(`caldera.inner-gate.pillar.${i + 1}`, 'tower', p, [2, 2], 'solid', 9)),
  ...Object.keys(CALDERA_WAYSTONES).map((id) => stone(`caldera.waystone.${id}.stone`, CALDERA_WAYSTONES[id as CalderaWaystoneId])),
];

export const CALDERA_LAYOUT: LayoutData = {
  anchors: [...rimGate, ...camp, ...waystones, ...doors, ...bowl, ...siege],
  triggers,
  structures,
  patrols: [],
  npcs: [],
  fields: [],
};
