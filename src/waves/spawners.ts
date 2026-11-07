import type { EnemyKind, SpawnerDef, WarhostRole } from '../enemies/types';
import { WAVE_SETS } from './defs';
import type { LaneKey, WaveSetDef } from './types';

/**
 * The spawner a wave's (lane, kind) group lives in. N4: a role and a shield line, when the row names them, are part of
 * the id (`.r<role>`, `.n<line>`), so the shipped sets' ids do not change.
 */
export function spawnerId(defId: string, wave: number, lane: LaneKey, kind: EnemyKind, role?: WarhostRole, line?: string): string {
  return `waves.${defId}.w${wave}.l${lane}.${kind}${role ? `.r${role}` : ''}${line ? `.n${line}` : ''}`;
}

/** One manual, ephemeral, never-respawning, leash-free spawner per (wave, lane, kind) of a set; `count` is the sum of its entries. */
export function spawnersFor(def: WaveSetDef): SpawnerDef[] {
  const out: SpawnerDef[] = [];
  def.waves.forEach((wave, w) => {
    const counts = new Map<string, { lane: LaneKey; kind: EnemyKind; count: number; role?: WarhostRole; line?: string }>();
    for (const s of wave.spawns) {
      const id = spawnerId(def.id, w, s.lane, s.kind, s.role, s.line);
      const row = counts.get(id) ?? { lane: s.lane, kind: s.kind, count: 0, role: s.role, line: s.line };
      row.count += s.count;
      counts.set(id, row);
    }
    for (const [id, row] of counts) {
      // N4: `line` is N5's shield-line id (`SpawnerDef.line ?? tag`, ruled 2026-11-07); typed here until N5's field lands.
      const spawner: SpawnerDef & { line?: string } = {
        id,
        tag: def.spawnTag,
        enemy: row.kind,
        count: row.count,
        anchor: def.lanes[row.lane],
        band: def.band,
        ...(def.area ? { area: def.area } : {}),
        activation: 'manual',
        ephemeral: true,
        respawn: 'never',
        leash: false,
        ...(row.role ? { role: row.role } : {}),
        ...(row.line ? { line: row.line } : {}),
      };
      out.push(spawner);
    }
  });
  return out;
}

/** Spread into the list in `src/enemies/enemies.plugin.ts` (the spawner registry is only built there). */
export const WAVE_SPAWNERS: readonly SpawnerDef[] = Object.values(WAVE_SETS).flatMap(spawnersFor);
