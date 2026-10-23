// The tiles the environment pass has built, by name. Each tile's rows come from its designer's placement file (plans/env-pass/<tile>).
import b1 from './b1.placements.json';
import type { PlacementRow } from './PlacementField';

export const TILES: Record<string, readonly PlacementRow[]> = { b1: b1 as PlacementRow[] };
export type { PlacementRow };
