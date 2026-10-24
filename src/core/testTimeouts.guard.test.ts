// Guard (review R3-3): a test file that boots the whole plugin manifest runs 3 to 5 s alone and more under load. Vitest 2 only
// times a test out when its body gives up the event loop, so the 5 s default flakes the day someone adds an `await`. Such a
// file must set a limit of its own (`vi.setConfig({ testTimeout })` or a timeout argument on its tests) and free its Rapier world.
import { describe, expect, it } from 'vitest';

const NOT_TESTS = /(pluginManifest|startWorld|chapterHarness)\.ts$/;

/** Every source file's text, by path (Vite's raw glob: no Node fs, so the type check needs no Node types). */
const SOURCES = import.meta.glob<string>(['/src/**/*.test.ts', '/src/**/chapterHarness.ts'], { query: '?raw', import: 'default', eager: true });
const text = (path: string): string => SOURCES[path] ?? '';

const bootsManifest = (src: string) => /\bPLUGIN_MODULES\b/.test(src) || /\bbootChapter\(/.test(src);
const hasTimeout = (src: string) => /testTimeout|_TIMEOUT\b/.test(src) || /\},\s*\d[\d_]{3,}\s*\)/.test(src);

describe('test files that boot the whole manifest', () => {
  const files = Object.keys(SOURCES).filter((f) => f.endsWith('.test.ts') && !NOT_TESTS.test(f) && !f.endsWith('testTimeouts.guard.test.ts'));
  const booting = files.filter((f) => bootsManifest(text(f)));

  it('finds them', () => {
    expect(booting.length).toBeGreaterThanOrEqual(5);
  });

  it('each sets its own timeout', () => {
    expect(booting.filter((f) => !hasTimeout(text(f)))).toEqual([]);
  });

  // The two files the review named. The other manifest-booting files free their world through their own cleanups; widen this
  // list as they are brought in line.
  it('the tutorial and Game tests free their Rapier world', () => {
    for (const f of ['/src/tutorial/tutorial.plugin.test.ts', '/src/core/Game.test.ts']) {
      expect(text(f), f).toMatch(/physics\.dispose\(\)/);
    }
  });
});
