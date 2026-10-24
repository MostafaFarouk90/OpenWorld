import { describe, expect, it } from 'vitest';
import { WYRM_SOUND_KEYS } from '../enemies/wyrm/sounds';
import { BARE_SFX_IDS, SFX_IDS, SPELL_SFX_IDS } from '../music/sfxLayers';
import { BARE_ALIASES } from '../music/SfxPlayer';
import { SFX_VARIANTS, sfxKey } from '../music/sfxSynth';
import { LIFT_CUE_KEYS, LIFT_RIDE_SOUND } from '../oldsmoke/mines/liftSound';
import { ACT2_SFX_KEYS } from './act2Sfx';

/** Every non-test source file under src, as text (Vite inlines these at transform time, so no Node types are needed). */
const SOURCES = import.meta.glob(['../**/*.ts', '!../**/*.test.ts', '!../**/*.spec.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/**
 * The literal `sfx.` keys handed to a play call (`play`, `playAt`, an encounter's `sfx(...)` helper, optional `sfx?.(` ports),
 * in single or double quotes. Template keys are dynamic and skipped.
 */
function playedKeys(): Map<string, string> {
  const found = new Map<string, string>();
  const re = /\b(?:play|playAt|sfx)(?:\?\.)?\(\s*(['"])(sfx\.[A-Za-z0-9_.-]+)\1/g;
  for (const [file, text] of Object.entries(SOURCES)) {
    for (const m of text.matchAll(re)) found.set(m[2], file.replace('../', ''));
  }
  return found;
}

describe('sfx registry', () => {
  it('registers every literal sfx key that source plays (no silent cues)', () => {
    // What the game really registers. SFX_IDS are registered only with a variant suffix (registerPlaceholderSfx), so a bare
    // `sfx.swing.light` is NOT here and fails; only the spell, bare and alias ids are registered bare.
    const variantKeys = SFX_IDS.flatMap((id) => Array.from({ length: SFX_VARIANTS }, (_, v) => sfxKey(id, v)));
    const registered = new Set<string>([
      ...ACT2_SFX_KEYS,
      ...variantKeys,
      ...SPELL_SFX_IDS,
      ...BARE_SFX_IDS,
      ...BARE_ALIASES,
      ...WYRM_SOUND_KEYS.map((k) => `sfx.wyrm.${k}`),
      ...LIFT_CUE_KEYS,
      LIFT_RIDE_SOUND,
    ]);
    const played = playedKeys();
    // The scan must actually see the plays, or it would pass vacuously.
    expect(played.size).toBeGreaterThanOrEqual(14);
    for (const key of ['sfx.grimtooth.growl', 'sfx.redmane.net', 'sfx.slagmaw.erupt', 'sfx.wyrm.roar']) expect(played.has(key)).toBe(true);
    const missing = [...played].filter(([k]) => !registered.has(k)).map(([k, f]) => `${k} (${f})`);
    expect(missing).toEqual([]);
  });

  it('a bare id that is only registered with a variant suffix is not accepted', () => {
    const bare = SFX_IDS.find((id) => !(BARE_ALIASES as readonly string[]).includes(id))!;
    const bareRegistered = new Set<string>([...SPELL_SFX_IDS, ...BARE_SFX_IDS, ...BARE_ALIASES]);
    expect(bareRegistered.has(bare)).toBe(false);
    expect(sfxKey(bare, 0)).not.toBe(bare);
  });

  it('the scan sees double-quoted and optional-call keys', () => {
    const re = /\b(?:play|playAt|sfx)(?:\?\.)?\(\s*(['"])(sfx\.[A-Za-z0-9_.-]+)\1/g
    const keys = [...`a.play("sfx.x.one"); this.ports.sfx?.('sfx.x.two', 1); audio.playAt('sfx.x.three', p)`.matchAll(re)].map((m) => m[2]);
    expect(keys).toEqual(['sfx.x.one', 'sfx.x.two', 'sfx.x.three']);
  });
});
