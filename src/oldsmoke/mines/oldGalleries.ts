import type { InteriorDef } from '../../interiors/types';
import { corridor, MINE_IDS, MINE_LANDINGS, mineDef, rect, room, torchesAlong } from './kit';

/**
 * The Old Galleries (greybox), R08's mine. Local metres from the lift landing, yaw 0 faces -Z. The main route runs about 80 m
 * north from the lift hall through a long corridor to the bell junction, then on to the collapsed roof; the junction also opens west
 * on the rail run (the derailed cart) and east on the pump chamber. Six relic nooks hang off the galleries, each a short dead end
 * (three are partly shut by a prop that leaves a 1.5 m gap).
 */
const rooms = [
  room('lift', -8, -12, 16, 14, 4),
  corridor('a', { x: 0, z: -12 }, { x: 0, z: -34 }, 3),
  room('junction', -7, -46, 14, 12, 4),
  corridor('west', { x: -7, z: -40 }, { x: -30, z: -40 }, 3),
  room('railrun', -60, -43, 30, 6, 3.6),
  corridor('east', { x: 7, z: -40 }, { x: 30, z: -40 }, 3),
  room('pump', 30, -50, 20, 20, 4.5),
  corridor('north', { x: 0, z: -46 }, { x: 0, z: -64 }, 3),
  room('collapse', -8, -78, 16, 14, 4),
  // Relic nooks, each off a short stub.
  corridor('stub.1', { x: -1.5, z: -22 }, { x: -8, z: -22 }),
  room('nook.1', -13, -25, 5, 6, 3.5),
  corridor('stub.2', { x: 1.5, z: -28 }, { x: 8, z: -28 }),
  room('nook.2', 8, -31, 5, 6, 3.5),
  corridor('stub.3', { x: -55, z: -43 }, { x: -55, z: -48 }),
  room('nook.3', -58, -54, 6, 6, 3.5),
  corridor('stub.4', { x: -18, z: -40 }, { x: -18, z: -32 }),
  room('nook.4', -21, -32, 6, 5, 3.5),
  corridor('stub.5', { x: 44, z: -50 }, { x: 44, z: -55 }),
  room('nook.5', 41, -61, 6, 6, 3.5),
  corridor('stub.6', { x: 8, z: -67 }, { x: 14, z: -67 }),
  room('nook.6', 14, -70, 6, 6, 3.5),
];
const byId = (id: string) => rooms.find((r) => r.id === id)!;

export const OLD_GALLERIES_DEF: InteriorDef = mineDef('old', {
  rooms,
  props: [
    // Lift hall clutter.
    { id: 'cart.lift', rect: rect(5.5, -11.5, 7.5, -9), height: 0.9 },
    { id: 'rubble.lift', rect: rect(-7.5, -11.5, -5, -9), height: 1.1 },
    // The derailed cart on the rail run and a second, rusted one further west.
    { id: 'cart.derailed', rect: rect(-46.5, -42.5, -43.5, -40.5), height: 1.0 },
    { id: 'cart.rusted', rect: rect(-59.5, -42.5, -57.5, -40.5), height: 0.9 },
    // The pump: a squat machine in the middle of its chamber, with crates beside it.
    { id: 'pump.body', rect: rect(37, -45, 41, -41), height: 1.4 },
    { id: 'pump.crate', rect: rect(46, -49.5, 49.5, -47), height: 0.9 },
    // The roof fall in front of the north end of the collapse room.
    { id: 'collapse.heap', rect: rect(-4, -73, 4, -70), height: 1.5 },
    { id: 'collapse.rubble.1', rect: rect(-7.5, -77.5, -5, -75), height: 1.2 },
    // Props that part-shut a nook stub, each leaving 1.5 m open.
    { id: 'rubble.stub.2', rect: rect(4, -29.5, 5.5, -28), height: 1.0 },
    { id: 'rubble.stub.4', rect: rect(-19.5, -37, -18, -35.5), height: 1.0 },
    { id: 'rubble.stub.5', rect: rect(42.5, -53, 44, -51.5), height: 1.0 },
    // Nook dressing.
    { id: 'rubble.nook.3', rect: rect(-57.5, -53.5, -56, -52), height: 0.9 },
    { id: 'cart.nook.6', rect: rect(18.5, -69.5, 19.5, -67.5), height: 0.8 },
  ],
  torches: ['lift', 'junction', 'railrun', 'pump', 'collapse'].flatMap((id) => torchesAlong(byId(id))),
  anchors: [
    { id: MINE_LANDINGS.old, x: 0, z: -1, yaw: 0 },
    { id: `${MINE_LANDINGS.old}.up`, x: -3, z: -1, yaw: 90 },
    { id: `${MINE_LANDINGS.old}.call`, x: 3, z: -1, yaw: 270 },
    // R08's four tasks, each in its own spot.
    { id: 'oldsmoke.old.task.pump', x: 39, z: -38.5, yaw: 0 },
    { id: 'oldsmoke.old.task.cart', x: -45, z: -38.5, yaw: 0 },
    { id: 'oldsmoke.old.task.prop', x: 0, z: -68.5, yaw: 0 },
    { id: 'oldsmoke.old.task.bell', x: 0, z: -40, yaw: 0 },
    // Dedicated posts for A13's R08 cast and Pickett's widow's letter (a free note anchor), clear of the landing and the exit.
    { id: 'npc-post.pickett.old', x: -3, z: -6, yaw: 0, facing: { x: 0, z: -1 } },
    { id: 'npc-post.shift-crew.old', x: 3, z: -6, yaw: 0, facing: { x: 0, z: -1 } },
    { id: 'oldsmoke.old.letter', x: 0, z: -9, yaw: 0 },
    // Relics, one per nook.
    { id: 'oldsmoke.old.relic.1', x: -11, z: -22, yaw: 90 },
    { id: 'oldsmoke.old.relic.2', x: 11, z: -28, yaw: 270 },
    { id: 'oldsmoke.old.relic.3', x: -55, z: -51, yaw: 0 },
    { id: 'oldsmoke.old.relic.4', x: -18, z: -29.5, yaw: 0 },
    { id: 'oldsmoke.old.relic.5', x: 44, z: -58, yaw: 0 },
    { id: 'oldsmoke.old.relic.6', x: 17, z: -67, yaw: 270 },
    // Ground enemies.
    { id: 'oldsmoke.old.spawn.1', x: 0, z: -22, yaw: 0 },
    { id: 'oldsmoke.old.spawn.2', x: -36, z: -40, yaw: 0 },
    { id: 'oldsmoke.old.spawn.3', x: 20, z: -40, yaw: 0 },
    // Crawler drop points: the floor point under each ceiling drop (the spawner uses y = room height). All 2 m or more from the walls.
    { id: 'oldsmoke.old.drop.1', x: -4, z: -8 },
    { id: 'oldsmoke.old.drop.2', x: 4, z: -6 },
    { id: 'oldsmoke.old.drop.3', x: -3.5, z: -43 },
    { id: 'oldsmoke.old.drop.4', x: 3.5, z: -37 },
    { id: 'oldsmoke.old.drop.5', x: -52, z: -40 },
    { id: 'oldsmoke.old.drop.6', x: -34, z: -40 },
    { id: 'oldsmoke.old.drop.7', x: 35, z: -45 },
    { id: 'oldsmoke.old.drop.8', x: -4.5, z: -67 },
  ],
});

export const OLD_GALLERIES_STRINGS_EN: Record<string, string> = {
  [`interior.exit.${MINE_IDS.old}`]: '{key} Ride up to the surface',
};
