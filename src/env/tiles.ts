// The tiles the environment pass has built, by name. Empty until a tile's placement file is added (B1 is the pilot).
import type { PlacementRow } from './PlacementField';

export const TILES: Record<string, readonly PlacementRow[]> = {};
export type { PlacementRow };
