// The Greyfen's water on K7's real registry (src/traversal/water/WaterVolumes.ts): every volume and route registers, and
// every route passes K7's lint (40 m pockets, stands present and dry) in each D05 sluice state.
import { describe, expect, it } from 'vitest';
import { WaterVolumes } from '../traversal/water/WaterVolumes';
import { heightAt } from '../terrain/heightfield';
import { SLUICE_FLAGS } from './deepsInterior';
import { greyfenWater } from './water';

const registry = (set: ReadonlySet<string>) => new WaterVolumes({ groundAt: (x, z) => heightAt(x, z), flags: { getFlag: (k: string) => set.has(k) } });

describe('Greyfen water on K7\'s registry', () => {
  const [S1, S2] = SLUICE_FLAGS;
  for (const flags of [[], [S1], [S1, S2]]) {
    it(`registers every volume and route with ${flags.length} sluice(s) open`, () => {
      const w = registry(new Set(flags));
      const { volumes, routes } = greyfenWater();
      for (const v of volumes) expect(() => w.register(v), v.id).not.toThrow();
      for (const r of routes) expect(w.lintRoute(r), r.id).toEqual([]);
      for (const r of routes) expect(() => w.registerRoute(r), r.id).not.toThrow();
    });
  }
});
