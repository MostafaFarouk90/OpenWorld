/** Status effect numbers (contracts/actors-and-damage.md section 10). */
export const STATUS = {
  /** Seconds between ticks of a bleed or ignite. */
  tickSeconds: 1,
  /** Entries per actor; a new id past this is refused. */
  maxEntriesPerActor: 16,
  /** The largest slow fraction the contract allows. */
  maxSlow: 0.9,
  /** Slack for float drift when counting down in 1/60 s steps. */
  epsilon: 1e-6,
} as const;
