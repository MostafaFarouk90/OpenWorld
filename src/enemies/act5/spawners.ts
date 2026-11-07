// The Caldera's ambient spawner groups (Act 5 N5, plans/act5-N5.md section 6). Each names its `caldera-*` area (so the cap and
// the kill XP factor apply), none refills (the Caldera is crossed, not farmed), and each waits on a flag it only reads.
import type { SpawnerDef } from '../types';
import { CALDERA_FAUNA_GROUPS, CALDERA_GATE_FLAGS, calderaFaunaAnchorId, calderaSiteOf, type CalderaFaunaGroup } from './calderaFauna.layout';

function spawnerFor(g: CalderaFaunaGroup): SpawnerDef {
  const anchors = Array.from({ length: g.count }, (_, i) => calderaFaunaAnchorId(g.id, i + 1));
  const id = `caldera.${g.id}`;
  return {
    id,
    tag: id,
    enemy: g.enemy,
    count: g.count,
    anchor: anchors[0]!,
    memberAnchors: anchors,
    band: 'caldera',
    area: calderaSiteOf(g.site).area,
    ...(g.firstArrival ? { firstArrival: true } : {}),
    ...(g.role ? { role: g.role } : {}),
    ...(g.skin ? { skin: g.skin } : {}),
    ...(g.line ? { line: g.line } : {}),
    activation: { flag: CALDERA_GATE_FLAGS[g.gate] },
    respawn: 'never',
    leash: true,
  };
}

export const CALDERA_AMBIENT_SPAWNERS: readonly SpawnerDef[] = CALDERA_FAUNA_GROUPS.map(spawnerFor);
