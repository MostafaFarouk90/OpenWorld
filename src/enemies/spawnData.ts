// v0.9 (contracts/CHANGES-v0.9.md items 1 and 11): what a spawner leaves on its member's actor, under
// `actor.data[SPAWN_DATA_KEY]`: the area it rolled in and its role. Kept apart from Enemy.ts so light readers (the kill XP
// factor in progression.plugin.ts, N5's warhost) need not import the enemy module.
import { AREA_BANDS, isAreaId } from '../region/areas';

export const SPAWN_DATA_KEY = 'spawn';

export interface SpawnData {
  area?: string;
  role?: string;
  line?: string;
}

/** The spawn data on an actor's `data`, or undefined. */
export function spawnDataOf(data: Readonly<Record<string, unknown>> | undefined): SpawnData | undefined {
  const v = data?.[SPAWN_DATA_KEY];
  return v && typeof v === 'object' ? (v as SpawnData) : undefined;
}

/**
 * The region whose kill XP factor this member pays: its area's `killXpRegion` (every `caldera-*` area pays the
 * Caldera's, on the rim stairs too), else null (the caller uses the region at the member's position).
 */
export function killXpRegionOf(data: Readonly<Record<string, unknown>> | undefined): string | null {
  const area = spawnDataOf(data)?.area;
  return isAreaId(area) ? (AREA_BANDS[area].killXpRegion ?? null) : null;
}
