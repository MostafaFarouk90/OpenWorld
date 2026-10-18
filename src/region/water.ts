// Where the Brightwater river and the Hollin Brook run. The terrain has no water, so each is a draped ribbon along a
// course chosen over low ground (no carving: the terrain shaping refuses a carve inside the protected box).
import type { Pt } from './ribbon';

/** East-flowing, from the valley head at x -350 to its mouth at the reed island (55, -300). The ground falls the whole way. */
export const RIVER_COURSE: readonly Pt[] = [-350, -300, -250, -200, -150, -100, -50, 0, 50].map((x) => [x, -300] as Pt);
export const RIVER_WIDTH = 14;

/** North-flowing past the ford bridge at (-420, -150); the ground falls from z -230 to z -80. */
export const BROOK_COURSE: readonly Pt[] = [-230, -200, -170, -140, -110, -80].map((z) => [-420, z] as Pt);
export const BROOK_WIDTH = 5;

/** The centre line may rise by at most this between stations before it stops reading as downhill (m). */
export const FALL_TOLERANCE = 1;
