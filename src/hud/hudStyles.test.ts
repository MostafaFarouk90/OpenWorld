import { describe, expect, it } from 'vitest';
import { HUD_CSS } from './hudStyles';
import { defaultHudT, formatHud, HUD_STRINGS_EN } from './strings.en';

describe('hud styles and strings', () => {
  it('prefixes every class with owg-', () => {
    const classes = [...HUD_CSS.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]!);
    expect(classes.length).toBeGreaterThan(20);
    expect(classes.filter((c) => !c.startsWith('owg-') && !/^\d/.test(c))).toEqual([]);
  });
  it('formats params and falls back for unknown keys', () => {
    expect(formatHud('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    expect(defaultHudT('nope')).toBe('[[nope]]');
    expect(Object.keys(HUD_STRINGS_EN).every((k) => k.startsWith('hud.'))).toBe(true);
  });
});
