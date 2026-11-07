import { describe, expect, it, vi } from 'vitest';
import { CREDITS_VERSES, creditsVerseMix, endingThemeId, playCredits, playEndingTheme, stepCredits, stopCredits, stopCue } from './act5Cues';
import { CREDITS_FIRST_MIX_KEY, CREDITS_LAST_MIX_KEY, CREDITS_LAST_TOBB_MIX_KEY, CREDITS_VERSE_MIX_KEYS, ENDING_THEME_MIX_KEY } from './act5Tracks';
import { CREDITS_VERSE_FLAG } from './act5Slots';
import { TRACKS_BY_ID } from './tracks';

const fake = () => ({ setCue: vi.fn(), setCueMix: vi.fn() });

describe('the credits cue picks R30\'s verse (story.r30.verse)', () => {
  it('reads the flag the slots name', () => {
    expect(CREDITS_VERSE_FLAG).toBe('story.r30.verse');
  });

  it.each(CREDITS_VERSES.map((v, i) => [v, CREDITS_VERSE_MIX_KEYS[i]] as const))('%s gets %s', (verse, key) => {
    expect(creditsVerseMix(verse)).toBe(key);
    expect(TRACKS_BY_ID.credits.bossMixes?.[key]).toBeDefined();
  });

  it.each([undefined, null, '', 'nope', 'GAUT', '__proto__'])('an unset or unknown verse (%s) falls back to the fixed first verse', (verse) => {
    expect(creditsVerseMix(verse as string | undefined)).toBe(CREDITS_FIRST_MIX_KEY);
  });

  it('plays the ballad on the first verse, then steps verse1, chosen and last', () => {
    const m = fake();
    playCredits(m, 'keepers');
    expect(m.setCue).toHaveBeenCalledWith('credits', CREDITS_FIRST_MIX_KEY);
    stepCredits(m, 'verse1', 'keepers');
    stepCredits(m, 'chosen', 'keepers');
    stepCredits(m, 'last', 'keepers');
    expect(m.setCueMix.mock.calls.map((c) => c[0])).toEqual([CREDITS_FIRST_MIX_KEY, 'credits.keepers', CREDITS_LAST_MIX_KEY]);
  });

  it('a tie makes Tobb sing the last verse alone', () => {
    const m = fake();
    stepCredits(m, 'last', 'gaut', { tie: true });
    expect(m.setCueMix).toHaveBeenCalledWith(CREDITS_LAST_TOBB_MIX_KEY);
  });

  it('a skipped R30 (no verse) still steps to the fixed verse for the chosen slot', () => {
    const m = fake();
    stepCredits(m, 'chosen', undefined);
    expect(m.setCueMix).toHaveBeenCalledWith(CREDITS_FIRST_MIX_KEY);
  });

  it('stopCredits releases the cue', () => {
    const m = fake();
    stopCredits(m);
    stopCue(m);
    expect(m.setCue).toHaveBeenCalledTimes(2);
    expect(m.setCue).toHaveBeenCalledWith(null);
  });
});

describe('the ending themes', () => {
  it.each(['rekindle', 'let-it-die'] as const)('%s plays its own theme under the theme mix', (choice) => {
    const m = fake();
    playEndingTheme(m, choice);
    expect(m.setCue).toHaveBeenCalledWith(`ending.${choice}`, ENDING_THEME_MIX_KEY);
    expect(TRACKS_BY_ID[`ending.${choice}`]).toBeDefined();
  });

  it('a bad choice throws a clear error instead of playing silence', () => {
    expect(() => endingThemeId('both')).toThrow(/unknown ending theme/);
    expect(() => playEndingTheme(fake(), 'nope' as never)).toThrow();
  });
});

describe('headless: no music service is a no-op', () => {
  it('every helper tolerates undefined, null and a service without the cue slot', () => {
    for (const m of [undefined, null, {}]) {
      expect(() => {
        playEndingTheme(m, 'rekindle');
        playCredits(m, 'gaut');
        stepCredits(m, 'chosen', 'gaut');
        stopCredits(m);
      }).not.toThrow();
    }
  });
});
