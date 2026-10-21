import { describe, expect, it } from 'vitest';
import { HUD_CSS } from './hudStyles';
import { defaultHudT, formatHud, HUD_STRINGS_EN } from './strings.en';

describe('hud styles and strings', () => {
  it('prefixes every class with owg-', () => {
    const classes = [...HUD_CSS.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]!);
    expect(classes.length).toBeGreaterThan(20);
    expect(classes.filter((c) => !c.startsWith('owg-') && c !== 'interaction-prompt__mercy' && !/^\d/.test(c))).toEqual([]);
  });
  it('modal and card variants are not overridden by .owg-card (equal specificity, later rule wins)', () => {
    const cardAt = HUD_CSS.indexOf('.owg-card{');
    expect(cardAt).toBeGreaterThan(-1);
    for (const cls of ['owg-party', 'owg-pressure', 'owg-tempering']) {
      // Either declared as a compound (.owg-card.owg-x) or after the base rule.
      const compound = HUD_CSS.includes(`.owg-card.${cls}{`);
      const after = HUD_CSS.indexOf(`.${cls}{`) > cardAt;
      expect(compound || after, cls).toBe(true);
    }
    // The clickable ones turn pointer events back on.
    for (const cls of ['owg-party', 'owg-tempering']) expect(HUD_CSS).toMatch(new RegExp(`\\.owg-card\\.${cls}\\{[^}]*pointer-events:auto`));
  });
  it('formats params and falls back for unknown keys', () => {
    expect(formatHud('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    expect(defaultHudT('nope')).toBe('[[nope]]');
    expect(Object.keys(HUD_STRINGS_EN).every((k) => k.startsWith('hud.'))).toBe(true);
  });
});
