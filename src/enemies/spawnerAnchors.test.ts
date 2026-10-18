// Every spawner anchor (spawn point, members, patrol route) names an anchor the layout or an interior defines
// (thread 10 seam check: the churchyard members once used `pile.churchyard-N` while the layout has `.N`).
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { VAULT_DEF } from '../interiors/vaultDef';
import { BRIGHTWATER_SPAWNERS } from './brightwaterSpawners';
import { SLICE_SPAWNERS } from './spawnerDefs';

const known = new Set<string>([
  ...BRIGHTWATER_LAYOUT.anchors.map((a) => a.id),
  ...(VAULT_DEF.anchors ?? []).map((a) => a.id),
]);

describe('spawner anchors exist', () => {
  for (const def of [...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS]) {
    it(def.id, () => {
      const members = Array.isArray(def.memberAnchors) ? def.memberAnchors : []; // { tag } picks by tag at runtime
      const route = Array.isArray(def.patrol) ? def.patrol : [];
      const ids = [def.anchor, ...members, ...route].filter((x): x is string => typeof x === 'string');
      // Harrowmark anchors arrive with the city layout (Phase B, thread 17); every other anchor must exist now.
      expect(ids.filter((id) => !known.has(id) && !id.startsWith('harrowmark.'))).toEqual([]);
    });
  }
});
