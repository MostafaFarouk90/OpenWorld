// The Waste quests' pacing rows (plan 5, L13's `Act4PaceRow`): each quest's route on real anchors in the order the player
// reaches them, one travel mode per leg, the dialogue nodes of its shorter branch (pinned to the real trees by
// waste.dialogue.test.ts) and its beats. In the Waste a leg in a storm (M42's crossing, the Storm Walk, M46's road between the
// cairns, coordinator 18:01) is `storm`; R24's cart is `cart`; a door into an interior is `door`. The Ash Road and the walk up
// to the first cairn are not counted (review notes): `door` legs. `paceAt` resolves any anchor a row names.
import type { Act4Leg, Act4PaceRow } from '../../../../integration/act4Timing';
import { WASTE_LAYOUT } from '../../../../waste/waste.layout';
import { ACT4_WORLD_LAYOUT } from '../../../../region/act4/act4World.layout';
import { WASTE_INTERIORS } from '../../../../waste/interiors';
import { W } from './ids';
import { L1 } from './siteIds';
import { R24_ROUTE_IDS } from './anchors';
import { wasteA4InteriorExtras, wasteA4QuestLayout } from './layout';
import { M43_KNOTS } from './m43.quest';

type Step = readonly [Act4Leg, string];
function build(quest: string, design: number, start: string, steps: readonly Step[], nodes: number, beats: Act4PaceRow['beats']): Act4PaceRow {
  return { quest, design, route: [start, ...steps.map((s) => s[1])], legs: steps.map((s) => s[0]), nodes, beats };
}
const leg = (mode: Act4Leg) => (...ids: string[]): Step[] => ids.map((id) => [mode, id] as const);
const foot = leg('foot');
const storm = leg('storm');
const cart = leg('cart');
const door = leg('door');

const WU = L1.wulfhildCamp;
const q = (s: string): string => `${W}.${s}`;
const n3 = [1, 2, 3] as const;

/**
 * Dialogue nodes of each quest's shorter branch: its talk rows (talks.ts), R24's choice, the notes its search steps read
 * (2 lines each) and its scene lines (M45's voice 6, M46's rim 3; the dream has none). D08's report counts its shorter
 * outcome (the released one).
 */
export const WASTE_A4_NODES = { m42: 23, m43: 35, m44: 29, r25: 18, r24: 20, m45: 29, d08: 25, m46: 32 } as const;

export const WASTE_A4_PACE: readonly Act4PaceRow[] = [
  // M42: Wulfhild and Hild at Ashgate, the gate arch, then the storm along the rope: each shelter's flap, the striders 40 m off
  // the lane, the pack, the husks, the knot-sign, the camp edge; Wulfhild at the camp
  build('m42', 50, q('post.wulfhild.ashgate'), [
    ...foot(L1.hildPost, q('m42.gate')),
    ...storm(q('m42.flap.1'), q('m42.striders.2'), q('m42.flap.2'), q('m42.pack'), q('m42.flap.3'), q('m42.wraiths.2'), q('m42.flap.4'), q('m42.knot'), q('m42.camp')),
    ...foot(WU),
  ], WASTE_A4_NODES.m42, { shelterWait: 4, killUnit: 6, interact: 4, search: 2, set: 1 }),
  // M43: Osgar and the Storm Walk (five knots in a storm, two lees, the count), Aelfgifu and the three pyres, the torch, Hrodna
  // and the ring (a loss and a win), the count-stones and the spear-rack, Wulfhild
  build('m43', 55, WU, [
    ...foot(L1.walkerPost(1), L1.stormWalkStart),
    ...storm(...Array.from({ length: M43_KNOTS }, (_, i) => L1.stormWalkKnot(i + 1)), L1.stormWalkEnd),
    ...foot(q('m43.count'), L1.walkerPost(2), q('m43.torch'), ...n3.map((n) => L1.pyre(n)), L1.hrodnaCamp, L1.trialRing, q('m43.count-stones'), q('m43.spear-rack'), WU),
  ], WASTE_A4_NODES.m43, { duelRound: 2, killUnit: 3, shelterWait: 2, rhythm: 1, search: 2, interact: 1, set: 1 }),
  // M44: Ebba at the chapel door, Sister Aedre, two things read in each of the three houses (the nest in the second), the
  // music box, the graves behind the chapel, Ebba; the dream
  build('m44', 40, L1.ebbaChapel, [
    ...foot(q('post.chapel-keeper'), q('m44.house.1'), q('m44.house.1.b'), q('m44.nest.3'), q('m44.house.2'), q('m44.house.2.b'),
      q('m44.house.3'), q('m44.house.3.b'), L1.musicBox, q('m44.graves'), L1.ebbaChapel),
  ], WASTE_A4_NODES.m44, { search: 7, killUnit: 6, interact: 1, set: 1 }),
  // R25: Ebba's candles, each burned village's name and hearth (the husk knot at the third), the register inside the chapel
  build('r25', 35, L1.ebbaChapel, [
    ...foot(q('r25.name.1'), L1.r25Hearth(1), q('r25.name.2'), L1.r25Hearth(2), q('r25.knot.2'), q('r25.name.3'), L1.r25Hearth(3), L1.chapelDoor),
    ...door(q('r25.register')),
    ...foot(q('r25.letter')),
    ...door(L1.chapelDoor),
    ...foot(L1.ebbaChapel),
  ], WASTE_A4_NODES.r25, { search: 5, interact: 3, killUnit: 5 }),
  // R24: Wulfhild, the walk out to the spring, Brand, the count, the casks; the cart home along the rope (two storms, two
  // attacks, the brakes); the choice and the casks unloaded at the gate
  build('r24', 40, WU, [
    ...foot(q('post.carter.spring'), q('r24.spring'), q('r24.load')),
    ...cart(...R24_ROUTE_IDS),
    ...foot(L1.campGate, WU, q('r24.unload')),
  ], WASTE_A4_NODES.r24, { killUnit: 6, interact: 4, shelterWait: 3, set: 1 }),
  // M45: Wulfhild, the Glasslands, the guard, the three plaques and three searches, the strike stone (the chime), the voice,
  // Wulfhild by the shrine
  build('m45', 50, WU, [
    ...foot(L1.strike, q('m45.guard.2'), ...n3.map((n) => q(`m45.plaque.${n}`)), ...n3.map((n) => q(`m45.search.${n}`)), L1.strike, q('post.wulfhild.glasslands')),
  ], WASTE_A4_NODES.m45, { killUnit: 3, search: 6, puzzle: 2, rhythm: 2, set: 1 }),
  // D08: Wulfhild, Leofric at the door, the narthex's two knights and their husks, the bones, the gong-rope, Eormen, the crypt's
  // tablets and niche, back out to Wulfhild
  build('d08', 60, WU, [
    ...foot(q('post.d08.dying'), L1.cathedralEntry),
    ...door(q('d08.knight-1.2')),
    ...foot(q('d08.knight-2.2'), q('d08.bones'), q('d08.rope'), q('d08.tablets'), q('d08.niche')),
    ...door(L1.cathedralEntry),
    ...foot(WU),
  ], WASTE_A4_NODES.d08, { killUnit: 7, search: 4, boss: 1, structure: 1, interact: 2 }),
  // M46: Hrolf at the camp, the road north (not counted) to the first cairn, then the storm road: each keeper, the wave, the
  // mark, the light; the outriders; the last keeper, its wave and lore; the Rimfoot fire
  build('m46', 50, WU, [
    ...door(q('post.m46.keeper.1')),
    ...foot(q('m46.wave.1.barricade'), q('m46.mark.1'), q('m46.light.1')),
    ...storm(q('post.m46.keeper.2')),
    ...foot(q('m46.wave.2.barricade'), q('m46.mark.2'), q('m46.light.2')),
    ...storm(q('m46.outriders.2'), q('post.m46.keeper.3')),
    ...foot(q('m46.wave.3.barricade'), q('m46.lore.1')),
    ...storm(q('m46.rim'), q('m46.lore.2'), L1.wulfhildRimfoot),
  ], WASTE_A4_NODES.m46, { waveEnemy: 12, killUnit: 4, interact: 2, set: 1, search: 4 }),
];

let byId: Map<string, { x: number; z: number }> | undefined;
/** Any anchor a Waste pacing row names: L1's layout, the Act 4 world, my quest anchors, the two interiors (local frames). */
export function paceAt(anchor: string): { x: number; z: number } {
  if (!byId) {
    const world = [...WASTE_LAYOUT.anchors, ...ACT4_WORLD_LAYOUT.anchors];
    byId = new Map([
      ...world, ...wasteA4QuestLayout(world).anchors, ...WASTE_INTERIORS.flatMap((d) => d.anchors),
      ...wasteA4InteriorExtras().flatMap((d) => d.anchors),
    ].map((a) => [a.id, { x: a.x, z: a.z }]));
  }
  const p = byId.get(anchor);
  if (!p) throw new Error(`waste a4 pacing: no anchor ${anchor}`);
  return p;
}
