// v0.9 items 1 and 18: the Caldera area lint. The Caldera's bands are named-only areas (the bowl is round and the rim
// stairs leave its box), so every spawner (and wave set) that spawns there must name its `caldera-*` area: by its band
// ('caldera'), by an Act 5 anchor (`caldera.`, the rim stairs included), or by its anchor's position in the Caldera box.
import { isCalderaArea } from '../region/areas';
import { engineBox } from '../region/regions';
import type { SpawnerDef } from './types';

export interface CalderaLintRow {
  id: string;
  why: string;
}

/** The spawners that spawn in the Caldera without naming a `caldera-*` area (empty when clean). */
export function calderaAreaLint(defs: readonly SpawnerDef[], anchorAt: (id: string) => { x: number; z: number } | undefined = () => undefined): CalderaLintRow[] {
  const box = engineBox('caldera');
  const out: CalderaLintRow[] = [];
  for (const d of defs) {
    const p = anchorAt(d.anchor);
    const inBox = !!p && p.x >= box.x0 && p.x < box.x1 && p.z >= box.z0 && p.z < box.z1;
    const caldera = d.band === 'caldera' || d.anchor.startsWith('caldera.') || inBox || (typeof d.area === 'string' && d.area.startsWith('caldera'));
    if (!caldera) continue;
    if (!isCalderaArea(d.area)) out.push({ id: d.id, why: d.area ? `names '${d.area}', not a caldera-* area` : 'names no caldera-* area' });
  }
  return out;
}
