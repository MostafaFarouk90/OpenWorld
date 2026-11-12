// G4 Cinderlands: a fixed pool of manual, ephemeral, never-respawning spawners, defined once and filled per POI with
// `spawnGroup(id, { at, level, healthScale, damageScale, speedScale })`. Nothing is saved (a run never is).
import type { SpawnerDef } from '../enemies/types';

export const CINDER_ORIGIN_ANCHOR = 'cinder.site.origin';
export const CINDER_SPAWN_TAG = 'cinder';
export const CINDER_WARDEN_TAG = 'cinder-warden';

export type CinderKind = 'ash-wraith' | 'blighted-soldier' | 'ember-hound' | 'blightbloom';
export const CINDER_KINDS: readonly CinderKind[] = ['ash-wraith', 'blighted-soldier', 'ember-hound', 'blightbloom'];
/** Groups per kind live at once (POIs keep at most about 40 enemies awake, design 12.7). */
export const POOL_PER_KIND = 10;
export const GROUP_SIZE = 4;

export const poolId = (kind: CinderKind, n: number): string => `cinder.enc.${kind}.${n}`;
export const WARDEN_SPAWNER = 'cinder.enc.warden';

function def(id: string, enemy: CinderKind, count: number, tag: string): SpawnerDef {
  return {
    id,
    tag,
    enemy,
    count,
    anchor: CINDER_ORIGIN_ANCHOR,
    band: { min: 1, max: 1 },
    activation: 'manual',
    ephemeral: true,
    respawn: 'never',
    leash: false,
  };
}

export const CINDER_SPAWNERS: readonly SpawnerDef[] = [
  ...CINDER_KINDS.flatMap((k) => Array.from({ length: POOL_PER_KIND }, (_, n) => def(poolId(k, n), k, GROUP_SIZE, CINDER_SPAWN_TAG))),
  // The Rift Warden (stand-in, R5): a champion blighted soldier.
  def(WARDEN_SPAWNER, 'blighted-soldier', 1, CINDER_WARDEN_TAG),
];
