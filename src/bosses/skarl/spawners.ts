import { skarlDrakeSpawner } from '../../enemies/wyrm/drake/def';
import type { SpawnerDef } from '../../enemies/types';
import { ARENA, DRAKE_SPAWNER } from './tuning';

/** K8's drake group for D06 on K4's `.drake` anchor (manual, never respawns, not saved: each fight spawns it again). */
export const SKARL_SPAWNERS: readonly SpawnerDef[] = [skarlDrakeSpawner(DRAKE_SPAWNER, ARENA.drake, { ephemeral: true })];
