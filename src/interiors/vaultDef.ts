import type { InteriorDef, LocalRect } from './types';

export const VAULT_ID = 'chapel-vault';
export const VAULT_GATE = 'vault.arena.gate';

const ARENA_CENTRE = { x: 0, z: -43 };
const PILLAR_HALF = 0.8;
const PILLAR_CENTRES = [
  { x: -6, z: -37 },
  { x: 6, z: -37 },
  { x: -6, z: -49 },
  { x: 6, z: -49 },
];
/** Distance from a pillar's face (its corner on the diagonal toward the centre) to its teleport point. */
export const PILLAR_STAND_OFF = 1.5;

const pillarRect = (c: { x: number; z: number }): LocalRect => ({
  x0: c.x - PILLAR_HALF,
  z0: c.z - PILLAR_HALF,
  x1: c.x + PILLAR_HALF,
  z1: c.z + PILLAR_HALF,
});

/** 1.5 m out from the corner that faces the arena centre (design 10 row 17: the Prior teleports between pillars). */
function pillarPoint(c: { x: number; z: number }): { x: number; z: number } {
  const dx = ARENA_CENTRE.x - c.x;
  const dz = ARENA_CENTRE.z - c.z;
  const len = Math.hypot(dx, dz);
  const out = PILLAR_HALF * Math.SQRT2 + PILLAR_STAND_OFF;
  return { x: c.x + (dx / len) * out, z: c.z + (dz / len) * out };
}

/**
 * The chapel vault for D01 (design 5.1, 10 row 17), greybox. The corridor runs along -Z from the stair foot to the antechamber,
 * a side ossuary opens off it, and the arena gate leads into a 24 x 24 m arena with four pillars.
 */
export const VAULT_DEF: InteriorDef = {
  id: VAULT_ID,
  // The stair foot sits over the chapel; the vault runs along -Z over the chapel hill.
  site: { x: 52, z: 66 },
  rooms: [
    { id: 'landing', x0: -3, z0: -3, x1: 3, z1: 3, height: 3.5 },
    { id: 'corridor', x0: -1.5, z0: -23, x1: 1.5, z1: -3, height: 3.5 },
    { id: 'ossuary-door', x0: 1.5, z0: -15.5, x1: 2.5, z1: -12.5, height: 2.6 },
    { id: 'ossuary', x0: 2.5, z0: -18, x1: 11.5, z1: -10, height: 3 },
    { id: 'antechamber', x0: -4, z0: -29, x1: 4, z1: -23, height: 4 },
    { id: 'gate', x0: -1.5, z0: -31, x1: 1.5, z1: -29, height: 4 },
    { id: 'arena', x0: -12, z0: -55, x1: 12, z1: -31, height: 7 },
  ],
  pillars: PILLAR_CENTRES.map(pillarRect),
  blockers: [{ id: VAULT_GATE, rect: { x0: -1.5, z0: -31, x1: 1.5, z1: -29 }, height: 4 }],
  torches: [
    { x: 2.9, y: 2.2, z: 0 },
    { x: -1.4, y: 2.2, z: -6 },
    { x: 1.4, y: 2.2, z: -9 },
    { x: -1.4, y: 2.2, z: -12 },
    { x: -1.4, y: 2.2, z: -18 },
    { x: 1.4, y: 2.2, z: -20 },
    { x: 11.4, y: 2, z: -14 },
    { x: -3.9, y: 2.6, z: -26 },
    { x: 3.9, y: 2.6, z: -26 },
    { x: -11.9, y: 3, z: -37 },
    { x: 11.9, y: 3, z: -37 },
    { x: -11.9, y: 3, z: -49 },
    { x: 11.9, y: 3, z: -49 },
    { x: -6, y: 3, z: -54.9 },
    { x: 6, y: 3, z: -54.9 },
  ],
  anchors: [
    { id: 'vault.entry', x: 0, z: -1, yaw: 0 },
    { id: 'vault.exit', x: 0, z: 2, yaw: 180 },
    { id: 'vault.arena.door', x: 0, z: -28, yaw: 0 },
    { id: 'vault.arena.centre', x: ARENA_CENTRE.x, z: ARENA_CENTRE.z, yaw: 180 },
    ...PILLAR_CENTRES.map((c, i) => ({ id: `vault.pillar.${i + 1}`, ...pillarPoint(c), facing: ARENA_CENTRE })),
    { id: 'vault.summon.1', x: -9, z: -34, facing: ARENA_CENTRE },
    { id: 'vault.summon.2', x: 9, z: -34, facing: ARENA_CENTRE },
    { id: 'vault.summon.3', x: -9, z: -52, facing: ARENA_CENTRE },
    { id: 'vault.summon.4', x: 9, z: -52, facing: ARENA_CENTRE },
    // Thread 5's vault group: wraiths in the corridor and ossuary, the Blightbloom with its ash piles in the ossuary.
    { id: 'vault.spawn.wraith-1', x: 0, z: -8, yaw: 180 },
    { id: 'vault.spawn.wraith-2', x: 0, z: -19, yaw: 180 },
    { id: 'vault.spawn.wraith-3', x: 6.5, z: -14, yaw: 90 },
    { id: 'vault.bloom', x: 9.5, z: -14, yaw: 90 },
    { id: 'vault.pile.1', x: 4.5, z: -11.5, yaw: 90 },
    { id: 'vault.pile.2', x: 4.5, z: -16.5, yaw: 90 },
    { id: 'vault.pile.3', x: 10, z: -17, yaw: 90 },
    // Act 1 density pass, batch 2 (quests thread; additive): Prior Aldhelm's four prayer tablets, the antechamber's
    // three prayer braziers (lit, they open the arena gate) and the four wraiths the walls give up when they are lit.
    { id: 'd01.tablet-1', x: -1, z: -9, yaw: 270 },
    { id: 'd01.tablet-2', x: -1, z: -16, yaw: 270 },
    { id: 'd01.tablet-3', x: 10.9, z: -11, yaw: 90 },
    { id: 'd01.tablet-4', x: 3.2, z: -28, yaw: 90 },
    // where the Prior's censer falls in the arena
    { id: 'd01.censer', x: 0, z: -46, yaw: 180 },
    { id: 'd01.brazier-1', x: -3.2, z: -24, yaw: 0 },
    { id: 'd01.brazier-2', x: 3.2, z: -24, yaw: 0 },
    { id: 'd01.brazier-3', x: -3.2, z: -28, yaw: 0 },
    { id: 'd01.spawn.wall-1', x: -2.4, z: -26.5, facing: { x: 0, z: -26 } },
    { id: 'd01.spawn.wall-2', x: 2.4, z: -26.5, facing: { x: 0, z: -26 } },
    { id: 'd01.spawn.wall-3', x: 2.4, z: -28, facing: { x: 0, z: -26 } },
    { id: 'd01.spawn.wall-4', x: 0, z: -22, facing: { x: 0, z: -26 } },
  ],
  triggers: [{ id: 'trg.vault.arena', center: { x: 0, y: 2, z: -33 }, half: { x: 3, y: 2, z: 1.5 } }],
  doors: [{ doorId: 'vault', outside: 'vault.door', inside: 'vault.entry', exit: 'vault.exit' }],
  environment: {
    fogColor: 0x0b0a09,
    fogNear: 6,
    fogFar: 38,
    skyColor: 0x8a7560,
    groundColor: 0x1c1712,
    ambientIntensity: 0.55,
    lightColor: 0xffb46b,
    lightIntensity: 14,
    lightDistance: 14,
  },
};
