import type { InteriorDef, LocalRect } from '../../interiors/types';
import { corridor, MINE_IDS, mineDef, rect, room, torchesAlong } from './kit';

export const LOWER_GALLERIES_ID = MINE_IDS.lower;
/** The blocker ids the runtime closes (lowerRuntime.ts). */
export const LOWER_SHORTCUT_GATE = 'oldsmoke.lower.shortcut.gate';
export const LOWER_SEALED_DOOR = 'oldsmoke.lower.sealed.door';
/** Orsk's hall is 16 m high so the wyrm fits; the visible low roof (`M20_ROOF_HEIGHT`, 9 m) is the procedural slab in orskRoof.ts. */
export const M20_HALL_HEIGHT = 16;
export const M20_ROOF_HEIGHT = 9;
/** The M20 hall floor (local metres); the roof slab covers exactly this. */
export const M20_HALL_RECT: LocalRect = rect(-60, -36, -24, -6);

const PILLAR_HALF = 0.7;
const pillar = (x: number, z: number): LocalRect => rect(x - PILLAR_HALF, z - PILLAR_HALF, x + PILLAR_HALF, z + PILLAR_HALF);

// The long route (Wenna's M19 walk): down the north corridor, round the back and into the cover room, then the nursery.
const LONG_ROUTE: readonly { x: number; z: number }[] = [
  { x: 0, z: -5 },
  { x: 0, z: -55 },
  { x: 20, z: -55 },
  { x: 20, z: -42 },
  { x: 41, z: -42 },
  { x: 41, z: -22 },
];

/** Points along the polyline, every 4 to 5.5 m (each segment split evenly), corners included. */
function sampleRoute(pts: readonly { x: number; z: number }[]): { x: number; z: number }[] {
  const out = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 5.5);
    for (let k = 1; k <= n; k++) out.push({ x: Math.round((a.x + ((b.x - a.x) * k) / n) * 10) / 10, z: Math.round((a.z + ((b.z - a.z) * k) / n) * 10) / 10 });
  }
  return out;
}
export const M19_ROUTE = sampleRoute(LONG_ROUTE);

const rooms = [
  room('landing', -6, -10, 12, 12, 4),
  // Long way: north corridor (sealed door at z -35), the back run, the cover room, a short link into the nursery.
  corridor('north', { x: 0, z: -10 }, { x: 0, z: -55 }),
  corridor('back', { x: 0, z: -55 }, { x: 20, z: -55 }),
  corridor('rise', { x: 20, z: -55 }, { x: 20, z: -42 }),
  corridor('cover-in', { x: 20, z: -42 }, { x: 24, z: -42 }),
  room('cover', 24, -48, 26, 14, 4),
  corridor('link', { x: 41, z: -34 }, { x: 41, z: -26 }),
  room('nursery', 30, -26, 22, 26, 5),
  // Short way: straight east from the landing to the nursery, the gate across it.
  corridor('shortcut', { x: 6, z: -4 }, { x: 30, z: -4 }),
  // The hall is reached from the landing by its own corridor, clear of the sealed door.
  corridor('hall-way', { x: -6, z: -8 }, { x: -24, z: -8 }),
  { id: 'm20-hall', ...M20_HALL_RECT, height: M20_HALL_HEIGHT },
];

export const LOWER_GALLERIES_DEF: InteriorDef = mineDef('lower', {
  rooms,
  pillars: [
    // Cover for the last stretch before the nursery.
    pillar(30, -45),
    pillar(34, -37),
    pillar(45, -45),
    pillar(46, -38),
  ],
  props: [
    { id: 'crate.1', rect: rect(36, -46, 38.5, -44.5), height: 1.2 },
    { id: 'crate.2', rect: rect(27, -39.5, 28.5, -38), height: 1 },
    { id: 'nest.1', rect: rect(44, -13, 49, -7), height: 0.8 },
    { id: 'nest.2', rect: rect(33, -24.5, 36, -22.5), height: 0.6 },
    // Wall posts the wyrmling chains hang from.
    { id: 'chainpost.1', rect: rect(-30.8, -35.8, -29.2, -35.2), height: 1.4 },
    { id: 'chainpost.2', rect: rect(-42.8, -35.8, -41.2, -35.2), height: 1.4 },
    { id: 'chainpost.3', rect: rect(-54.8, -35.8, -53.2, -35.2), height: 1.4 },
    { id: 'chainpost.4', rect: rect(-59.8, -10.8, -59.2, -9.2), height: 1.4 },
    { id: 'chainpost.5', rect: rect(-24.8, -24.8, -24.2, -23.2), height: 1.4 },
    { id: 'rack.1', rect: rect(-59.8, -26, -58.8, -19), height: 1.2 },
  ],
  blockers: [
    { id: LOWER_SHORTCUT_GATE, rect: rect(18.5, -5.5, 19.5, -2.5), height: 3.6 },
    { id: LOWER_SEALED_DOOR, rect: rect(-1.5, -35.5, 1.5, -34.5), height: 3.6 },
  ],
  torches: [
    ...torchesAlong(rect(-6, -10, 6, 2), 2.2, 6),
    ...torchesAlong(rect(-1.5, -55, 1.5, -10), 2.2, 10),
    ...torchesAlong(rect(24, -48, 50, -34), 2.2, 8),
    ...torchesAlong(rect(30, -26, 52, 0), 2.6, 8),
    ...torchesAlong(rect(-60, -36, -24, -6), 4, 9),
  ],
  anchors: [
    { id: 'oldsmoke.lower.lift', x: 0, z: -1, yaw: 0 },
    { id: 'oldsmoke.lower.lift.up', x: -2.5, z: -1, yaw: 0 },
    { id: 'oldsmoke.lower.lift.call', x: 2.5, z: -1, yaw: 0 },

    // M19: Wenna's walk and the nursery.
    ...M19_ROUTE.map((p, i) => ({ id: `oldsmoke.m19.route.${i}`, x: p.x, z: p.z, yaw: 0 })),
    { id: 'oldsmoke.m19.nursery', x: 41, z: -20, yaw: 0, facing: { x: 46.5, z: -10 } },
    { id: 'oldsmoke.stealth.m19.start', x: 26, z: -42, yaw: 270 },
    { id: 'oldsmoke.stealth.m19.cp.inside', x: 38, z: -41, yaw: 270 },
    { id: 'oldsmoke.stealth.m19.end', x: 41, z: -30, yaw: 0 },
    { id: 'oldsmoke.stealth.m19.centre', x: 37, z: -41, yaw: 0 },
    // M19's watch: four posts and a five-point loop over the cover room (A13 spawns and gates the guards).
    { id: 'oldsmoke.m19.watch.1', x: 29, z: -38.5, yaw: 270 },
    { id: 'oldsmoke.m19.watch.2', x: 47, z: -38, yaw: 90 },
    { id: 'oldsmoke.m19.watch.3', x: 26.5, z: -43.5, yaw: 270 },
    { id: 'oldsmoke.m19.watch.4', x: 47, z: -45, yaw: 90 },
    { id: 'oldsmoke.m19.patrol.1', x: 29, z: -37, yaw: 90 },
    { id: 'oldsmoke.m19.patrol.2', x: 38, z: -37, yaw: 90 },
    { id: 'oldsmoke.m19.patrol.3', x: 47, z: -37, yaw: 180 },
    { id: 'oldsmoke.m19.patrol.4', x: 47, z: -46, yaw: 270 },
    { id: 'oldsmoke.m19.patrol.5', x: 33, z: -46.5, yaw: 270 },
    { id: 'oldsmoke.hide.m19.1', x: 30, z: -46.8, yaw: 0 },
    { id: 'oldsmoke.hide.m19.2', x: 34, z: -35.5, yaw: 0 },
    { id: 'oldsmoke.hide.m19.3', x: 45, z: -46.8, yaw: 0 },
    { id: 'oldsmoke.hide.m19.4', x: 37.2, z: -47, yaw: 0 },

    // The sealed door across the north corridor: in front, on the door line, behind.
    { id: 'oldsmoke.lower.sealed.1', x: 0, z: -32, yaw: 0 },
    { id: 'oldsmoke.lower.sealed.2', x: 0, z: -35, yaw: 0 },
    { id: 'oldsmoke.lower.sealed.3', x: 0, z: -38, yaw: 0 },
    // The shortcut, the gate between the two points.
    { id: 'oldsmoke.lower.shortcut.a', x: 12, z: -4, yaw: 270 },
    { id: 'oldsmoke.lower.shortcut.b', x: 26, z: -4, yaw: 270 },

    // M20: wall-chained wyrmling pens, the steward posts between them, the captain at the far end, Orsk's launch point.
    { id: 'oldsmoke.m20.chain.1', x: -30, z: -33.5, yaw: 180 },
    { id: 'oldsmoke.m20.chain.2', x: -42, z: -33.5, yaw: 180 },
    { id: 'oldsmoke.m20.chain.3', x: -54, z: -33.5, yaw: 180 },
    { id: 'oldsmoke.m20.chain.4', x: -57.5, z: -10, yaw: 90 },
    { id: 'oldsmoke.m20.chain.5', x: -26.5, z: -24, yaw: 270 },
    { id: 'oldsmoke.m20.post.1', x: -36, z: -30, facing: { x: -42, z: -21 } },
    { id: 'oldsmoke.m20.post.2', x: -48, z: -30, facing: { x: -42, z: -21 } },
    { id: 'oldsmoke.m20.post.3', x: -56, z: -29, facing: { x: -42, z: -21 } },
    { id: 'oldsmoke.m20.post.4', x: -55, z: -14, facing: { x: -42, z: -21 } },
    { id: 'oldsmoke.m20.post.5', x: -28, z: -16, facing: { x: -42, z: -21 } },
    { id: 'oldsmoke.m20.captain', x: -55, z: -22.5, facing: { x: -30, z: -22.5 } },
    { id: 'oldsmoke.m20.roof', x: -42, z: -21, yaw: 0 },

    // Crawlers: spawn points and ceiling drops (floor points, 2 m from walls).
    { id: 'oldsmoke.lower.spawn.1', x: -36, z: -14, yaw: 0 },
    { id: 'oldsmoke.lower.spawn.2', x: 29, z: -36, yaw: 0 },
    { id: 'oldsmoke.lower.spawn.3', x: 40, z: -14, yaw: 0 },
    ...(
      [
        [-34, -22],
        [-50, -26],
        [-50, -14],
        [-42, -30],
        [36, -38],
        [32, -42],
        [36, -8],
        [34, -18],
      ] as const
    ).map(([x, z], i) => ({ id: `oldsmoke.lower.drop.${i + 1}`, x, z, yaw: 0 })),
  ],
});

export const LOWER_GALLERIES_STRINGS_EN: Record<string, string> = {
  [`interior.enter.${MINE_IDS.lower}`]: '{key} Enter the Lower Galleries',
  [`interior.exit.${MINE_IDS.lower}`]: '{key} Ride up to the surface',
};
