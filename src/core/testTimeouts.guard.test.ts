// Guard (review R3-3, F3): a test file that boots the whole plugin manifest runs 3 to 5 s alone and more under load. Vitest 2 only
// times a test out when its body gives up the event loop, so the 5 s default flakes the day someone adds an `await`. Such a
// file must set a limit of its own (`vi.setConfig({ testTimeout })`, or a timeout argument on every test call) and free its Rapier world.
// Comments and `setTimeout(...)` calls never count: the check reads code with the comments blanked out.
import { describe, expect, it } from 'vitest';

/** Every test file's text, by path (Vite's raw glob: no Node fs, so the type check needs no Node types). */
const SOURCES = import.meta.glob<string>('/src/**/*.test.ts', { query: '?raw', import: 'default', eager: true });
const text = (path: string): string => SOURCES[path] ?? '';

/** The source with line and block comments replaced by spaces (strings and template literals are left alone). */
function stripComments(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop - 1;
    } else out += c;
  }
  return out;
}

/** Index just past the `)` that closes the `(` at `open` (strings and template literals skipped), or -1. */
function closeOf(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
  }
  return -1;
}

const bootsManifest = (code: string) => /\bPLUGIN_MODULES\b/.test(code) || /\bbootChapter\(/.test(code) || /\bbootFromSave\(/.test(code);

/** A real `vi.setConfig({ ... testTimeout ... })` call. */
const setsFileTimeout = (code: string) => /\bvi\.setConfig\(\s*\{[^}]*\btestTimeout\b/.test(code);

/** The async test calls (`it`/`test`, with `.each(...)`, `.only`, ...) that carry no timeout argument. */
function testsWithoutTimeout(code: string): string[] {
  const missing: string[] = [];
  const start = /(?<![\w.])(?:it|test)(?:\.(?:only|concurrent|sequential|fails))*(\.each)?/g;
  for (let m = start.exec(code); m; m = start.exec(code)) {
    let at = m.index + m[0].length;
    if (m[1]) {
      if (code[at] !== '(') continue;
      at = closeOf(code, at);
      if (at < 0) continue;
    }
    if (code[at] !== '(') continue;
    const end = closeOf(code, at);
    if (end < 0) continue;
    const call = code.slice(at, end);
    // Only an async body can give up the event loop, so only it can time out; a todo has no body and a sync test cannot.
    if (!/^[^=]*?\basync\b[^=]*=>|\basync\s+function\b/.test(call)) continue;
    if (!/,\s*[\w.]*(?:\d|TIMEOUT)[\w.]*\s*,?\s*\)$/.test(call)) missing.push(call.slice(1, 70).replace(/\s+/g, ' '));
    start.lastIndex = end;
  }
  return missing;
}

describe('test files that boot the whole manifest', () => {
  const files = Object.keys(SOURCES).filter((f) => !f.endsWith('testTimeouts.guard.test.ts'));
  const booting = files.filter((f) => bootsManifest(stripComments(text(f))));

  it('finds them, bootFromSave files included', () => {
    expect(booting.length).toBeGreaterThanOrEqual(5);
    expect(booting).toContain('/src/save/act2Migration.test.ts');
  });

  it('each sets a file timeout or gives every test call its own', () => {
    const bad = booting.flatMap((f) => {
      const code = stripComments(text(f));
      return setsFileTimeout(code) ? [] : testsWithoutTimeout(code).map((t) => `${f}: ${t}`);
    });
    expect(bad).toEqual([]);
  });

  it('the detectors ignore comments and setTimeout, and read each call', () => {
    expect(stripComments('// testTimeout\nx')).not.toMatch(/testTimeout/);
    expect(setsFileTimeout(stripComments('/* vi.setConfig({ testTimeout: 9 }) */'))).toBe(false);
    expect(setsFileTimeout('vi.setConfig({ testTimeout: 60_000 });')).toBe(true);
    expect(testsWithoutTimeout("it('a', async () => { setTimeout(() => {}, 1000); });")).toHaveLength(1);
    expect(testsWithoutTimeout("it('a', () => { f(); });")).toEqual([]);
    expect(testsWithoutTimeout("it('a', async () => { await x(); }, 60_000);")).toEqual([]);
    expect(testsWithoutTimeout("it.each(A)('%s', async (n) => {}, T_TIMEOUT);")).toEqual([]);
    expect(testsWithoutTimeout("it('a', async () => {}, 5000); it('b', async () => { f(')'); });")).toHaveLength(1);
  });

  // The two files the review named. The other manifest-booting files free their world through their own cleanups; widen this
  // list as they are brought in line.
  it('the tutorial and Game tests free their Rapier world', () => {
    for (const f of ['/src/tutorial/tutorial.plugin.test.ts', '/src/core/Game.test.ts']) {
      expect(text(f), f).toMatch(/physics\.dispose\(\)/);
    }
  });
});
