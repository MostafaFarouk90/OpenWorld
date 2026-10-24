// The Rime Pass shelter on K1's shelter plateau, and the dressing of the switchback bends below it. Eadgyth's hut (exterior), her
// porch with the trophy wall (M29's five searches), the fire pit (M29), the woodpile about 150 m off (M29's 300 m on foot),
// drying racks, a lean-to, M31's offer point and the rime-pass waystone. K1 owns the road and its corridor.
import { findFlat } from '../cinderreach/siteFit';
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, headingTo, numbered, open, solid, sphere, type Part } from './helpers';
import type { XZ } from './inputs';
import { Placer } from './placer';
import { ROAD_CLEAR, ROAD_HALF_WIDTH, type Sites } from './sites';

export const WOODPILE_DISTANCE = 150;
/** Bearings tried, in order, for the woodpile's direction from the fire. */
const WOODPILE_BEARINGS = [235, 205, 265, 175, 295, 145, 325, 115, 355, 85];

export interface ShelterInfo {
  fire: XZ;
  woodpile: XZ;
  /** Road arc position of the shelter plateau's centre. */
  roadS: number;
  /** Arc positions of the switchback bends between the lodge and the shelter. */
  bendS: number[];
  specs: StructureSpec[];
}

/** Arc positions of the road's vertices where it turns by more than `minTurnDeg`, up to `maxS`. */
export function roadBends(points: Sites['road']['points'], maxS: number, minTurnDeg = 50): number[] {
  const out: number[] = [];
  let arc = 0;
  for (let i = 1; i < points.length - 1; i++) {
    arc += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
    if (arc > maxS) break;
    const h1 = headingTo(points[i - 1]![0], points[i - 1]![1], points[i]![0], points[i]![1]);
    const h2 = headingTo(points[i]![0], points[i]![1], points[i + 1]![0], points[i + 1]![1]);
    const turn = Math.abs(((h2 - h1 + 540) % 360) - 180);
    if (turn >= minTurnDeg) out.push(arc);
  }
  return out;
}

/** A point on the outer side of the road's bend at arc `bendS`, pushed out from the vertex until it is `minD` from the centre line. */
export function outsideOfBend(road: Sites['road'], bendS: number, minD: number): XZ {
  const vin = road.point(bendS - 0.01);
  const vout = road.point(bendS + 0.01);
  let ux = vin.dirX - vout.dirX;
  let uz = vin.dirZ - vout.dirZ;
  const len = Math.hypot(ux, uz) || 1;
  ux /= len;
  uz /= len;
  for (let k = 2; k < 80; k += 1) {
    const x = vin.x + ux * k;
    const z = vin.z + uz * k;
    if (road.nearest(x, z).d >= minD) return { x, z };
  }
  return { x: vin.x + ux * 80, z: vin.z + uz * 80 };
}

export function shelterLayout(s: Sites): { part: Part; info: ShelterInfo } {
  const S = s.shelter;
  const roadS = s.road.nearest(S.cx, S.cz).s;
  const placer = new Placer({ minX: S.minX + 3, maxX: S.maxX - 3, minZ: S.minZ + 3, maxZ: S.maxZ - 3 }, s.road, ROAD_CLEAR);

  const hut = placer.place('dragonspine-eadgyth-hut', 'house', { x: S.cx - 16, z: S.cz + 14 }, 10, 8);
  const trophy = placer.place('dragonspine-trophy-wall', 'dragonspine-trophy-wall', { x: hut.x, z: hut.z - hut.footprint[1] / 2 - 4.5 }, 12, 2.2);
  const pit = placer.place('dragonspine-shelter-fire-pit', 'dragonspine-fire-pit', { x: S.cx + 10, z: S.cz + 8 }, 3.2, 3.2, { mode: 'open', margin: 2 });
  const racks = [0, 1].map((i) => placer.place(`dragonspine-drying-rack-${i + 1}`, 'dragonspine-drying-rack', { x: S.cx + 14 + i * 7, z: S.cz + 20 }, 4, 1.5, { mode: 'open' }));
  const leanto = placer.place('dragonspine-shelter-leanto', 'dragonspine-leanto', { x: S.cx + 18, z: S.cz - 2 }, 6, 4);
  const stone = placer.place('dragonspine-waystone-rime-pass', 'waystone', { x: S.cx + 20, z: S.cz - 14 }, 1.6, 1.6, { height: 2.4, margin: 3 });

  const fire = { x: pit.x, z: pit.z - 2.8 };
  // The woodpile: a level spot about 150 m from the fire, in the first direction that has one.
  let woodpile: XZ | null = null;
  for (const b of WOODPILE_BEARINGS) {
    const rad = (b * Math.PI) / 180;
    const want = { x: pit.x + Math.sin(rad) * WOODPILE_DISTANCE, z: pit.z + Math.cos(rad) * WOODPILE_DISTANCE };
    const got = findFlat(s.h, { prefer: want, radius: 14, size: [6, 4], maxSpread: 0.4, step: 2 });
    if (got && Math.abs(Math.hypot(got.x - pit.x, got.z - pit.z) - WOODPILE_DISTANCE) <= 20 && s.road.nearest(got.x, got.z).d > ROAD_CLEAR + 4) {
      woodpile = got;
      break;
    }
  }
  if (!woodpile) throw new Error('dragonspine: no level ground for the woodpile about 150 m from the shelter fire');
  const pile = solid('dragonspine-woodpile', 'dragonspine-woodpile', woodpile.x, woodpile.z, 4, 2);

  // Dressing of the switchback bends: a cairn on the outside of each, rope posts at every other one, two hawk perches.
  const bendS = roadBends(s.road.points, roadS - S.d);
  const dressing: StructureSpec[] = [];
  bendS.forEach((bs, i) => {
    const side = i % 2 === 0 ? ROAD_HALF_WIDTH + 3 : -(ROAD_HALF_WIDTH + 3);
    const c = outsideOfBend(s.road, bs, ROAD_HALF_WIDTH + 3);
    dressing.push(solid(`dragonspine-bend-cairn-${i + 1}`, 'rock', c.x, c.z, 1.4, 1.4, 1.4));
    if (i % 2 === 1) {
      for (const [k, ds] of [[1, -8], [2, 8]] as const) {
        const p = s.road.point(bs + ds, -side / Math.abs(side) * (ROAD_HALF_WIDTH + 1.5));
        dressing.push(open(`dragonspine-rope-post-${i + 1}-${k}`, 'pole', p.x, p.z, 0.4, 0.4, 1.4));
      }
    }
    if (i === 2 || i === 5) {
      const p = outsideOfBend(s.road, bs, ROAD_HALF_WIDTH + 12);
      dressing.push(solid(`dragonspine-hawk-perch-${i === 2 ? 1 : 2}`, 'rock', p.x, p.z, 2.4, 2.4, 2.2));
    }
  });

  const trophyFront = trophy.z - trophy.footprint[1] / 2 - 1.8;
  const anchors = [
    a('waystone.rime-pass', stone.x, stone.z - 1.8, 0, ['waystone']),
    a('dragonspine.shelter.fire', fire.x, fire.z, 0, ['objective']),
    a('npc-post.eadgyth.fire', pit.x + 3, pit.z, headingTo(pit.x + 3, pit.z, pit.x, pit.z), ['npc-post']),
    a('dragonspine.shelter.m31-offer', pit.x - 4, pit.z - 3, 0, ['objective']),
    a('dragonspine.shelter.woodpile', woodpile.x, woodpile.z - 3, 0, ['objective']),
    ...numbered('dragonspine.shelter.trophy', [-4.4, -2.2, 0, 2.2, 4.4].map((dx) => [trophy.x + dx, trophyFront] as const), ['objective'], 0),
    a('dragonspine.spawn.shelter.hawk-1', woodpile.x - 12, woodpile.z + 6, 0, ['spawn']),
    a('dragonspine.spawn.shelter.hawk-2', woodpile.x + 12, woodpile.z + 8, 0, ['spawn']),
  ];
  const part: Part = {
    ...emptyPart(),
    anchors,
    triggers: [sphere('trg.dragonspine.shelter', S.cx, S.cz, 45), sphere('trg.dragonspine.shelter.woodpile', woodpile.x, woodpile.z, 9)],
    structures: [hut, trophy, pit, ...racks, leanto, stone, pile, ...dressing],
  };
  return { part, info: { fire, woodpile, roadS, bendS, specs: part.structures } };
}
