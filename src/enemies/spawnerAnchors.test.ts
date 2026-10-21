// Every spawner anchor (spawn point, members, patrol route) names an anchor the layout or an interior defines
// (thread 10 seam check: the churchyard members once used `pile.churchyard-N` while the layout has `.N`).
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { DEADROAD_LAYOUT } from '../region/deadroad.layout';
import { VAULT_DEF } from '../interiors/vaultDef';
import { BRIGHTWATER_SPAWNERS } from './brightwaterSpawners';
import { SLICE_SPAWNERS } from './spawnerDefs';
import { WYRM_SPAWNERS } from './wyrm/spawners';

const known = new Set<string>([
  ...BRIGHTWATER_LAYOUT.anchors.map((a) => a.id),
  ...DEADROAD_LAYOUT.anchors.map((a) => a.id),
  ...(VAULT_DEF.anchors ?? []).map((a) => a.id),
]);

describe('spawner anchors exist', () => {
  for (const def of [...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS, ...WYRM_SPAWNERS]) {
    it(def.id, () => {
      const members = Array.isArray(def.memberAnchors) ? def.memberAnchors : []; // { tag } picks by tag at runtime
      const route = Array.isArray(def.patrol) ? def.patrol : [];
      const ids = [def.anchor, ...members, ...route].filter((x): x is string => typeof x === 'string');
      // Harrowmark anchors arrive with the city layout (Phase B, thread 17); the Act 2 wyrm anchors with A2's points of
      // interest (`poi.a2.`) and A3's Cinderreach places (`cinderreach.`); `dev.` anchors are defined by the `?wyrms=1`
      // hook. Every other anchor must exist now.
      const pending = ['harrowmark.', 'poi.a2.', 'cinderreach.', 'dev.'];
      expect(ids.filter((id) => !known.has(id) && !pending.some((p) => id.startsWith(p)))).toEqual([]);
    });
  }
});
