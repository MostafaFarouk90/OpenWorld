// Act 5 N2: the Caldera interiors' master sites (plans/act5-N2.md). Plain data, no THREE: the quest threads, the boss threads
// and the exterior layout import these; nothing else hard-codes an interior position, door or flag.
import type { LocalRect } from '../../interiors/types';

/** Interior ids. */
export const COOLING_HALL_ID = 'cooling-hall';
export const STOKERS_TUNNEL_ID = 'stokers-tunnel';
export const FOUNDRY_DESCENT_ID = 'foundry-descent';
export const HAMMER_HALL_ID = 'hammer-hall';

/**
 * The float pad: the north crest, inside the Caldera box (which ends at z 9500), ground 314 to 330 m. The bowl inside the rim is
 * rough and N1 reshapes it, so no interior floats over its own door (the 40 m ground-range rule). Nothing is reachable up there.
 */
export const CALDERA_INTERIOR_PAD = { x0: 9700, x1: 12300, z0: 9250, z1: 9450 } as const;
export const CALDERA_INTERIOR_SITES = {
  [COOLING_HALL_ID]: { x: 10000, z: 9255 },
  [STOKERS_TUNNEL_ID]: { x: 10200, z: 9255 },
  [FOUNDRY_DESCENT_ID]: { x: 10500, z: 9255 },
  [HAMMER_HALL_ID]: { x: 10800, z: 9255 },
} as const;

/** Outside door anchors (N1 defines them, plan 3.4; the exit lands 1.6 m in front, facing away from the way in). */
export const DOOR_COOLING_HALL = 'caldera.door.cooling-hall';
export const DOOR_TUNNEL = 'caldera.door.tunnel';
export const DOOR_FOUNDRY = 'caldera.door.foundry';

/** Door ids. The Hammer Hall's door and the Foundry's foot door are link-only (no outside prompt). */
export const COOLING_HALL_DOOR_ID = 'cooling-hall';
export const STOKERS_TUNNEL_DOOR_ID = 'stokers-tunnel';
export const FOUNDRY_DOOR_ID = 'foundry-descent';
export const FOUNDRY_FOOT_DOOR_ID = 'foundry-descent-foot';
export const HAMMER_HALL_DOOR_ID = 'hammer-hall';

/** Anchor and trigger prefixes (owned sub-prefixes of the reserved `caldera.` and `trg.caldera.`). */
export const INT_ANCHOR = 'caldera.int';
export const INT_TRIGGER = 'trg.caldera.int';

/** Flags the quest threads write and this thread reads (door locks, gates). */
export const CALDERA_INTERIOR_FLAGS = {
  coolingHallOpen: 'story.m49.complete',
  channel1: 'story.m50.channel.1',
  channel2: 'story.m50.channel.2',
  m50Complete: 'story.m50.complete',
  tunnelStarted: 'story.r27.started',
  tunnelFarOpen: 'story.r27.farOpen',
  foundryStarted: 'story.d09.started',
  slagRouted: 'story.d09.slag',
  veyOutcome: 'boss.vey.outcome',
  foundryComplete: 'story.d09.complete',
  m54Complete: 'story.m54.complete',
} as const;

/** Blocker ids. */
export const BLOCKERS = {
  coolingGate2: 'cooling.gate.2',
  coolingGate3: 'cooling.gate.3',
  coolingForge: 'cooling.forge.gate',
  tunnelSeal: 'tunnel.far.seal',
  foundryLift: 'foundry.lift.gate',
  foundryArenaGate: 'foundry.arena.gate',
  foundryArenaExit: 'foundry.arena.exit',
  hammerHallGate: 'hammer.hall.gate',
  hammerFloor: 'hammer.floor',
} as const;

const rect = (x0: number, z0: number, x1: number, z1: number): LocalRect => ({ x0, z0, x1, z1 });

/** The three cooling channel chambers (local z ranges). */
export const COOLING_CHANNELS = [
  { n: 1, z0: 10, z1: 30 },
  { n: 2, z0: 34, z1: 54 },
  { n: 3, z0: 58, z1: 78 },
] as const;
/** Vey's ring arena floor (local, Foundry Descent). */
export const FOUNDRY_ARENA = rect(-15, 134, 15, 164);
/** The slag runnels on floor 1 (shallow, walkable); N11 may put a hot hazard on them. */
export const FOUNDRY_RUNNELS: readonly LocalRect[] = [rect(-17, 12, -15, 34), rect(15, 12, 17, 34), rect(-15, 20, 15, 22), rect(-15, 30, 15, 32)];
/** The Hammer Hall's floor (local) and its breakable pit. */
export const HAMMER_HALL_FLOOR = rect(-22, 34, 22, 78);
export const HAMMER_PIT = rect(-9, 47, 9, 65);
/** The four mural walls of the Approach (west and east walls, two each). */
export const HAMMER_MURALS = [
  { n: 1, wall: 'west', z0: 6, z1: 10 },
  { n: 2, wall: 'east', z0: 6, z1: 10 },
  { n: 3, wall: 'west', z0: 18, z1: 22 },
  { n: 4, wall: 'east', z0: 18, z1: 22 },
] as const;
/** N1 PR 2 defines this exterior anchor (ground + 0.05) on the Anvil island; Ulthred's floor drop teleports to it. */
export const HAMMER_HALL_DROP_ANCHOR = 'caldera.anvil.arena.drop';
export const rectOf = rect;
