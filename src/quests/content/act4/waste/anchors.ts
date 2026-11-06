// The anchors the Waste quests add (prefix `waste.q.`, inside L0's reserved `waste.`). World anchors are computed from L1's
// exports already on main (the rope-lines' shelters and points, the places); everything beside a PR 2 site is a `near` anchor,
// placed at runtime once L1's anchor exists. Interior extras keep their base's height.
import { ROPE_LINE_GEOMS, SHELTER_SPOTS, pointAt, type RopeLineGeom } from '../../../../region/act4/ropeLines';
import { ACT4_PLACES } from '../../../../region/act4/act4Places';
import { W } from './ids';
import { L1 } from './siteIds';
import { M42_SHELTERS } from './m42.quest';
import { R24_SHELTERS } from './r24.quest';

export interface WorldAnchor { id: string; x: number; z: number; heading?: number }
export interface NearAnchor { id: string; near: string; dx: number; dz: number; heading?: number; interior?: boolean }

const r1 = (v: number): number => Math.round(v * 10) / 10;
const shelter = (id: string): { x: number; z: number; arc: number; lineId: string } => {
  const s = SHELTER_SPOTS.find((x) => x.id === id);
  if (!s) throw new Error(`waste a4 anchors: no shelter ${id}`);
  return { x: s.at.x, z: s.at.z, arc: s.arc, lineId: s.lineId };
};
export const line = (id: string): RopeLineGeom => {
  const l = ROPE_LINE_GEOMS.find((x) => x.id === id);
  if (!l) throw new Error(`waste a4 anchors: no rope-line ${id}`);
  return l;
};
/** A point `side` metres off the rope at `arc` (positive: the line's right hand). */
export function offRope(lineId: string, arc: number, side: number): { x: number; z: number } {
  const p = pointAt(line(lineId).points, arc);
  const len = Math.hypot(p.dx, p.dz) || 1;
  return { x: r1(p.x + (-p.dz / len) * side), z: r1(p.z + (p.dx / len) * side) };
}
const at = (id: string, p: { x: number; z: number }, dx = 0, dz = 0, heading?: number): WorldAnchor =>
  ({ id, x: r1(p.x + dx), z: r1(p.z + dz), ...(heading === undefined ? {} : { heading }) });
const near = (id: string, base: string, dx: number, dz: number, extra: Partial<NearAnchor> = {}): NearAnchor => ({ id, near: base, dx, dz, ...extra });

const CAMP = ACT4_PLACES['walker-camp'];

// ---- M42 -------------------------------------------------------------------------------------------------------------------
const S42 = M42_SHELTERS.map(shelter);
/** The two M42 groups: 40 m off the lane, midway between shelters 1 and 2 and between 3 and 4 (Q4: never in a lane's reach). */
const M42_STRIDERS_AT = offRope('rope.ashgate-camp', (S42[0]!.arc + S42[1]!.arc) / 2, 40);
const M42_WRAITHS_AT = offRope('rope.ashgate-camp', (S42[2]!.arc + S42[3]!.arc) / 2, -40);

// ---- R24 -------------------------------------------------------------------------------------------------------------------
const R24_LINE = 'rope.camp-crossing';
const SPRING = ACT4_PLACES['r24-spring'];
/** The spring's arc on its line (the nearest point, by sampling). */
export const R24_SPRING_ARC: number = (() => {
  const l = line(R24_LINE);
  let best = 0;
  let bestD = Infinity;
  const total = l.points.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - l.points[i - 1]![0], p[1] - l.points[i - 1]![1]) : 0), 0);
  for (let a = 0; a <= total; a += 2) {
    const p = pointAt(l.points, a);
    const d = Math.hypot(p.x - SPRING.x, p.z - SPRING.z);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
})();
/** The cart's route: every 60 m along the rope from the spring back to the camp end (arc 0), shelters included as stops. */
export const R24_ROUTE_ARCS: readonly number[] = (() => {
  const out: number[] = [];
  for (let a = R24_SPRING_ARC; a > 30; a -= 60) out.push(a);
  out.push(0);
  return out;
})();
export const R24_ROUTE_IDS: readonly string[] = R24_ROUTE_ARCS.map((_, i) => `${W}.r24.route.${i + 1}`);
/** The route node closest to each R24 shelter (the escort halts there). */
export const R24_SHELTER_NODES: readonly string[] = R24_SHELTERS.map((sid) => {
  const s = shelter(sid);
  let best = 0;
  R24_ROUTE_ARCS.forEach((a, i) => { if (Math.abs(a - s.arc) < Math.abs(R24_ROUTE_ARCS[best]! - s.arc)) best = i; });
  return R24_ROUTE_IDS[best]!;
});
const r24Attack = (frac: number, side: number) => offRope(R24_LINE, R24_SPRING_ARC * (1 - frac), side);

// ---- M46 -------------------------------------------------------------------------------------------------------------------
const RIM = ACT4_PLACES.rimfoot;

export const QUEST_WORLD_ANCHORS: readonly WorldAnchor[] = [
  // M42: the gate arch trigger, the four flaps, the pack and the knot-sign, the two groups, the camp edge
  at(`${W}.m42.gate`, offRope('rope.ashgate-camp', 15, 0)),
  ...S42.map((s, i) => at(`${W}.m42.flap.${i + 1}`, s, 2, 2)),
  at(`${W}.m42.pack`, S42[1]!, 5, -4),
  at(`${W}.m42.knot`, S42[3]!, -5, 4),
  ...[0, 1, 2].map((k) => at(`${W}.m42.striders.${k + 1}`, M42_STRIDERS_AT, (k - 1) * 4, (k % 2) * 3)),
  ...[0, 1, 2].map((k) => at(`${W}.m42.wraiths.${k + 1}`, M42_WRAITHS_AT, (k - 1) * 3, (k % 2) * 3)),
  at(`${W}.m42.camp`, CAMP),
  // M43: the torch at the camp fire
  at(`${W}.m43.torch`, CAMP, 3, 3),
  // R24: the cart's route, the brakes at the two shelters, the two attack points
  ...R24_ROUTE_ARCS.map((a, i) => at(R24_ROUTE_IDS[i]!, offRope(R24_LINE, a, 0))),
  ...R24_SHELTERS.map((sid, i) => at(`${W}.r24.brake.${i + 1}`, shelter(sid), 3, -2)),
  ...[1, 2, 3].map((k) => at(`${W}.r24.attack1.${k}`, r24Attack(0.35, 30), (k - 2) * 3, 0)),
  ...[1, 2, 3].map((k) => at(`${W}.r24.attack2.${k}`, r24Attack(0.7, -30), (k - 2) * 3, 0)),
  // M46: the rim trigger at the Rimfoot fire
  at(`${W}.m46.rim`, RIM, 0, -20),
];

export const NEAR_ANCHORS: readonly NearAnchor[] = [
  // posts of mine
  near(`${W}.post.wulfhild.ashgate`, L1.hildPost, 3.5, 1, { heading: 180 }),
  near(`${W}.post.wulfhild.glasslands`, L1.strike, -6, -4),
  near(`${W}.post.chapel-keeper`, L1.ebbaChapel, -4, 2),
  near(`${W}.post.carter.spring`, L1.spring, 4, 0),
  near(`${W}.post.d08.dying`, L1.cathedralEntry, -5, -8),
  ...[1, 2, 3].map((n) => near(`${W}.post.m46.keeper.${n}`, L1.cairn(n), 3, 0)),
  // M43: the lore stones, the blooms by the pyres, the knot-count stone, Hrodna's bout spot
  near(`${W}.m43.count-stones`, L1.walkerPost(1), 3, 2),
  near(`${W}.m43.spear-rack`, L1.hrodnaCamp, -3, 2),
  ...[1, 2, 3].map((n) => near(`${W}.m43.bloom.${n}`, L1.pyre(n), 5, 3)),
  near(`${W}.m43.count`, L1.stormWalkEnd, 2, 0),
  near(`${W}.m43.bout`, L1.trialRing, 0, 0),
  // M44: a note at each house, the nest's members round L1's nest point
  ...[1, 2, 3].map((n) => near(`${W}.m44.house.${n}`, L1.house(n), 2, -2)),
  ...[1, 2, 3].map((n) => near(`${W}.m44.house.${n}.b`, L1.house(n), -2.5, 2)),
  ...[1, 2, 3, 4, 5, 6].map((k) => near(`${W}.m44.nest.${k}`, L1.nest, (k - 3.5) * 2, k % 2 ? 2 : 4)),
  near(`${W}.m44.graves`, L1.chapelDoor, 8, 12),
  // R25: a hearth beside each burned shell, its name stone 2.5 m off, the knot round the third; the register by Sister Aedre
  ...[1, 2, 3].map((n) => near(`${W}.r25.name.${n}`, L1.r25Hearth(n), 2.5, 0)),
  ...[1, 2, 3, 4, 5].map((k) => near(`${W}.r25.knot.${k}`, L1.burnedVillage(3), (k - 3) * 3, -14)),
  near(`${W}.r25.register`, L1.chapelNote, 0, 0, { interior: true }),
  near(`${W}.r25.letter`, L1.chapelNote, 1.5, 0, { interior: true }),
  // R24: the spring's note and the load point, the unload at the camp gate
  near(`${W}.r24.spring`, L1.spring, -3, 2),
  near(`${W}.r24.load`, L1.spring, 6, 2),
  near(`${W}.r24.unload`, L1.campGate, 3, 0),
  // M45: the guard by the strike stone, a note beside each plaque, three searches among the pillars
  ...[1, 2, 3].map((k) => near(`${W}.m45.guard.${k}`, L1.strike, 18 + k * 3, 12)),
  ...[1, 2, 3].map((n) => near(`${W}.m45.plaque.${n}`, L1.plaque(n), 1.5, 0)),
  ...[1, 3, 5].map((p, i) => near(`${W}.m45.search.${i + 1}`, L1.pillar(p), 2, 2)),
  // D08: the knights' rings in the narthex (interior), the notes, the crypt door, the crypt's notes
  ...(['knight-1', 'knight-2'] as const).flatMap((g) => [1, 2, 3, 4].map((k) => near(`${W}.d08.${g}.${k}`, L1.narthex(g), (k - 2.5) * 2, 1.5, { interior: true }))),
  near(`${W}.d08.bones`, L1.narthex('bones'), 0, 0, { interior: true }),
  near(`${W}.d08.rope`, L1.narthex('gong-rope'), 0, 0, { interior: true }),
  near(`${W}.d08.tablets`, L1.crypt('note'), 0, 0, { interior: true }),
  near(`${W}.d08.niche`, L1.crypt('reward'), -2.5, 0, { interior: true }),
  // M46: at each cairn the keeper's post (above), the light, the mark, the wave's barricade and two lanes; the outriders
  ...[1, 2].map((n) => near(`${W}.m46.light.${n}`, L1.cairn(n), -1.5, 0)),
  ...[1, 2].map((n) => near(`${W}.m46.mark.${n}`, L1.cairnLore(n), 0, 0)),
  ...[1, 2, 3].flatMap((n) => [
    near(`${W}.m46.wave.${n}.barricade`, L1.cairnClearing(n), 0, 0),
    near(`${W}.m46.wave.${n}.lane.1`, L1.cairnClearing(n), 16, 12),
    near(`${W}.m46.wave.${n}.lane.2`, L1.cairnClearing(n), -16, 12),
  ]),
  ...[1, 2, 3, 4].map((k) => near(`${W}.m46.outriders.${k}`, L1.cairnClearing(3), (k - 2.5) * 4, -45)),
  near(`${W}.m46.lore.1`, L1.cairnLore(3), 0, 0),
  near(`${W}.m46.lore.2`, L1.rimfootFire, 4, -3),
];

export const ALL_ANCHOR_IDS: readonly string[] = [...QUEST_WORLD_ANCHORS.map((a) => a.id), ...NEAR_ANCHORS.map((a) => a.id)];
