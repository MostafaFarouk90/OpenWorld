/** Layout and numbers for the Weeping Bellows (design 7.2). Offsets are metres from A4's cavern centre anchor. */
export const BELLOWS = {
  /** Same string as A15's `BELLOWS_PUZZLE_ID`. */
  puzzleId: 'weeping-bellows',
  shrineId: 'weeping-bellows',
  centerAnchor: 'mines.weeping-bellows.center',
  /** The `?bellows=1` stand-in centre (dev only). */
  devCenterAnchor: 'mines.weeping-bellows.dev-center',
  /** The waystone anchor is A4's (the Deepgate Shaft head); the lock in WAYSTONE_LOCKS keeps it dark until solved. */
  waystoneId: 'weeping-bellows',
  solvedFlag: 'world.bellows.solved',
  shortcutFlag: 'world.bellows.shortcutOpen',
  plaqueFlag: 'world.bellows.plaqueRead',
  /** Valve `i` must show bellows `plaque[i]` (0..3). */
  plaque: [2, 0, 3, 1, 3, 0],
  /** Turns each valve starts short of its plaque position (9 turns in all; a 45 s clock leaves time to walk the ring). */
  startShort: [2, 1, 2, 1, 2, 1],
  positions: 4,
  /** Braziers by valve index in the order the Surge must light them. */
  order: [0, 2, 4, 1, 3, 5],
  valvePrefix: 'bellows',
  ringRadius: 7,
  valveRadius: 9.5,
  bellowsRadius: 3.5,
  bellowsHeight: 9,
  plaqueOffset: { x: 0, z: -13 },
  interactRadius: 2,
  /** A Surge lights the nearest brazier within this many metres of the player. */
  surgeRange: 3.2,
  surgeSpellId: 'heartshard-surge',
} as const;

export const initialRouting = (): number[] => BELLOWS.plaque.map((p, i) => (p - BELLOWS.startShort[i] + BELLOWS.positions) % BELLOWS.positions);

export const BLESSING = {
  buffId: 'shrine.bellows-blessing',
  nameKey: 'shrine.bellowsBlessing',
  seconds: 30 * 60,
  /** Damage multiplier for fire (design 7.2: +15% fire resistance). */
  fireMultiplier: 0.85,
  saveKey: 'shrine.bellowsBlessing',
  /** Buffs band 0..99 (contracts/actors-and-damage.md section 4). */
  modifierOrder: 40,
} as const;
