/** R05's flock (invented herding, design 15 item 77 small slice; numbers logged in design/changes-applied.md). */
export const HERD = {
  /** The most sheep one herd holds (A3 places 8 flock anchors). */
  maxSize: 8,
  /** Followers keep this far from the player and from each other. */
  followDistance: 3,
  separation: 1.0,
  followSpeed: 2.6,
  /** A grazing sheep drifts within this of its anchor. */
  grazeRadius: 2,
  grazeSpeed: 0.8,
  /** A sheep this close to the player rejoins the herd while it follows. */
  rejoinRadius: 5,
  /** A sheep that strays further than this from the player stops following until the player comes back. */
  loseDistance: 45,
  /** Scatter: speed and seconds of the run, away from the fog's centre. */
  scatterSpeed: 3.2,
  scatterSeconds: 3,
  /** Default radius of a fog hollow when the caller gives none. */
  fogRadius: 14,
} as const;
