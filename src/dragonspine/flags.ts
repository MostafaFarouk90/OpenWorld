// The flags the Dragonspine places read (none written here). Quest threads write them: K13 owns `story.r16.*`.
/** Written by K13 when R16 is accepted; the collapsed cave's door opens on it. */
export const R16_STARTED_FLAG = 'story.r16.started';
/** Written by K13 when the rockfall in the cave passage is cleared; the blocker opens on it (and closes again on a load without it). */
export const R16_ROCKFALL_CLEARED_FLAG = 'story.r16.rockfallCleared';
/** The region is held until Phase F; tests (and the jump) set it. */
export const DRAGONSPINE_OPEN_FLAG = 'story.phase.dragonspineOpen';
