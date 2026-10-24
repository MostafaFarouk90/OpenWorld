// The Last Anvil site on K1's shoulder plateau: the cleared shrine pad and anchor (K9 builds the shrine, the anvil and the
// brazier on it), six carving stones on a loop of about 400 m, two keeper-marks, Ansgar's cell, the pilgrims' rest, spawn anchors
// for the shoulder and the waystone at the site. Nothing here is a shrine: no mesh, no anvil.
import { findFlat } from '../cinderreach/siteFit';
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, headingTo, numbered, open, polar, sphere, type Part } from './helpers';
import type { XZ } from './inputs';
import { Placer } from './placer';
import type { Sites } from './sites';

/** The carving loop (shrine, six stones, back) is about this long on foot (the plan's 400 m). */
export const CARVING_LOOP = 400;
/** The shrine keeps this radius clear for K9's shrine, anvil and brazier. */
export const SHRINE_CLEAR = 12;

export interface AnvilInfo {
  shrine: XZ;
  stones: XZ[];
  marks: XZ[];
  cell: XZ;
  rest: XZ;
  waystone: XZ;
  roadS: number;
  /** Length of the loop shrine -> stones 1..6 -> shrine. */
  loopLength: number;
  specs: StructureSpec[];
}

export function anvilLayout(s: Sites): { part: Part; info: AnvilInfo } {
  const A = s.anvil;
  const roadS = s.road.nearest(A.cx, A.cz).s;
  const placer = new Placer({ minX: A.minX + 3, maxX: A.maxX - 3, minZ: A.minZ + 3, maxZ: A.maxZ - 3 }, s.road, s.roadClear);
  const pad = placer.place('dragonspine-shrine-pad', 'dragonspine-pad', { x: A.cx, z: A.cz }, 16, 16, { mode: 'open', margin: 0 });
  placer.reserve(pad.x, pad.z, SHRINE_CLEAR);
  const shrine = { x: pad.x, z: pad.z };

  // The loop: six stones on a ring round the shrine whose radius makes shrine -> 1 -> ... -> 6 -> shrine about 400 m.
  const ringR = CARVING_LOOP / 7;
  const stones: XZ[] = Array.from({ length: 6 }, (_, i) => {
    const [x, z] = polar(shrine.x, shrine.z, 30 + 60 * i, ringR);
    return findFlat(s.h, { prefer: { x, z }, radius: 12, size: [1.6, 1.2], maxSpread: 0.4, step: 2 }) ?? { x, z };
  });
  let loopLength = 0;
  const loop = [shrine, ...stones, shrine];
  for (let i = 1; i < loop.length; i++) loopLength += Math.hypot(loop[i]!.x - loop[i - 1]!.x, loop[i]!.z - loop[i - 1]!.z);

  const marks = [75, 255].map((b, i) => {
    const [x, z] = polar(shrine.x, shrine.z, b, 26);
    return placer.place(`dragonspine-keeper-mark-${i + 1}`, 'dragonspine-mark', { x, z }, 1.4, 0.7, { margin: 2 });
  });
  const cell = placer.place('dragonspine-ansgar-cell', 'house', { x: A.cx - 32, z: A.cz + 20 }, 6, 5);
  const restShed = placer.place('dragonspine-pilgrims-rest', 'dragonspine-leanto', { x: A.cx + 30, z: A.cz - 26 }, 8, 4);
  const benches = [0, 1].map((i) => placer.place(`dragonspine-rest-bench-${i + 1}`, 'dragonspine-bench', { x: restShed.x - 4 + i * 8, z: restShed.z - 6 }, 3, 0.8, { mode: 'open' }));
  const stone = placer.place('dragonspine-waystone-last-anvil', 'waystone', { x: shrine.x - 18, z: shrine.z - 14 }, 1.6, 1.6, { height: 2.4, margin: 3 });

  const spawnAt = (bearing: number, r: number) => polar(A.cx, A.cz, bearing, r);
  const cellFront = { x: cell.x, z: cell.z - cell.footprint[1] / 2 - 2 };
  const restFront = { x: restShed.x, z: restShed.z - restShed.footprint[1] / 2 - 3 };
  const anchors = [
    a('dragonspine.anvil.shrine', shrine.x, shrine.z, 180, ['objective']),
    a('waystone.last-anvil', stone.x, stone.z - 1.8, 0, ['waystone']),
    ...numbered('dragonspine.anvil.carving', stones.map((p) => [p.x, p.z] as const), ['objective'], 0),
    ...marks.map((m, i) => a(`dragonspine.anvil.mark.${i + 1}`, m.x, m.z - 2, 0, ['objective'])),
    a('dragonspine.anvil.cell', cellFront.x, cellFront.z, 180, ['poi']),
    a('dragonspine.anvil.rest', restFront.x, restFront.z, 0, ['poi']),
    a('npc-post.ansgar.anvil', shrine.x + 10, shrine.z, headingTo(shrine.x + 10, shrine.z, shrine.x, shrine.z), ['npc-post']),
    a('npc-post.pilgrim-3', restFront.x + 3, restFront.z, 0, ['npc-post']),
    ...[30, 150, 270].map((b, i) => {
      const [x, z] = spawnAt(b, 42);
      return a(`dragonspine.spawn.anvil.hawk-${i + 1}`, x, z, 0, ['spawn']);
    }),
    (() => {
      const [x, z] = spawnAt(95, 46);
      return a('dragonspine.spawn.anvil.ogre', x, z, 0, ['spawn']);
    })(),
  ];
  const part: Part = {
    ...emptyPart(),
    anchors,
    triggers: [sphere('trg.dragonspine.anvil', shrine.x, shrine.z, 36)],
    structures: [
      pad,
      ...marks,
      cell,
      restShed,
      ...benches,
      stone,
      ...stones.map((p, i) => open(`dragonspine-carving-stone-${i + 1}`, 'dragonspine-carving', p.x, p.z, 1.6, 1.2)),
    ],
  };
  return { part, info: { shrine, stones, marks: marks.map((m) => ({ x: m.x, z: m.z })), cell: cellFront, rest: restFront, waystone: { x: stone.x, z: stone.z }, roadS, loopLength, specs: part.structures } };
}
