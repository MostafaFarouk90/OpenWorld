// G4 Cinderlands (design 12.2 step 3, 12.4): the biome table. Phase 1 builds Ashfield; the other rows are data now so
// phase 2 adds looks and enemy tables, not rules.
import type { BiomeId } from './seed';

export interface BiomeDef {
  id: BiomeId;
  /** Enemy level offset (design 12.4). */
  offset: number;
  nameKey: string;
  /** Terrain character: ridge amplitude (m), hill amplitude (m), base height (m). */
  terrain: { ridges: number; hills: number; base: number };
  /** Encounter kinds and their threat cost (design 12.2 step 5). */
  enemies: ReadonlyArray<{ kind: string; cost: number }>;
  /** Music area whose track and stems the run reuses. */
  musicArea: string;
}

export const BIOMES: Readonly<Record<BiomeId, BiomeDef>> = {
  fenland: { id: 'fenland', offset: -1, nameKey: 'cinder.biome.fenland', terrain: { ridges: 20, hills: 10, base: 4 }, enemies: [], musicArea: 'greyfen' },
  ashfield: {
    id: 'ashfield',
    offset: 0,
    nameKey: 'cinder.biome.ashfield',
    terrain: { ridges: 70, hills: 22, base: 10 },
    enemies: [
      { kind: 'ash-wraith', cost: 2 },
      { kind: 'blighted-soldier', cost: 3 },
      { kind: 'ember-hound', cost: 2 },
    ],
    musicArea: 'waste',
  },
  glassland: { id: 'glassland', offset: 1, nameKey: 'cinder.biome.glassland', terrain: { ridges: 40, hills: 14, base: 8 }, enemies: [], musicArea: 'waste' },
  rimeridge: { id: 'rimeridge', offset: 2, nameKey: 'cinder.biome.rimeridge', terrain: { ridges: 160, hills: 30, base: 20 }, enemies: [], musicArea: 'dragonspine' },
  magmafield: { id: 'magmafield', offset: 3, nameKey: 'cinder.biome.magmafield', terrain: { ridges: 90, hills: 18, base: 12 }, enemies: [], musicArea: 'caldera' },
};
