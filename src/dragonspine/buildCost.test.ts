// Boot cost guard: the layout is built once per inputs object and the shipped plugin takes the cached build, so a game boot
// pays for at most one build (about 100 ms in node on the real ground) and a re-setup pays nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultInputs } from './inputs';
import { buildDragonspine, dragonspineBuild } from './layout';
import { registerDragonspineKinds } from './structureKinds';

let release: () => void;
beforeAll(() => (release = registerDragonspineKinds()));
afterAll(() => release());

describe('the cost of building the Dragonspine layout', () => {
  // The ceiling is wall-clock on shared CI runners (319 ms and 301 ms were measured there under load, 2026-10-25), and a loaded local run
  // measured 1105 ms, so it only catches a build that has become an order of magnitude slower; the memoization test below is what keeps a boot to one build.
  it('builds the real ground in well under 5000 ms (about 100 ms is typical in node)', () => {
    const inp = defaultInputs();
    const t = performance.now();
    buildDragonspine(inp);
    expect(performance.now() - t).toBeLessThan(5000);
  });

  it('memoizes per inputs object, and the shipped build is one cached object', () => {
    const inp = defaultInputs();
    expect(buildDragonspine(inp)).toBe(buildDragonspine(inp));
    expect(dragonspineBuild()).toBe(dragonspineBuild());
    const t = performance.now();
    buildDragonspine(inp);
    dragonspineBuild();
    expect(performance.now() - t).toBeLessThan(5);
  });
});
