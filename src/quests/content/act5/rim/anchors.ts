// The anchors the Rim quests add (prefix `caldera.q.`, and the agreed `caldera.stair.` for M48's stand-ins, both inside v0.9's
// reserved `caldera.`). Every point is computed from N1's master positions (src/caldera/calderaSites.ts); nothing is copied.
// Interior extras sit beside N2's Cooling Hall anchors (`near`, resolved at runtime once the interior is placed).
import { headingTo, LAVA_STAIR, off, RIM_CAMP, RIM_GATE_SITE, RIM_STAIRS, SIEGE_POINTS, STOKERS, WYRM_TERRACES, CALDERA_PLACES, type XZ } from '../../../../caldera/calderaSites';
import { ANVIL, TERRACES_POINTS, TUNNEL_PATH_POINTS } from '../../../../terrain/shape/caldera';
import { COOL, Q, STAIR } from './ids';
import { M48_CHANNELS, M48_LEVER_CHANNELS, M48_VENT_CHANNELS } from './m48.quest';
import { M49_HOUSES } from './m49.quest';
import { R29_POSTS } from './r29.quest';

export interface WorldAnchor { id: string; x: number; z: number; heading?: number }
export interface NearAnchor { id: string; near: string; dx: number; dz: number; heading?: number; interior?: boolean }

const r1 = (v: number): number => Math.round(v * 10) / 10;
const at = (id: string, p: XZ, heading?: number): WorldAnchor => ({ id, x: r1(p[0]), z: r1(p[1]), ...(heading === undefined ? {} : { heading }) });
const near = (id: string, base: string, dx: number, dz: number, extra: Partial<NearAnchor> = {}): NearAnchor => ({ id, near: base, dx, dz, ...extra });

/** Total length of a polyline. */
export const pathLength = (pts: readonly XZ[]): number => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) : 0), 0);

/** The point `s` metres along a polyline, its unit direction, and the unit normal pointing away from the Anvil (upslope). */
export function alongPath(pts: readonly XZ[], s: number): { p: XZ; dir: XZ; up: XZ } {
  let left = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= len || i === pts.length - 1) {
      const t = len > 0 ? Math.min(1, left / len) : 0;
      const p: XZ = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const dir: XZ = len > 0 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [0, 1];
      let n: XZ = [-dir[1], dir[0]];
      const out: XZ = [p[0] - ANVIL[0], p[1] - ANVIL[1]];
      if (n[0] * out[0] + n[1] * out[1] < 0) n = [-n[0], -n[1]];
      return { p, dir, up: n };
    }
    left -= len;
  }
  const p = pts[pts.length - 1]!;
  return { p, dir: [0, 1], up: [0, -1] };
}
/** `s` along the path, `ahead` further along it, `side` metres toward the upslope (negative: downslope). */
export function stairPoint(s: number, ahead = 0, side = 0): XZ {
  const { p, dir, up } = alongPath(LAVA_STAIR.points, s + ahead);
  void dir;
  return [r1(p[0] + up[0] * side), r1(p[1] + up[1] * side)];
}

// ---- M48: the Lava Stair (agreed with N1, 2026-11-07) ---------------------------------------------------------------------
export const STAIR_LENGTH = pathLength(LAVA_STAIR.points);
/** Channel centres at 1/7 steps of the stair's length (86, 172, 258, 345, 431, 517 m on N1's 603 m). */
export const M48_CHANNEL_S: readonly number[] = M48_CHANNELS.map((n) => Math.round((STAIR_LENGTH * n) / 7));
/** N1 / N3: a Surge span is at most 5.4 m: the lips are 2.5 m either side of the channel's centre. */
export const M48_LIP_M = 2.5;
/** Wheels stand 3 m off the road's upslope edge (half width 3), levers 3 m off its downslope edge. */
const OFF_EDGE = 6;

// ---- M47 ---------------------------------------------------------------------------------------------------------------------
const P = RIM_STAIRS.points;
const mid = (a: XZ, b: XZ): XZ => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const KNOT1 = off(mid(P[1]!, P[2]!), 0, 16);
const KNOT2 = off(mid(P[3]!, P[4]!), 0, -14);
const GATE = RIM_GATE_SITE.gate;
const FIRE = RIM_CAMP.fire;

// ---- R26: the convoy at Rimfoot; the fast road straight up the stairs, the long road by the east flank to the hairpin ----------
const RIMFOOT = CALDERA_PLACES.rimfoot;
export const R26_FAST_ROUTE: readonly XZ[] = [off(RIMFOOT, 16, 22), ...P, off(GATE, 0, 30), off(GATE, 0, 120), off(FIRE, -20, -30)];
export const R26_LONG_ROUTE: readonly XZ[] = [
  off(RIMFOOT, 16, 22), [11300, 6230], [11550, 6290], [11700, 6330], P[3]!, ...P.slice(4), off(GATE, 0, 30), off(GATE, 0, 120), off(FIRE, -20, -30),
];
/** Route node ids (the escort walks them in order). */
export const R26_ROUTE_IDS = { fast: R26_FAST_ROUTE.map((_, i) => `${Q}.r26.fast.${i + 1}`), long: R26_LONG_ROUTE.map((_, i) => `${Q}.r26.long.${i + 1}`) } as const;
/** The long road's storm halts: the second and fourth nodes (the east flank, then below the hairpin). */
export const R26_HALT_NODES: readonly string[] = [R26_ROUTE_IDS.long[1]!, R26_ROUTE_IDS.long[3]!];
const AMBUSH1 = off(mid(P[1]!, P[2]!), 10, -18);
const AMBUSH2 = off(mid(P[4]!, P[5]!), 0, 18);

// ---- R29: three stoker posts round the rim shelf (the stokers' hut, the west shelf, the tunnel path) ---------------------------------
export const R29_POST_AT: Readonly<Record<1 | 2 | 3, XZ>> = { 1: off(STOKERS.post, -6, -10), 2: [10880, 6815], 3: TUNNEL_PATH_POINTS[1]! };

// ---- M51 ---------------------------------------------------------------------------------------------------------------------
const L = WYRM_TERRACES.ledges;
export const M51_PERCH: Readonly<Record<'ysmeryth' | 'orsk' | 'hathren' | 'hill-wyrm', XZ>> = {
  ysmeryth: L[0]!.at, orsk: L[2]!.at, hathren: off(L[1]!.at, 25, 25), 'hill-wyrm': off(L[2]!.at, 20, -30),
};
const SCOUTS: XZ = off(TERRACES_POINTS[5]!, -30, 50);

export const QUEST_WORLD_ANCHORS: readonly WorldAnchor[] = [
  // M47: the two knots on the switchbacks, the journal at the hairpin, the inscription at the landing, Alric's post inside the
  // gate, Edric and Rook beside it, the stokers' brazier, the gatehouse lamp, the old bell
  ...[0, 1, 2].map((k) => at(`${Q}.m47.knot1.${k + 1}`, off(KNOT1, (k - 1) * 4, (k % 2) * 3))),
  ...[0, 1, 2].map((k) => at(`${Q}.m47.knot2.${k + 1}`, off(KNOT2, (k - 1) * 4, (k % 2) * 3))),
  at(`${Q}.m47.hairpin`, RIM_STAIRS.hairpin),
  at(`${Q}.m47.journal`, off(RIM_STAIRS.hairpin, 6, 5)),
  at(`${Q}.m47.inscription`, off(RIM_GATE_SITE.landing, -6, -2)),
  at(`${Q}.post.alric.gate`, off(GATE, -10, 50), 180),
  at(`${Q}.post.edric.gate`, off(GATE, -16, 58), 160),
  at(`${Q}.post.rook.gate`, off(GATE, -4, 60), 200),
  at(`${Q}.m47.brazier`, off(GATE, 4, 56)),
  at(`${Q}.m47.lamp`, off(RIM_GATE_SITE.towers[1]!, 4, 6)),
  at(`${Q}.m47.bell`, off(GATE, 12, 70)),
  // M48: Alric at the stair's head and foot, the ghost on the middle landing, the two knots, the marks, the tally, the cache
  at(`${Q}.post.alric.stair`, off(LAVA_STAIR.head, 5, -5), headingTo(LAVA_STAIR.head, LAVA_STAIR.mid)),
  at(`${Q}.post.alric.foot`, off(LAVA_STAIR.foot, -6, -8)),
  at(`${Q}.post.m48.ghost`, stairPoint(300, 0, OFF_EDGE)),
  ...[0, 1, 2, 3].map((k) => at(`${Q}.m48.golems.${k + 1}`, stairPoint(205 + k * 6, 0, -8 - (k % 2) * 4))),
  ...[0, 1, 2, 3].map((k) => at(`${Q}.m48.gnats.${k + 1}`, stairPoint(465 + k * 6, 0, -8 - (k % 2) * 4))),
  at(`${Q}.m48.marks`, stairPoint(130, 0, OFF_EDGE)),
  at(`${Q}.m48.tally`, stairPoint(388, 0, OFF_EDGE)),
  at(`${Q}.m48.cache`, off(LAVA_STAIR.foot, 6, -10)),
  // M48: the stand-in channel lips, vent wheels and gantry levers (N1 PR 2 builds the channels on these points)
  ...M48_CHANNELS.flatMap((n) => [
    at(`${STAIR}.chan.${n}`, stairPoint(M48_CHANNEL_S[n - 1]!, M48_LIP_M)),
    at(`${STAIR}.chan.${n}.near`, stairPoint(M48_CHANNEL_S[n - 1]!, -M48_LIP_M)),
  ]),
  ...M48_VENT_CHANNELS.map((n, i) => at(`${STAIR}.vent.${i + 1}`, stairPoint(M48_CHANNEL_S[n - 1]!, -M48_LIP_M - 1, OFF_EDGE))),
  ...M48_LEVER_CHANNELS.map((n, i) => at(`${STAIR}.lever.${i + 1}`, stairPoint(M48_CHANNEL_S[n - 1]!, -M48_LIP_M - 1, -OFF_EDGE))),
  // M49: the signal fire, the banner poles at the gate court, the three posts, the notes
  at(`${Q}.m49.signal`, off(FIRE, 4, 4)),
  ...[...M49_HOUSES, 'camp' as const].map((h, i) => at(`${Q}.m49.banner.${h}`, off(SIEGE_POINTS.banner, (i - 1.5) * 6, -4))),
  at(`${Q}.m49.post.brace`, off(SIEGE_POINTS.gate[1]!, 0, 8)),
  at(`${Q}.m49.post.crates`, off(SIEGE_POINTS.crates, 0, -4)),
  at(`${Q}.m49.post.wall`, off(SIEGE_POINTS.wallLeft, -5, 6)),
  at(`${Q}.m49.plan`, off(RIM_CAMP.warTable, 4, -4)),
  at(`${Q}.m49.tally`, off(STOKERS.post, -10, 6)),
  // R26: the master, the guards, the load point and the manifest at Rimfoot; both roads; the ambushes; the brakes; the unload
  at(`${Q}.post.r26.master`, off(RIMFOOT, 12, 14)),
  at(`${Q}.post.r26.guard.1`, off(RIMFOOT, 20, 14)),
  at(`${Q}.post.r26.guard.2`, off(RIMFOOT, 22, 18)),
  at(`${Q}.post.r26.guard.1.camp`, off(RIM_CAMP.tents[4]!, 5, 6)),
  at(`${Q}.post.r26.guard.2.camp`, off(RIM_CAMP.tents[4]!, 8, 3)),
  at(`${Q}.post.r26.master.camp`, off(FIRE, -24, -26)),
  at(`${Q}.r26.load`, off(RIMFOOT, 18, 26)),
  at(`${Q}.r26.manifest`, off(RIMFOOT, 10, 24)),
  ...R26_FAST_ROUTE.map((p, i) => at(R26_ROUTE_IDS.fast[i]!, p)),
  ...R26_LONG_ROUTE.map((p, i) => at(R26_ROUTE_IDS.long[i]!, p)),
  ...[1, 2, 3, 4].map((k) => at(`${Q}.r26.ambush1.${k}`, off(AMBUSH1, (k - 2.5) * 3, (k % 2) * 2))),
  ...[1, 2, 3, 4].map((k) => at(`${Q}.r26.ambush2.${k}`, off(AMBUSH2, (k - 2.5) * 3, (k % 2) * 2))),
  ...[0, 1].map((i) => at(`${Q}.r26.brake.${i + 1}`, off(i === 0 ? R26_LONG_ROUTE[1]! : R26_LONG_ROUTE[3]!, 3, -3))),
  at(`${Q}.r26.unload`, off(FIRE, -16, -30)),
  at(`${Q}.r26.waybill`, off(FIRE, -12, -33)),
  // R29: at each post the shade, the part, the search and the dead; the gong frame is N1's
  ...R29_POSTS.flatMap((n) => [
    at(`${Q}.post.r29.stoker.${n}`, off(R29_POST_AT[n], 2, 0)),
    at(`${Q}.r29.part.${n}`, off(R29_POST_AT[n], -2, 2)),
    at(`${Q}.r29.search.${n}`, off(R29_POST_AT[n], 0, -4)),
    ...[1, 2].map((k) => at(`${Q}.r29.dead.${n}.${k}`, off(R29_POST_AT[n], 10 + k * 3, 8))),
  ]),
  // M51: the horn-stone at the camp, the talk spots in front of the perches, the scouts, the captain, the notes
  at(`${Q}.m51.call`, off(FIRE, -40, 20)),
  ...(['ysmeryth', 'orsk', 'hathren'] as const).map((d) => at(`${Q}.m51.talk.${d}`, off(M51_PERCH[d], -12, 0))),
  ...[1, 2, 3, 4].map((k) => at(`${Q}.m51.scouts.${k}`, off(SCOUTS, (k - 2.5) * 3, (k % 2) * 3))),
  at(`${Q}.post.m51.captain`, off(SCOUTS, 0, -6)),
  at(`${Q}.m51.orders`, off(SCOUTS, 5, -9)),
  at(`${Q}.m51.bones`, off(M51_PERCH.ysmeryth, -14, -18)),
];

export const NEAR_ANCHORS: readonly NearAnchor[] = [
  // M50: the Hall's keeper in the vestibule; the gnats in the third chamber
  near(`${Q}.post.m50.keeper`, `${COOL}.entry`, -2.5, 2.5, { interior: true }),
  near(`${Q}.m50.gnats.1`, `${COOL}.gauge.3`, -4, -2, { interior: true }),
];

export const ALL_ANCHOR_IDS: readonly string[] = [...QUEST_WORLD_ANCHORS.map((a) => a.id), ...NEAR_ANCHORS.map((a) => a.id)];
