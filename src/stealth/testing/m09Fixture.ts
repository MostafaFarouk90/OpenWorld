import type { P3 } from '../perceptionPort';
import type { ScriptStep, SolidBox } from './patrolSim';

/**
 * A stand-in for thread 3a's counting-house def (plans/slice-2-stealth-chase.md section 12) until it is on main: a
 * 30 x 20 m hall (local frame, floor y 0), a ledger-stack row splitting a north and a south aisle, and Vey's office
 * behind a partition in the south-east corner. The real def replaces these numbers before merging.
 */
export const M09_SOLIDS: readonly SolidBox[] = [
  { minX: 8, maxX: 22, minZ: 9, maxZ: 11, top: 2.2 }, // ledger stacks
  { minX: 25.5, maxX: 26, minZ: 14, maxZ: 20, top: 3 }, // office partition (door gap at z 12 to 14)
  { minX: 25.5, maxX: 30, minZ: 11.5, maxZ: 12, top: 3 }, // office north wall
];

/** Patrol loops (`patrol.m09.hall.*`, `patrol.m09.stacks.*`): the hall guard in the north aisle, the stacks guard in the south. */
export const M09_PATROLS: Record<'hall' | 'stacks', readonly P3[]> = {
  hall: [
    { x: 24, y: 0, z: 4 },
    { x: 6, y: 0, z: 4 },
  ],
  stacks: [
    { x: 6, y: 0, z: 16 },
    { x: 24, y: 0, z: 16 },
  ],
};

export const M09_ENTRY: P3 = { x: 2, y: 0, z: 18.5 };

/**
 * The scripted sneak: wait at the entry, follow the stacks guard east, hide under the ledger table (`hide.m09.2`)
 * while he turns and walks back, then slip east through the office door gap, copy the invoices, out the side door.
 */
export const M09_SCRIPT: readonly ScriptStep[] = [
  { wait: 3, sneak: true },
  { to: { x: 12, y: 0, z: 18.8 }, sneak: true },
  { wait: 14, sneak: true, hidden: true },
  { to: { x: 24.5, y: 0, z: 18.8 }, sneak: true },
  { to: { x: 24.5, y: 0, z: 13 }, sneak: true },
  { to: { x: 28, y: 0, z: 13 }, sneak: true },
  { to: { x: 28, y: 0, z: 18 }, sneak: true },
  { wait: 6, sneak: true }, // copying the three invoices
  { to: { x: 29.5, y: 0, z: 19 }, sneak: true },
];
