// The Harrowmark quests' pacing rows (plan Part 7.1, L13's `Act4PaceRow`): each quest's route on real anchors in the order the
// player reaches them, one travel mode per leg, the dialogue nodes of its shorter branch (pinned to the real trees by
// harrowmark.dialogue.test.ts) and its beats. Inside the walls every leg is on foot or at an escort's pace; R22's three trips
// go by waystone (a `door` leg, no travel counted). `paceAt` resolves any anchor a row names.
import type { Act4Leg, Act4PaceRow } from '../../../../integration/act4Timing';
import { HARROWMARK_LAYOUT } from '../../../../harrowmark/harrowmark.layout';
import { ACT4_LAYOUT_HM } from '../../../../harrowmark/act4/act4.layout';
import { CINDERREACH_LAYOUT } from '../../../../cinderreach/cinderreach.layout';
import { GREYFEN_LAYOUT } from '../../../../greyfen/greyfen.layout';
import { DRAGONSPINE_LAYOUT } from '../../../../dragonspine/dragonspine.layout';
import { ACT4_HARROWMARK_INTERIORS } from '../../../../interiors/harrowmark/act4';
import { ACT4_WORLD_LAYOUT } from '../../../../region/act4/act4World.layout';
import { TILTED_ANVIL_DEF } from '../../../../interiors/harrowmark/tiltedAnvil';
import { CHAMBER_DOOR, CRUCIBLE_DOOR, DEEP_RUN_ID } from '../../../../harrowmark/act4/sites';
import { Q, routeIds } from './anchors';
import { harrowmarkA4InteriorExtras, harrowmarkA4QuestLayout } from './layout';
import { R22_SITES } from './r22.quest';

const P = 'harrowmark.a4';
const post = (id: string): string => `${P}.post.${id}`;
const INN_DOOR = 'harrowmark.tilted-anvil.door';
const INN = 'npc-post.tobb.tilted-anvil';
const CRU = 'harrowmark.a4.crucible';
const CH = 'harrowmark.a4.chamber';
const ST = 'harrowmark.a4.stairs';
const DR = 'harrowmark.a4.deeprun';
/** The deep run's escort route (L2's nodes every second cell, in order). */
const DEEP_RUN_ROUTE: string[] = ACT4_HARROWMARK_INTERIORS.find((d) => d.id === DEEP_RUN_ID)!.anchors
  .filter((a) => /^harrowmark\.a4\.deeprun\.route\.\d+$/.test(a.id)).map((a) => a.id)
  .sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));

type Step = readonly [Act4Leg, string];
/** A row from a start anchor and its steps (each step: how the leg is travelled, and where it ends). */
function build(quest: string, design: number, start: string, steps: readonly Step[], nodes: number, beats: Act4PaceRow['beats']): Act4PaceRow {
  return { quest, design, route: [start, ...steps.map((s) => s[1])], legs: steps.map((s) => s[0]), nodes, beats };
}
const foot = (...ids: string[]): Step[] => ids.map((id) => ['foot', id] as const);
const follow = (ids: string[]): Step[] => ids.map((id) => ['follow', id] as const);
const route = (name: string, n: number, from = 2): string[] => routeIds(name, n).slice(from - 1);

/** Dialogue nodes of each quest's shorter branch: the talk rows plus the notes its search objectives read (2 lines each). */
export const HARROWMARK_A4_NODES = { m35: 35, m36: 46, r19: 31, r20: 24, r21: 21, r22: 31, r23: 45, d07: 25, m37: 43, m38: 66, m39: 32, m40: 28, m41: 43 } as const;

export const HARROWMARK_A4_PACE: readonly Act4PaceRow[] = [
  // M35: Wystan, Merrin and the Oswin walk, Aldric and the Halvard walk, the steward out at the River Gate, the chain, the lane
  // ambush and its three searches, the Grisel walk in, Wystan
  build('m35', 40, post('wystan'), [
    ...foot(post('merrin'), ...route('m35.oswin', 1, 1)), ...follow(route('m35.oswin', 9)),
    ...foot(post('aldric-cole'), routeIds('m35.halvard', 1)[0]!), ...follow(route('m35.halvard', 5)),
    ...foot(post('grisel-steward'), `${Q}.m35.chain`, `${Q}.m35.ledger`, `${Q}.m35.lane`, `${Q}.m35.mask`, `${Q}.m35.orders`, routeIds('m35.grisel', 1)[0]!),
    ...follow(route('m35.grisel', 11)), ...foot(post('wystan')),
  ], HARROWMARK_A4_NODES.m35, { killUnit: 6, search: 3, interact: 1, set: 1 }),
  // M36: Merrin, the Bastion ledger and Aldric, the Archive page and Wilmot, the roofs out and back, the daggerman, the drop,
  // the letter-case and Orrin's steward at the River Gate, the chalk board, Merrin
  build('m36', 55, post('merrin'), [
    ...foot(`${Q}.m36.ledger`, post('aldric-cole'), `${Q}.m36.page`, post('wilmot-penn'), `${Q}.m36.drop`, `${Q}.m36.roof.start`,
      `${Q}.m36.roof.mid`, `${Q}.m36.roof.end`, `${Q}.m36.drop`, `${Q}.m36.letters`, post('grisel-steward'), `${Q}.m36.chalk`, post('merrin')),
  ], HARROWMARK_A4_NODES.m36, { killUnit: 4, search: 4, interact: 1, stealthSection: 1 }),
  // R19: Wystan at the Bastion, the roll, Morwen, Hesketh at the West Gate, Bran's bout by the stables, Tolly and his letter,
  // the deserters, the banners and the horn
  build('r19', 40, post('wystan.bastion'), [
    ...foot(`${Q}.r19.roll`, post('captain-morwen'), post('captain-hesketh'), post('captain-bran'), `${Q}.r19.bout`, post('captain-tolly'),
      `${Q}.r19.letter`, spawn('r19.deserters.2'), `${Q}.r19.banner.1`, `${Q}.r19.banner.2`, `${Q}.r19.horn`, post('wystan.bastion')),
  ], HARROWMARK_A4_NODES.r19, { killUnit: 6, search: 2, interact: 3, duelRound: 1 }),
  // R20 (the force way, the shorter in time): the manifest, the load, the cart out through three posts, each broken, Merrin
  build('r20', 45, post('merrin'), [
    ...foot(`${Q}.r20.manifest`, `${Q}.r20.load`), ...follow(route('r20.convoy', 5)), ...foot(`${Q}.r20.tally.1`),
    ...follow(route('r20.convoy', 8, 6)), ...foot(`${Q}.r20.tally.2`), ...follow(route('r20.convoy', 10, 9)), ...foot(`${Q}.r20.tally.3`),
    ...follow(route('r20.convoy', 12, 11)), ...foot(post('merrin')),
  ], HARROWMARK_A4_NODES.r20, { killUnit: 9, search: 4, interact: 1 }),
  // R21 (the leaders): Wenna, the keeper, the cellar, the back lanes, the chalk, the patrol, the miners walked to the grate
  build('r21', 40, post('wenna'), [
    ...foot(`${Q}.post.cellar-keeper`, `${Q}.r21.door`, `${Q}.r21.cellar`, `${Q}.r21.lanes.start`, `${Q}.r21.lanes.exit`, `${Q}.r21.chalk`,
      spawn('r21.cellars'), routeIds('r21.miners', 1)[0]!),
    ...follow(route('r21.miners', 3)), ...foot(`${Q}.r21.grate`, post('wenna')),
  ], HARROWMARK_A4_NODES.r21, { stealthSection: 1, killUnit: 4, search: 2, interact: 2 }),
  // R22: Dunstan and his drawing, three waystone trips (the local, the guards, the find), back to the forge
  build('r22', 45, 'npc-post.dunstan', [
    ...foot(`${Q}.r22.drawing`),
    ...R22_SITES.flatMap((s): Step[] => [['door', s.near], ...foot(`${s.region}.q.r22.local`, `${s.region}.q.r22.site`, `${s.region}.q.r22.find`, s.near)]),
    ['door', 'npc-post.dunstan'], ...foot(`${Q}.r22.bellows`, `${Q}.r22.anvil`, `${Q}.r22.quench`, `${Q}.r22.hilt`, 'npc-post.dunstan'),
  ], HARROWMARK_A4_NODES.r22, { killUnit: 8, search: 1, interact: 6, rhythm: 2 }),
  // R23 (the public way): Rook, the five witnesses and their orders, Rook, the reading in the watch yard, Rook
  build('r23', 35, 'npc-post.rook', [
    ...foot(post('witness-gatehouse'), `${Q}.r23.order.2`, post('witness-stables'), `${Q}.r23.order.3`, post('witness-barracks'), `${Q}.r23.order.1`,
      post('witness-anvil'), `${Q}.r23.order.5`, post('witness-chapel'), `${Q}.r23.order.4`, 'npc-post.rook', `${Q}.r23.reading`, 'npc-post.rook'),
  ], HARROWMARK_A4_NODES.r23, { search: 5, interact: 1 }),
  // D07: Rook, the Crucible door, the cellars (two halls, the cradles, the captive, the ledgers, the vats, the forge), Rook
  build('d07', 60, 'npc-post.rook', [
    ...foot(CRUCIBLE_DOOR.anchor), ['door', `${CRU}.entry`],
    ...foot(`${CRU}.spawn.vat-1.2`, `${CRU}.carter-tally`, `${CRU}.cradle-stamp`, `${CRU}.vatvalve.2`, `${CRU}.vatvalve.1`, `${CRU}.captive`,
      `${CRU}.ledgers`, `${CRU}.furnace-log`, `${CRU}.vatvalve.3`, `${CRU}.arena.entry`, `${CRU}.entry`),
    ['door', CRUCIBLE_DOOR.anchor], ...foot('npc-post.rook'),
  ], HARROWMARK_A4_NODES.d07, { killUnit: 12, interact: 3, search: 4, puzzle: 1, boss: 1 }),
  // M37: Tobb at the inn, the feast, three bond scenes, Gaut, the war-song, the toast
  build('m37', 35, INN_DOOR, [
    ['door', INN], ...foot(`${Q}.m37.feast`, `${Q}.m37.seat.tobb`, `${Q}.m37.seat.hrolf`, `${Q}.m37.seat.aelfreda`, `${Q}.post.gaut.inn`, `${Q}.m37.table`, `${Q}.m37.feast`),
  ], HARROWMARK_A4_NODES.m37, { set: 2, rhythm: 1, interact: 4 }),
  // M38: Edric at the Keep court, the chamber door, the three allies at their seats, the evidence and the podium, the betrayal,
  // the six Footmen, down behind the dais to the stairs
  build('m38', 60, post('edric'), [
    ...foot(CHAMBER_DOOR.anchor), ['door', `${CH}.entry`],
    ...foot(`${CH}.seat.wystan`, `${CH}.seat.merrin`, `${CH}.seat.wenna`, `${CH}.evidence`, `${CH}.podium`, `${CH}.footman.w2`, `${CH}.footman.e2`, `${CH}.from-stairs`),
    ['door', `${ST}.entry`],
  ], HARROWMARK_A4_NODES.m38, { set: 2, killUnit: 6, interact: 1, search: 2 }),
  // M39: Gaut on the top landing, the stair-head four, the barricade, four waves of two, the champion and the fall, the token,
  // down to the King at the stair foot
  build('m39', 50, `${ST}.entry`, [
    ...foot(`${ST}.gaut`, `${ST}.wave.top.2`, `${ST}.barricade`, `${ST}.wave.one.2`, `${ST}.barricade`, `${ST}.sword`, `${ST}.edric`),
  ], HARROWMARK_A4_NODES.m39, { killUnit: 8, waveEnemy: 8, set: 2, interact: 1, search: 1 }),
  // M40: Rook at the stair foot, the deep run at the column's pace (two dens, the sluice, the patrol hall), up the ladder
  build('m40', 50, `${ST}.rook`, [
    ['door', `${DR}.entry`], ...follow(DEEP_RUN_ROUTE), ['door', 'harrowmark.a4.deeprun.exit'],
  ], HARROWMARK_A4_NODES.m40, { killUnit: 10, interact: 1, set: 1 }),
  // M41: the camp scene, Edric, Rook, Wystan, the map and the fire, the two searches, Edric again
  build('m41', 35, 'harrowmark.a4.m41.camp', [
    ...foot(`${Q}.m41.edric`, `${Q}.m41.rook`, `${Q}.m41.wystan`, `${Q}.m41.map`, `${Q}.m41.fire`, `${Q}.m41.grandfather`, `${Q}.m41.tunnel`, `${Q}.m41.edric`),
  ], HARROWMARK_A4_NODES.m41, { set: 1, interact: 2, search: 2 }),
];

function spawn(group: string): string { return `${P}.spawn.${group}.1`; }

let byId: Map<string, { x: number; z: number }> | undefined;
/** Any anchor a Harrowmark pacing row names: the city, its Act 4 sites, my quest anchors, R22's waystone sites, the two interiors. */
export function paceAt(anchor: string): { x: number; z: number } {
  if (!byId) {
    const world = [...HARROWMARK_LAYOUT.anchors, ...ACT4_LAYOUT_HM.anchors, ...ACT4_WORLD_LAYOUT.anchors, ...CINDERREACH_LAYOUT.anchors, ...GREYFEN_LAYOUT.anchors, ...DRAGONSPINE_LAYOUT.anchors];
    const inn = harrowmarkA4InteriorExtras()[0]!.anchors;
    byId = new Map([...world, ...harrowmarkA4QuestLayout(world).anchors, ...ACT4_HARROWMARK_INTERIORS.flatMap((d) => d.anchors), ...TILTED_ANVIL_DEF.anchors, ...inn].map((a) => [a.id, { x: a.x, z: a.z }]));
  }
  const p = byId.get(anchor);
  if (!p) throw new Error(`harrowmark a4 pacing: no anchor ${anchor}`);
  return p;
}
