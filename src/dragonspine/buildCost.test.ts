// Boot cost guard: the layout is built once per inputs object and the shipped plugin takes the cached build, so a game boot pays
// for at most one build and a re-setup pays nothing. The guard is a call count (no wall clock on the cached path, which was the
// flake on loaded runners, K9 #154) plus a loose 2,000 ms ceiling on the fastest of three cold builds. One build took about 300 ms with the summit; after the Act 4 world landed it takes about 700 to 800 ms in node on main, and the old 1,000 ms ceiling failed on loaded CI runners (Act 4 L4, #195).
// The builds are timed in CPU milliseconds (src/testing/cpuClock.ts), not wall time, so waiting for a core under the whole
// suite's load no longer counts against the ceiling; only the build's own work does.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultInputs } from './inputs';
import { buildCount, buildDragonspine, dragonspineBuild } from './layout';
import { registerDragonspineKinds } from './structureKinds';
import { cpuMs } from '../testing/cpuClock';

let release: () => void;
beforeAll(() => (release = registerDragonspineKinds()));
afterAll(() => release());

describe('the cost of building the Dragonspine layout', () => {
  it('builds each inputs object once: repeated calls and the shipped build add no build', () => {
    const inp = defaultInputs();
    const before = buildCount();
    const first = buildDragonspine(inp);
    expect(buildCount()).toBe(before + 1);
    for (let i = 0; i < 5; i++) expect(buildDragonspine(inp)).toBe(first);
    expect(buildCount()).toBe(before + 1);
    const shipped = dragonspineBuild();
    const afterShipped = buildCount();
    expect(afterShipped - before).toBeLessThanOrEqual(2);
    for (let i = 0; i < 5; i++) expect(dragonspineBuild()).toBe(shipped);
    expect(buildCount()).toBe(afterShipped);
    // A new inputs object is a new build (the memo is per object, not global).
    buildDragonspine(defaultInputs());
    expect(buildCount()).toBe(afterShipped + 1);
  });

  it('builds the real ground under a 2,000 CPU ms ceiling (the fastest of three cold builds, timed in CPU time so a loaded runner does not fail it)', () => {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const before = buildCount();
      const inp = defaultInputs();
      best = Math.min(best, cpuMs(() => buildDragonspine(inp)));
      expect(buildCount(), 'each timed build is a real (uncached) build').toBe(before + 1);
    }
    expect(best).toBeLessThan(2000);
  });
});
