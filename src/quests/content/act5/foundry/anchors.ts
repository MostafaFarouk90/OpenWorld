// The anchors the Foundry quests add (prefix `caldera.q.f.`, inside N0's `caldera.`). World anchors are computed from N1's
// master positions (src/caldera/calderaSites.ts); everything inside an N2 interior is a `near` anchor beside N2's own
// anchor, placed at runtime once the interior's anchors exist (interior anchors keep their base's height). R28's pyres stand
// in the Rim Gate's court until N1 PR 2 places the pyre sites; then these rows read N1's ids.
import { ANVIL_ISLAND, CALDERA_DOORS, INNER_GATE, RIM_CAMP, RIM_GATE_SITE, off, type XZ } from '../../../../caldera/calderaSites';
import { F } from './ids';

export interface WorldAnchor { id: string; x: number; z: number; heading?: number }
export interface NearAnchor { id: string; near: string; dx: number; dz: number; heading?: number; interior?: boolean }

const at = (id: string, p: XZ, heading?: number): WorldAnchor => ({ id, x: p[0], z: p[1], ...(heading === undefined ? {} : { heading }) });
const near = (id: string, base: string, dx: number, dz: number, extra: Partial<NearAnchor> = {}): NearAnchor => ({ id, near: base, dx, dz, interior: true, ...extra });

const COURT = RIM_GATE_SITE.court;
const FIRE = RIM_CAMP.fire;
const GATE = INNER_GATE.head;

/** R28's four pyres in a row across the court's north half, 14 m apart (placeholders for N1 PR 2's sites). */
export const R28_PYRE_AT: readonly XZ[] = [off(COURT, -21, 20), off(COURT, -7, 20), off(COURT, 7, 20), off(COURT, 21, 20)];
export const FA = {
  pyre: (n: number) => `${F}.r28.pyre.${n}`,
  mourner: (n: number) => `${F}.r28.mourner.${n}`,
  name: (n: number) => `${F}.r28.name.${n}`,
  token: (n: number) => `${F}.r28.token.${n}`,
  risen: (n: number) => `${F}.r28.risen.${n}`,
  rite: `${F}.r28.rite`,
  r30Anvil: `${F}.r30.anvil`,
  r30Page: (n: number) => `${F}.r30.page.${n}`,
  m53Truce: `${F}.m53.truce`,
  m53Edric: `${F}.m53.edric`,
  r28Wulfhild: `${F}.r28.wulfhild`,
  d09Alric: `${F}.d09.alric`,
  d09AlricFoot: `${F}.d09.alric-foot`,
  m53Vey: `${F}.m53.vey`,
  m53Note: (k: string) => `${F}.m53.note.${k}`,
  m53Foe: (n: number) => `${F}.m53.foe.${n}`,
  tunnelCaptain: `${F}.r27.captain`,
  tunnelNote: (k: string) => `${F}.r27.note.${k}`,
  d09Stoker: `${F}.d09.stoker`,
  d09Plate: `${F}.d09.plate`,
  d09Shift: `${F}.d09.shift-board`,
  d09Letters: `${F}.d09.letters`,
  d09Guard: (n: number) => `${F}.d09.guard.${n}`,
  m54Thrall: (n: number) => `${F}.m54.thrall.${n}`,
  m55Trial: `${F}.m55.trial`,
  d10Add: (n: number) => `${F}.d10.add.${n}`,
  d10Vent: (n: number) => `${F}.d10.vent.${n}`,
  d10Mark: (n: number) => `${F}.d10.mark.${n}`,
  m56Alric: `${F}.m56.alric`,
  m56Ysmeryth: `${F}.m56.ysmeryth`,
  m56Company: `${F}.m56.company`,
} as const;

export const QUEST_WORLD_ANCHORS: readonly WorldAnchor[] = [
  // R28: pyre, mourner (3 m south, toward the camp), the name (on a shield 3 m north), the token's spot beside it, the riser
  ...R28_PYRE_AT.flatMap((p, i) => [
    at(FA.pyre(i + 1), p), at(FA.mourner(i + 1), off(p, 0, 4), 180), at(FA.name(i + 1), off(p, 2.5, -3)),
    at(FA.token(i + 1), off(p, -2.5, -3)), at(FA.risen(i + 1), off(p, 0, -8)),
  ]),
  at(FA.rite, off(COURT, 0, 32), 180),
  at(FA.r28Wulfhild, off(COURT, -30, 30), 90),
  // R30: the camp's old anvil (Tobb drums the tune on it) and the three scattered pages
  at(FA.r30Anvil, off(FIRE, 20, -12)),
  at(FA.r30Page(1), off(FIRE, -48, 18)), at(FA.r30Page(2), off(FIRE, 62, 30)), at(FA.r30Page(3), off(COURT, 10, -10)),
  // M53: the truce on the Inner Gate's apron; Vey 10 m nearer the face; the three things read; the foes' ground
  at(FA.m53Truce, GATE), at(FA.m53Vey, off(GATE, 0, 10), 0), at(FA.m53Edric, off(GATE, -4, -4), 0),
  // D09: Alric waits outside the Foundry door (the offer stands outside the lock)
  at(FA.d09Alric, off(CALDERA_DOORS.foundry, 4, -6), 0),
  // M56 on the Anvil of Ages' island (after Ulthred's floor drop): Alric by the Anvil, Ysmeryth at the lip, the company by the causeway
  at(FA.m56Alric, off(ANVIL_ISLAND.centre, 0, -8), 0),
  at(FA.m56Ysmeryth, off(ANVIL_ISLAND.centre, 12, 4), 270),
  at(FA.m56Company, off(ANVIL_ISLAND.centre, -10, -6), 90),
  at(FA.m53Note('ledger'), off(GATE, -9, 6)), at(FA.m53Note('vial'), off(GATE, 9, 6)), at(FA.m53Note('seal'), off(GATE, 0, -8)),
  ...[1, 2, 3, 4, 5, 6].map((n) => at(FA.m53Foe(n), off(GATE, -10 + (n - 1) * 4, 14))),
];

const T = 'caldera.int.tunnel';
const FD = 'caldera.int.foundry';
const H = 'caldera.int.hammer';
export const NEAR_ANCHORS: readonly NearAnchor[] = [
  // R27, in the stokers' tunnel: the captain by the garrison posts; a stoker's tally and the old door's mark at the mouth (clear of every prop)
  near(FA.tunnelCaptain, `${T}.post.4`, 0, -1.2),
  near(FA.tunnelNote('tally'), `${T}.checkpoint`, 0, 5),
  near(FA.tunnelNote('door'), `${T}.checkpoint`, 3.5, -2),
  near(FA.tunnelNote('roster'), `${T}.checkpoint`, -3.5, -2),
  // D09: the captive stoker on floor 1 (near the checkpoint), the sluices' plate (3 m in front of the first sluice)
  near(FA.d09Stoker, `${FD}.checkpoint.1`, 3, 2),
  near(FA.d09Plate, `${FD}.sluice.1`, 4, 5),
  // D09: the stokers' shift board by the lift head; Edric's mother's letters on the last stair, before the arena
  near(FA.d09Shift, `${FD}.basin`, 5, -2),
  near(FA.d09Letters, `${FD}.checkpoint.3`, 2, -2),
  // D09: Alric comes down to the foot once Vey's fight is over (beside the link to the Hammer Hall)
  near(FA.d09AlricFoot, `${FD}.link.hammer`, 2, -3),
  // M54: two more thralls either side of the hall gate
  near(FA.m54Thrall(5), `${H}.alric`, -5, -4),
  near(FA.m54Thrall(6), `${H}.alric`, 5, -4),
  // M55: the trial's stone in the hall, beside the parley spot; D10's adds wake in the approach (before the hall's last door)
  near(FA.m55Trial, `${H}.parley`, -3, 2),
  // D10: eight thralls beside N2's thrall spots and six forge-fire hounds up the approach's middle
  ...[1, 2, 3, 4].flatMap((n) => [near(FA.d10Add(n), `${H}.thrall.${n}`, 0, 3), near(FA.d10Add(n + 4), `${H}.thrall.${n}`, 0, -3)]),
  ...[0, 1, 2, 3, 4, 5].map((i) => near(FA.d10Add(9 + i), `${H}.checkpoint.1`, i % 2 === 0 ? -3 : 3, 6 + i * 2.5)),
  // D10: the four forge vents in the approach walls, and the stokers' marks either side of the last door
  // vents on the side walls, clear of N2's murals (z 8 and 20): z 14 and 26; marks past Alric, 2.5 m apart, clear of the adds
  ...[1, 2, 3, 4].map((n) => near(FA.d10Vent(n), `${H}.checkpoint.1`, n % 2 === 0 ? 6.5 : -6.5, n <= 2 ? 9 : 21)),
  ...[1, 2, 3, 4].map((n) => near(FA.d10Mark(n), `${H}.alric`, n % 2 === 0 ? 3 : -3, n <= 2 ? 4.5 : 7)),
];
