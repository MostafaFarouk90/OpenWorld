// Boot cost guard: the layout is built once per inputs object and the shipped plugin takes the cached build, so a game boot pays
// for at most one build and a re-setup pays nothing. The guard is a call count (no wall clock on the cached path, which was the
// flake on loaded runners, K9 #154) plus a loose 1,000 ms ceiling on the fastest of three cold builds (about 300 ms in node with the summit).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultInputs } from './inputs';
import { buildCount, buildDragonspine, dragonspineBuild } from './layout';
import { registerDragonspineKinds } from './structureKinds';

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

  it('builds the real ground under a 1,000 ms ceiling (the fastest of three cold builds, so a load spike does not fail it)', () => {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const before = buildCount();
      const inp = defaultInputs();
      const t = performance.now();
      buildDragonspine(inp);
      best = Math.min(best, performance.now() - t);
      expect(buildCount(), 'each timed build is a real (uncached) build').toBe(before + 1);
    }
    expect(best).toBeLessThan(1000);
  });
});
