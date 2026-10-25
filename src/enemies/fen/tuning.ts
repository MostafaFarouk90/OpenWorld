/**
 * The Greyfen creatures' numbers (K6b PR 1, plans/act3-K6b.md). The leech's stamina drain, its dive limit and the
 * shambler's slump window are taste calls (coordinator ruling E and D, 2026-10-24), tuned in the real-game run.
 */
export const FEN_TUNING = {
  leech: {
    /** Stamina a landed bite takes from the player (outcome `hit` only). */
    drainStamina: 25,
    /** The player this close (horizontal metres) brings a submerged leech up. */
    surfaceRadius: 5,
    /** It never leaves this ring around its anchor. */
    tether: 10,
    /** Metres the body sinks under the surface while submerged (clamped to the water depth, never into the ground). */
    sinkDepth: 0.7,
    /** One dive under water: seconds submerged, and how far it may slide before it comes up. */
    diveSeconds: 2.5,
    diveSlide: 4,
    /** It dives at a poise break or when health falls under this fraction. */
    diveBelowHealth: 0.4,
    /** Dives per fight, so every fight ends. */
    maxDives: 2,
    /** Seconds after a surface before a lost target lets it sink again. */
    resinkSeconds: 4,
  },
  shambler: {
    /** Fraction of max health regained per second while its feet are in peat (poise refills there too). */
    regenPerSecond: 0.02,
    /** Extra poise a fire hit takes (design 10 row 10). */
    firePoise: 50,
    /** It may chase this far past its patch's edge (so a chase can carry it out onto firm ground). */
    leashBeyondPatch: 8,
    /** Seconds it lies slumped after it is pulled out; Lay to rest is open only then (ruling D: one constant). */
    slumpSeconds: 5,
    /** The Drag out hold: seconds, radius, and how far it is dragged past the patch's edge. */
    dragHoldSeconds: 1,
    dragRadius: 2.5,
    dragClear: 1,
    dragSeconds: 0.4,
    /** The sink after Lay to rest: metres down over seconds, then it is gone. */
    sinkDepth: 1.5,
    sinkSeconds: 2,
  },
  /** The default wallow: a peat patch of this radius around a shambler's spawn when no registered patch holds it. */
  wallowRadius: 6,
  /** Two fire hits on one enemy within this many seconds count once (a bolt that also ignites). */
  fireDedupeSeconds: 0.5,
} as const;
