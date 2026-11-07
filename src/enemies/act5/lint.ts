// Lints on Warhost spawner tables (N5): every line (the spawner `tag`) needs at least two shield-role members so it can break.
import type { SpawnerDef } from '../types';

export interface WarhostLineLintRow {
  lineId: string;
  shields: number;
}

/** Lines in `defs` with fewer than two shield members (empty when clean). A guard with the shield role counts as a shield. */
export function warhostLineLint(defs: readonly SpawnerDef[]): WarhostLineLintRow[] {
  const lines = new Map<string, number>();
  for (const d of defs) {
    if (d.enemy !== 'warhost-soldier' && d.enemy !== 'warhost-guard') continue;
    const id = d.tag ?? d.id;
    lines.set(id, (lines.get(id) ?? 0) + (d.role === 'shield' ? d.count : 0));
  }
  return [...lines].filter(([, n]) => n < 2).map(([lineId, shields]) => ({ lineId, shields }));
}
