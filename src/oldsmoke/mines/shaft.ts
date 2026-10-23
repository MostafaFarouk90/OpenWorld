import type { InteriorDef } from '../../interiors/types';
import { corridor, MINE_IDS, MINE_LANDINGS, mineDef, rect, room, torchesAlong } from './kit';

/**
 * The Deepgate shaft floor (greybox). Local metres from the lift landing, yaw 0 faces -Z. A wide lift hall holds the landing, the
 * exit and the lift menu; corridors run west and east to the first two vent chambers and north to the other two. The west chamber
 * also opens on a side tunnel with two trapped miners behind rubble heaps (a 1.5 m gap is left so they stay reachable).
 */
const rooms = [
  room('hall', -14, -30, 28, 32, 6),
  room('vent.1', -36, -21, 12, 14, 4.5),
  room('vent.2', 24, -21, 12, 14, 4.5),
  room('vent.3', -14, -58, 12, 14, 4.5),
  room('vent.4', 2, -58, 12, 14, 4.5),
  room('miners', -62, -20, 14, 12, 3.8),
  corridor('c.vent.1', { x: -24, z: -14 }, { x: -14, z: -14 }),
  corridor('c.vent.2', { x: 14, z: -14 }, { x: 24, z: -14 }),
  corridor('c.vent.3', { x: -8, z: -30 }, { x: -8, z: -44 }),
  corridor('c.vent.4', { x: 8, z: -30 }, { x: 8, z: -44 }),
  corridor('c.miners', { x: -36, z: -14 }, { x: -48, z: -14 }),
];

export const SHAFT_MINE_DEF: InteriorDef = mineDef('shaft', {
  rooms,
  props: [
    { id: 'cart.1', rect: rect(-13.5, -5, -11.5, -2.5), height: 0.9 },
    { id: 'cart.2', rect: rect(11.5, -28, 13.5, -25), height: 0.9 },
    { id: 'cart.3', rect: rect(-13.5, -57.5, -11.5, -55), height: 0.9 },
    { id: 'rubble.hall.1', rect: rect(-13.5, -29.5, -11, -27), height: 1.1 },
    { id: 'rubble.hall.2', rect: rect(11, -5, 13.5, -2.5), height: 1.1 },
    { id: 'rubble.vent.1', rect: rect(-35.5, -20.5, -33, -18), height: 1.1 },
    { id: 'rubble.vent.2', rect: rect(33, -8, 35.5, -7.5), height: 0.8 },
    // The two heaps in the miners' tunnel leave z -14 .. -12.5 open (1.5 m), so the miners can be reached and led out.
    { id: 'rubble.tunnel.1', rect: rect(-44, -15.5, -42, -14), height: 1.4 },
    { id: 'rubble.miners.1', rect: rect(-50, -20, -48.4, -16.5), height: 1.3 },
    { id: 'rubble.miners.2', rect: rect(-50, -11, -48.4, -8), height: 1.3 },
  ],
  torches: [
    ...torchesAlong(rooms[0]),
    ...torchesAlong(rooms[1]),
    ...torchesAlong(rooms[2]),
    ...torchesAlong(rooms[3]),
    ...torchesAlong(rooms[4]),
    ...torchesAlong(rooms[5]),
  ],
  anchors: [
    { id: MINE_LANDINGS.shaft, x: 0, z: -1, yaw: 0 },
    { id: `${MINE_LANDINGS.shaft}.up`, x: -3, z: -1, yaw: 90 },
    { id: `${MINE_LANDINGS.shaft}.call`, x: 3, z: -1, yaw: 270 },
    // M17 chokes these four vent chambers.
    { id: 'oldsmoke.shaft.vent.1', x: -30, z: -14, yaw: 0 },
    { id: 'oldsmoke.shaft.vent.2', x: 30, z: -14, yaw: 0 },
    { id: 'oldsmoke.shaft.vent.3', x: -8, z: -51, yaw: 0 },
    { id: 'oldsmoke.shaft.vent.4', x: 8, z: -51, yaw: 0 },
    // The trapped miners, behind the rubble in the west side tunnel.
    { id: 'oldsmoke.shaft.miner.1', x: -56, z: -17, yaw: 90 },
    { id: 'oldsmoke.shaft.miner.2', x: -56, z: -11, yaw: 90 },
    // Crawler drop points: the floor point under each ceiling drop (the spawner uses y = room height). All 2 m or more from the walls.
    { id: 'oldsmoke.shaft.drop.1', x: -6, z: -8 },
    { id: 'oldsmoke.shaft.drop.2', x: 6, z: -8 },
    { id: 'oldsmoke.shaft.drop.3', x: 0, z: -16 },
    { id: 'oldsmoke.shaft.drop.4', x: -8, z: -24 },
    { id: 'oldsmoke.shaft.drop.5', x: 8, z: -24 },
    { id: 'oldsmoke.shaft.drop.6', x: -28, z: -10 },
    { id: 'oldsmoke.shaft.drop.7', x: -32, z: -18 },
    { id: 'oldsmoke.shaft.drop.8', x: 28, z: -18 },
    { id: 'oldsmoke.shaft.drop.9', x: 32, z: -10 },
    { id: 'oldsmoke.shaft.drop.10', x: -5, z: -48 },
    { id: 'oldsmoke.shaft.drop.11', x: 5, z: -48 },
    { id: 'oldsmoke.shaft.drop.12', x: 8, z: -55 },
    // Ground enemies: hall and corridors, 6 m or more from the landing.
    { id: 'oldsmoke.spawn.mines.1', x: -10, z: -20, yaw: 0 },
    { id: 'oldsmoke.spawn.mines.2', x: 10, z: -20, yaw: 0 },
    { id: 'oldsmoke.spawn.mines.3', x: -8, z: -38, yaw: 0 },
  ],
});

export const SHAFT_MINE_STRINGS_EN: Record<string, string> = {
  [`interior.exit.${MINE_IDS.shaft}`]: '{key} Ride up to the surface',
};
