// The Foundry quests' pacing rows (plans/act5-N11.md section 6, the Act 4 estimator's shape): each quest's route on real
// anchors in the order the player reaches them (N1's camp, court and gates, my quest anchors, N2's interiors in their own
// frames), one travel mode per leg, the dialogue nodes of the shorter branch (pinned to the real trees by talks.ts) and its
// beats. A note, a page or a name read is one `search` beat, never dialogue (the shipped convention). Scene lines are not
// dialogue. A door into an interior is a `door` leg.
import { QUEST_WORLD_ANCHORS as RIM_QUEST_WORLD_ANCHORS } from '../rim/anchors';
import type { Act4Leg, Act4PaceRow } from '../../../../integration/act4Timing';
import { CALDERA_LAYOUT } from '../../../../caldera/caldera.layout';
import { ALL_INTERIORS } from '../../../../interiors/interiors.plugin';
import { foundryA5InteriorExtras, foundryA5QuestLayout } from './layout';
import { FA } from './anchors';
import { R30_ALLIES } from './r30.quest';
import { FOUNDRY_A5_TALK_NODES } from './talkNodes';

type Step = readonly [Act4Leg, string];
function build(quest: string, design: number, start: string, steps: readonly Step[], nodes: number, beats: Act4PaceRow['beats']): Act4PaceRow {
  return { quest, design, route: [start, ...steps.map((s) => s[1])], legs: steps.map((s) => s[0]), nodes, beats };
}
const leg = (mode: Act4Leg) => (...ids: string[]): Step[] => ids.map((id) => [mode, id] as const);
const foot = leg('foot');
const door = leg('door');
const T = (s: string): string => `caldera.int.tunnel.${s}`;
const FD = (s: string): string => `caldera.int.foundry.${s}`;
const H = (s: string): string => `caldera.int.hammer.${s}`;

/** Where the Rim allies stand for Tobb's lines (N1's camp posts; Ysmeryth on the terraces). */
const ALLY_POST: Record<(typeof R30_ALLIES)[number], string> = {
  wystan: 'npc-post.wystan.rim', merrin: 'npc-post.merrin.rim', wenna: 'npc-post.wenna.rim', wulfhild: 'npc-post.wulfhild.rim',
  rook: 'npc-post.rook.rim', edric: 'npc-post.edric.rim', hrolf: 'caldera.camp.companion.hrolf', aelfreda: 'caldera.camp.companion.aelfreda',
  ansgar: 'npc-post.ansgar.rim', ysmeryth: 'caldera.q.m51.talk.ysmeryth',
};
const TOBB = 'caldera.camp.companion.tobb';
const N = FOUNDRY_A5_TALK_NODES;

export const FOUNDRY_A5_PACE: readonly Act4PaceRow[] = [
  // R27 (shorter branch: F6 All, three waves; keep the tunnel, no structure beat): Wenna at the camp, the walk to the tunnel
  // door, the captain, the shoring, lamps and charges, the three signs, the captain's word, the hold, the far shoring, Wenna
  build('r27', 45, 'npc-post.wenna.rim', [
    ...foot('caldera.door.tunnel'),
    ...door(T('checkpoint')),
    ...foot(FA.tunnelCaptain, T('lamp.1'), T('prop.1'), T('lamp.2'), T('prop.2'), T('lamp.3'), T('lamp.4'), T('prop.3'), T('charge.1'), T('charge.2'), T('charge.3'),
      FA.tunnelNote('tally'), FA.tunnelNote('door'), FA.tunnelNote('roster'), FA.tunnelCaptain, T('line.1'), T('charge.2'), T('checkpoint')),
    ...door('caldera.door.tunnel'),
    ...foot('npc-post.wenna.rim'),
  ], N.r27, { waveEnemy: 9, interact: 10, search: 3, set: 1 }),
  // R28 (no pyre lit): Wulfhild at the camp, down to the court; at each pyre the mourner, the name, the token, the wood (the
  // risen at two and four); the rite; Wulfhild
  build('r28', 40, 'npc-post.wulfhild.rim', [
    ...foot(FA.r28Wulfhild,
      ...[1, 2, 3, 4].flatMap((n) => [FA.mourner(n), FA.name(n), FA.token(n), FA.pyre(n), ...(n % 2 === 0 ? [FA.risen(n)] : []), FA.pyre(n)]),
      FA.rite, FA.r28Wulfhild),
  ], N.r28, { carry: 4, search: 4, interact: 5, killUnit: 4, set: 1 }),
  // R30: Tobb, the ten allies about the camp and Ysmeryth on the terraces, the three pages, the anvil, the song
  build('r30', 40, TOBB, [
    ...foot(...(['wystan', 'merrin', 'wenna', 'wulfhild'] as const).map((a) => ALLY_POST[a]), FA.r30Page(1), ALLY_POST.hrolf, ALLY_POST.aelfreda, ALLY_POST.edric,
      ALLY_POST.ansgar, ALLY_POST.rook, FA.r30Page(2), ALLY_POST.ysmeryth, FA.r30Page(3), TOBB, FA.r30Anvil, TOBB),
  ], N.r30, { search: 3, rhythm: 1, interact: 1, set: 1 }),
  // M53 (Spy: the two pickets): Edric and Rook at the camp, down to the Inner Gate, Vey, the pickets, the three things left at
  // the gate, Edric
  build('m53', 45, 'npc-post.edric.rim', [
    ...foot('npc-post.rook.rim', FA.m53Edric, FA.m53Vey, FA.m53Foe(3), FA.m53Note('ledger'), FA.m53Note('vial'), FA.m53Note('seal'), FA.m53Edric),
  ], N.m53, { killUnit: 4, search: 3, set: 2 }),
  // D09 (Spy, half turned): Alric at the door; floor 1's patrol, the stoker, the plate and the sluices; the lift; floor 2's
  // gallery with Wenna, the guards she did not turn, Vey's household pair (the Act 5 pacing pass) and four searches; floor 3,
  // Vey; Alric at the foot
  build('d09', 70, FA.d09Alric, [
    ...door(FD('checkpoint.1')),
    ...foot(FD('patrol.1'), FD('patrol.4'), FA.d09Stoker, FA.d09Plate, FA.d09Shift, FD('sluice.1'), FD('sluice.3'), FD('sluice.2'), FD('basin'), FD('checkpoint.2'),
      FD('map'), FD('wenna'), FD('guard.3'), FA.d09Household(1), FA.d09Household(2), FD('vat.patrol.1'), FD('ledger.1'), FD('ledger.2'), FD('ledger.3'), FD('checkpoint.3'), FA.d09Letters, FD('arena.entry'),
      FD('arena.vey'), FD('link.hammer'), FA.d09AlricFoot),
  ], N.d09, { killUnit: 16, interact: 3, search: 7, puzzle: 1, boss: 1, set: 1 }),
  // M54: Alric at the camp, down through the Foundry's three floors to the link, the Hammer Hall's approach: the voice, the
  // four murals, eight thralls (six until the Act 5 pacing pass), Alric; sets: the voice, the murals light, the hall gate opens
  build('m54', 45, 'npc-post.alric.rim', [
    ...foot('caldera.door.foundry'),
    ...door(FD('checkpoint.1')),
    ...foot(FD('basin'), FD('checkpoint.2'), FD('checkpoint.3'), FD('link.hammer')),
    ...door(H('entry')),
    ...foot(H('checkpoint.1'), H('mural.1'), H('mural.2'), H('thrall.1'), H('thrall.2'), FA.m54Thrall(7), FA.m54Thrall(8), H('mural.3'), H('mural.4'),
      H('thrall.3'), H('thrall.4'), H('alric')),
  ], N.m54, { killUnit: 8, search: 4, set: 3 }),
  // M55: the hall: Ulthred's parley, the trial stone and its three rounds (one boss-length set piece), the verdict, Alric;
  // sets: the trial's start and its end
  build('m55', 40, H('alric'), [
    ...foot(H('mouth'), H('ulthred'), FA.m55Trial, H('slam.1'), H('slam.4'), H('slam.8'), FA.m55Trial, H('ulthred'), H('mouth'), H('alric')),
  ], N.m55, { boss: 1, interact: 1, set: 2 }),
  // D10: Alric, the approach's adds (eight thralls, nine hounds since the Act 5 pacing pass), the four vents and the four
  // marks, the hall and Ulthred's three phases (the floor drops onto the Anvil), Alric on the Anvil; sets: the door, the floor
  // falls, the Heartshard blow
  build('d10', 80, H('alric'), [
    ...foot(FA.d10Add(1), FA.d10Add(2), FA.d10Add(15), FA.d10Vent(1), FA.d10Vent(2), FA.d10Add(16), FA.d10Add(3), FA.d10Add(4), FA.d10Add(17), FA.d10Vent(3), FA.d10Vent(4),
      FA.d10Mark(1), FA.d10Mark(2), FA.d10Mark(3), FA.d10Mark(4), H('mouth'), H('ulthred'), H('slam.2'), H('slam.6')),
    ...door(FA.m56Alric),
  ], N.d10, { killUnit: 17, interact: 4, search: 4, boss: 3, set: 3 }),
  // M56: on the Anvil: Alric, Ysmeryth at the lip, the company by the causeway, Alric for the choice
  build('m56', 45, FA.m56Alric, [
    ...foot(FA.m56Ysmeryth, FA.m56Company, FA.m56Alric),
  ], N.m56, { interact: 2, set: 3 }),
];

let byId: Map<string, { x: number; z: number }> | undefined;
/** Any anchor a Foundry pacing row names: N1's layout, my world anchors, N2's interiors and my interior extras (local frames). */
export function paceAt(anchor: string): { x: number; z: number } {
  if (!byId) {
    byId = new Map([
      ...CALDERA_LAYOUT.anchors, ...foundryA5QuestLayout().anchors, ...ALL_INTERIORS.flatMap((d) => d.anchors),
      ...foundryA5InteriorExtras().flatMap((d) => d.anchors), ...RIM_QUEST_WORLD_ANCHORS,
    ].map((a) => [a.id, { x: a.x, z: a.z }]));
  }
  const p = byId.get(anchor);
  if (!p) throw new Error(`foundry a5 pacing: no anchor ${anchor}`);
  return p;
}
