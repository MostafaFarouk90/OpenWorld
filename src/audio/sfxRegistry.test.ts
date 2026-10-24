import { describe, expect, it } from 'vitest';
import { BARE_SFX_IDS, SFX_IDS, SPELL_SFX_IDS } from '../music/sfxLayers';
import { LIFT_CUE_KEYS, LIFT_RIDE_SOUND } from '../oldsmoke/mines/liftSound';
import { ACT2_SFX_KEYS } from './act2Sfx';

/** Every non-test source file under src, as text (Vite inlines these at transform time, so no Node types are needed). */
const SOURCES = import.meta.glob(['../**/*.ts', '!../**/*.test.ts', '!../**/*.spec.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The literal `sfx.` keys handed to a play call (`play`, `playAt`, an encounter's `sfx(...)` helper). Template keys are dynamic and skipped. */
function playedKeys(): Map<string, string> {
  const found = new Map<string, string>();
  const re = /\b(?:play|playAt|sfx)\(\s*'(sfx\.[A-Za-z0-9_.-]+)'/g;
  for (const [file, text] of Object.entries(SOURCES)) {
    for (const m of text.matchAll(re)) found.set(m[1], file.replace('../', ''));
  }
  return found;
}

describe('sfx registry', () => {
  it('registers every literal sfx key that source plays (no silent cues)', () => {
    const registered = new Set<string>([
      ...ACT2_SFX_KEYS,
      ...SFX_IDS,
      ...SPELL_SFX_IDS,
      ...BARE_SFX_IDS,
      ...LIFT_CUE_KEYS,
      LIFT_RIDE_SOUND,
    ]);
    const played = playedKeys();
    // The scan must actually see the plays, or it would pass vacuously.
    expect(played.size).toBeGreaterThan(8);
    for (const key of ['sfx.grimtooth.growl', 'sfx.redmane.net']) expect(played.has(key)).toBe(true);
    const missing = [...played].filter(([k]) => !registered.has(k)).map(([k, f]) => `${k} (${f})`);
    expect(missing).toEqual([]);
  });
});
