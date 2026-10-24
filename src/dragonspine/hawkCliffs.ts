// The Hawk Cliffs (R18): the egg thief's camp on K1's cliff-foot plateau (sack, straw, tracks, a broken shell, three egg
// pick-ups), a companion hold point, the climb to the nest shelf as a winding path of about 160 m with built treads at its
// bends, three nests (one is R18's), the parents' circling anchors and the rime-hawk spawn anchors.
import { findFlat } from '../cinderreach/siteFit';
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, numbered, open, polar, sphere, type Part } from './helpers';
import { findShelf } from './fit';
import type { XZ } from './inputs';
import { pathLength, pathPoint, windingPath } from './paths';
import { Placer } from './placer';
import type { Sites } from './sites';

/** The climb proper is about this long; with the walk from the camp to its foot, five trips make the plan's 800 m on foot. */
export const CLIMB_LENGTH = 125;
/** The nest shelf stands at least this far over the foot to count as a climb. */
export const SHELF_MIN_GAIN = 15;
/** The parents circle this far over the shelf. */
export const ORBIT_ABOVE = 30;
const ORBIT_RADIUS = 22;

export interface HawkInfo {
  camp: XZ;
  eggs: XZ[];
  climbStart: XZ;
  climb: XZ[];
  climbLength: number;
  shelf: XZ;
  nests: XZ[];
  companionHold: XZ;
  specs: StructureSpec[];
}

export function hawkCliffsLayout(s: Sites): { part: Part; info: HawkInfo } {
  const F = s.hawkFoot;
  const placer = new Placer({ minX: F.minX + 3, maxX: F.maxX - 3, minZ: F.minZ + 3, maxZ: F.maxZ - 3 }, null, 0);
  const camp = { x: F.cx - 16, z: F.cz - 8 };
  const straw = placer.place('dragonspine-thief-straw', 'dragonspine-straw', camp, 3, 2.4, { mode: 'open', margin: 0.3 });
  const sack = placer.place('dragonspine-thief-sack', 'dragonspine-sack', { x: camp.x + 4, z: camp.z + 1 }, 1.6, 1.2, { mode: 'open', margin: 0.3 });
  const tracks = placer.place('dragonspine-thief-tracks', 'dragonspine-tracks', { x: camp.x + 3, z: camp.z + 7 }, 5, 1.2, { mode: 'open', margin: 0.3 });
  const shell = placer.place('dragonspine-broken-shell', 'dragonspine-shell', { x: camp.x - 4, z: camp.z + 3 }, 0.8, 0.8, { mode: 'open', margin: 0.3 });

  const eggs = [-2.4, 0, 2.4].map((dx) => ({ x: camp.x + dx, z: camp.z - 4 }));
  const climbStart = { x: F.cx + 8, z: F.maxZ - 5 };
  const shelf = findShelf(s.h, F, SHELF_MIN_GAIN);
  const shelfEntry = { x: shelf.x, z: shelf.z - 8 };
  const climb = windingPath(climbStart, shelfEntry, CLIMB_LENGTH, 3);
  const climbLength = pathLength(climb);
  const steps = Math.max(2, Math.ceil(climbLength / 20));
  const climbPts = Array.from({ length: steps }, (_, i) => pathPoint(climb, (climbLength * (i + 1)) / (steps + 1 - 0)));

  const treads = climb.slice(1, -1).map((p, i) => open(`dragonspine-climb-tread-${i + 1}`, 'rock', p.x, p.z, 3, 2.4, 0.3));
  const nestWant = [shelf, { x: shelf.x - 9, z: shelf.z + 5 }, { x: shelf.x + 9, z: shelf.z + 6 }];
  const nests = nestWant.map((w) => findFlat(s.h, { prefer: w, radius: 14, size: [2.2, 2.2], maxSpread: 0.45, step: 1 }) ?? w);
  const nestSpecs = nests.map((p, i) => open(`dragonspine-nest-${i + 1}`, 'dragonspine-nest', p.x, p.z, 2.2, 2.2));
  const hold = { x: F.maxX - 12, z: F.cz - 8 };

  const part: Part = {
    ...emptyPart(),
    anchors: [
      a('dragonspine.hawk.camp', camp.x, camp.z - 2, 0, ['objective']),
      ...[[-3, -1], [4, -2], [5, 5], [-5, 5]].map(([dx, dz], i) => a(`dragonspine.hawk.camp.search.${i + 1}`, camp.x + dx!, camp.z + dz!, 0, ['objective'])),
      ...numbered('dragonspine.hawk.egg', eggs.map((p) => [p.x, p.z] as const), ['objective'], 0),
      a('dragonspine.hawk.companion-hold', hold.x, hold.z, 270, ['poi']),
      // On the cliff face: `elevated` leaves the stand-on-a-slope check to the climb's own walkability test.
      ...numbered('dragonspine.hawk.climb', climbPts.map((p) => [p.x, p.z] as const), ['objective', 'elevated'], 0),
      a('dragonspine.hawk.nest.r18', nests[0]!.x, nests[0]!.z - 3, 0, ['objective']),
      a('dragonspine.hawk.nest.2', nests[1]!.x, nests[1]!.z - 3, 0, ['poi']),
      a('dragonspine.hawk.nest.3', nests[2]!.x, nests[2]!.z - 3, 0, ['poi']),
      ...[0, 90, 180, 270].map((b, i) => {
        const [x, z] = polar(shelf.x, shelf.z, b, ORBIT_RADIUS);
        return a(`dragonspine.hawk.circle.${i + 1}`, x, z, (b + 90) % 360, ['poi', 'elevated'], { dy: ORBIT_ABOVE });
      }),
      a('dragonspine.spawn.hawk-cliffs.parent-1', shelf.x - 5, shelf.z - 3, 0, ['spawn']),
      a('dragonspine.spawn.hawk-cliffs.parent-2', shelf.x + 5, shelf.z - 3, 0, ['spawn']),
      a('npc-post.egg-thief', camp.x + 2, camp.z - 2, 90, ['npc-post']),
    ],
    triggers: [sphere('trg.dragonspine.hawkcliffs.camp', camp.x, camp.z, 22), sphere('trg.dragonspine.hawkcliffs.nest', shelf.x, shelf.z, 14)],
    structures: [straw, sack, tracks, shell, ...treads, ...nestSpecs],
  };
  return { part, info: { camp, eggs, climbStart, climb, climbLength, shelf, nests, companionHold: hold, specs: part.structures } };
}
