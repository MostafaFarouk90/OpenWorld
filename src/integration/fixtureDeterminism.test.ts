import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ACT1_FIXTURES, readAct1Fixture } from '../save/__fixtures__/act1';
import { normaliseFixture, saveFixture, seedFixtureRandom, seededRandom, sortKeys } from './fixtureDeterminism';

let h: ChapterHarness | null = null;
beforeEach(() => {
  seedFixtureRandom();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

describe('fixture generator determinism', () => {
  it('the seeded random repeats and the normaliser sorts keys and rounds', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(JSON.stringify(sortKeys({ b: 1, a: { d: [{ z: 1, y: 2 }], c: -0 } }))).toBe('{"a":{"c":0,"d":[{"y":2,"z":1}]},"b":1}');
    const n = normaliseFixture({ playtimeSeconds: 12.6, entries: { x: 0.123456789 } });
    expect(n.playtimeSeconds).toBe(13);
    expect((n.entries as { x: number }).x).toBe(0.1235);
  });

  it('two boots from the same save, run the same ticks, write byte-identical fixtures', async () => {
    const run = async (): Promise<string> => {
      vi.restoreAllMocks();
      seedFixtureRandom();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const t = await bootFromSave(await readAct1Fixture(ACT1_FIXTURES.complete), { models: true, virtualClock: true });
      h = t;
      await t.runAsync(300);
      const out = JSON.stringify(await saveFixture(t));
      t.dispose();
      h = null;
      return out;
    };
    const first = await run();
    const second = await run();
    expect(second).toBe(first);
  }, 120_000);
});
