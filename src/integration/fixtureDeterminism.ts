/**
 * Helpers that make the fixture generators (src/integration/fixtures.gen.test.ts) repeatable: a seeded `Math.random`
 * and a normaliser that drops run-dependent bytes and sorts every object's keys, so two runs write identical files.
 */
import { vi } from 'vitest';
import type { ChapterHarness } from './chapterHarness';
import { ensure } from './phaseA';
import { FIXTURE_SAVED_AT } from '../save/__fixtures__/phaseA';

/** The seed every generator run starts from. */
export const FIXTURE_SEED = 0x0e3b3a5;

/** mulberry32: small, fast, and the same sequence for the same seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Replaces `Math.random` with a seeded sequence until `vi.restoreAllMocks()`. */
export function seedFixtureRandom(seed: number = FIXTURE_SEED): void {
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(seed));
}

/** Recursively sorts object keys (arrays keep their order) and turns -0 into 0. */
export function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) out[k] = sortKeys((value as Record<string, unknown>)[k]);
    return out as T;
  }
  if (typeof value === 'number' && Object.is(value, -0)) return 0 as unknown as T;
  return value;
}

/** Floats stored by a run are rounded to this many decimals so accumulated rounding noise cannot leak into the files. */
const FLOAT_DECIMALS = 4;

function roundFloats<T>(value: T): T {
  if (Array.isArray(value)) return value.map(roundFloats) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as object)) out[k] = roundFloats(v);
    return out as T;
  }
  if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) {
    const f = 10 ** FLOAT_DECIMALS;
    return (Math.round(value * f) / f) as unknown as T;
  }
  return value;
}

/** The canonical form written to disk: whole-second playtime, rounded floats, sorted keys. */
export function normaliseFixture(raw: Record<string, unknown>): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  if (typeof out.playtimeSeconds === 'number') out.playtimeSeconds = Math.round(out.playtimeSeconds);
  return sortKeys(roundFloats(out));
}

/** Saves through the real plugin with a fixed clock and returns the stored `slot-0` value. */
export async function saveFixture(t: ChapterHarness): Promise<Record<string, unknown>> {
  // Saves are refused in dialogue or cutscene contexts; let the last one close.
  await t.runAsync(5);
  const now = vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_SAVED_AT);
  try {
    const out = await t.ctx.services.require('save').saveNow('manual');
    await t.flush();
    ensure(out.ok, `manual save ok (${JSON.stringify(out)})`);
  } finally {
    now.mockRestore();
  }
  const raw = JSON.parse(JSON.stringify(t.fake.peek('slot-0'))) as Record<string, unknown>;
  ensure(raw && raw.savedAt === FIXTURE_SAVED_AT, 'slot-0 holds the save just written');
  return normaliseFixture(raw);
}
