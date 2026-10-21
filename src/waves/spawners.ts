import type { EnemyKind, SpawnerDef } from '../enemies/types';
import { WAVE_SETS } from './defs';
import type { LaneKey, WaveSetDef } from './types';

/** The spawner a wave's (lane, kind) group lives in. */
export function spawnerId(defId: string, wave: number, lane: LaneKey, kind: EnemyKind): string {
  return `waves.${defId}.w${wave}.l${lane}.${kind}`;
}

/** One manual, ephemeral, never-respawning, leash-free spawner per (wave, lane, kind) of a set; `count` is the sum of its entries. */
export function spawnersFor(def: WaveSetDef): SpawnerDef[] {
  const out: SpawnerDef[] = [];
  def.waves.forEach((wave, w) => {
    const counts = new Map<string, { lane: LaneKey; kind: EnemyKind; count: number }>();
    for (const s of wave.spawns) {
      const id = spawnerId(def.id, w, s.lane, s.kind);
      const row = counts.get(id) ?? { lane: s.lane, kind: s.kind, count: 0 };
      row.count += s.count;
      counts.set(id, row);
    }
    for (const [id, row] of counts) {
      out.push({
        id,
        tag: def.spawnTag,
        enemy: row.kind,
        count: row.count,
        anchor: def.lanes[row.lane],
        band: def.band,
        activation: 'manual',
        ephemeral: true,
        respawn: 'never',
        leash: false,
      });
    }
  });
  return out;
}

/** Spread into the list in `src/enemies/enemies.plugin.ts` (the spawner registry is only built there). */
export const WAVE_SPAWNERS: readonly SpawnerDef[] = Object.values(WAVE_SETS).flatMap(spawnersFor);
