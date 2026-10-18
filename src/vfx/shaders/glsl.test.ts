import { describe, expect, it } from 'vitest';
import { ALL_GLSL, DISSOLVE_DISCARD, DISSOLVE_EMISSIVE, TELEGRAPH_EMISSIVE } from './glsl';

describe('glsl snippets', () => {
  for (const [name, src] of Object.entries(ALL_GLSL)) {
    it(`${name} is clean`, () => {
      expect(src.length).toBeGreaterThan(0);
      expect(src).not.toContain('undefined');
      expect(src).not.toContain('[object');
      let depth = 0;
      for (const ch of src) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);
      expect((src.match(/\(/g) ?? []).length).toBe((src.match(/\)/g) ?? []).length);
    });
  }
  it('contains the key expressions', () => {
    expect(DISSOLVE_DISCARD).toContain('< uDissolve) discard');
    expect(DISSOLVE_EMISSIVE).toContain('0.06');
    expect(TELEGRAPH_EMISSIVE).toContain('uTelegraphColor * uTelegraph * 1.5');
  });
});
