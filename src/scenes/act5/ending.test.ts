// The ending data N12 plays: every title card, every epilogue slide on a matrix of worlds (each resolves to real text, never a
// key), the speaker by the M56 snapshot (Tobb on a tie), and the credits' verse by R30.
import { describe, expect, it } from 'vitest';
import { creditsFor, ENDING_CUTSCENES, ENDING_SCENE_DEFS, ENDING_SECONDS, ENDING_STRINGS, endingFxFor, epilogueFor, EPILOGUE_SPEAKERS, titleCardFor } from './ending';
import { ACT5_CREDITS_STRINGS_EN } from '../../hud/act5/strings.en';

type W = Record<string, unknown>;
const F = (w: W) => (k: string): unknown => w[k];
const SNAP = (track: string, v: number): W => ({ 'favour.snapshot.m56.taken': true, [`favour.snapshot.m56.${track}`]: v });

const WORLDS: W[] = [];
for (const choice of ['rekindle', 'let-it-die'])
  for (const lives of [true, false])
    for (const vey of ['spared', 'defeated', undefined])
      for (const scars of [0, 9, 13])
        WORLDS.push({
          'story.m56.choice': choice, 'story.m56.caelLives': choice === 'let-it-die' ? true : lives, 'story.m56.scars': scars,
          'boss.vey.outcome': vey, 'story.r24.choice': scars > 5 ? 'all' : 'half', 'story.r10.choice': ['miners', 'stewards', 'compromise'][scars % 3],
          'story.r27.choice': lives ? 'keep' : 'collapse', 'story.r28.pyres': scars % 5, ...SNAP('halvard', 30 + scars * 3),
        });
WORLDS.push({}); // a world with nothing set still resolves

const isKey = (s: string): boolean => /^[a-z0-9]+(\.[a-z0-9-]+)+$/i.test(s);

describe('the ending data', () => {
  it('two scenes, 12 and 14 seconds, every line string registered', () => {
    expect(ENDING_SCENE_DEFS.map((d) => d.id).sort()).toEqual(Object.values(ENDING_CUTSCENES).sort());
    for (const d of ENDING_SCENE_DEFS) {
      const choice = d.id === ENDING_CUTSCENES.rekindle ? 'rekindle' : 'let-it-die';
      const secs = d.steps.reduce((s, x) => s + ('line' in x ? x.line.seconds ?? 0 : 0), 0);
      expect(secs).toBe(ENDING_SECONDS[choice]);
      for (const s of d.steps) if ('line' in s) expect(ENDING_STRINGS[s.line.textKey]).toBeTruthy();
    }
  });

  it('Low quality drops the bloom pulse only', () => {
    expect(endingFxFor('rekindle', 'high').map((e) => e.fx)).toContain('bloom-pulse');
    expect(endingFxFor('rekindle', 'low').map((e) => e.fx)).not.toContain('bloom-pulse');
    expect(endingFxFor('rekindle', 'low').length).toBe(endingFxFor('rekindle', 'high').length - 1);
  });

  it('title cards: The Last Ember (with the last bearer when Cael dies), The Long Dawn', () => {
    expect(titleCardFor(F({ 'story.m56.choice': 'rekindle', 'story.m56.caelLives': true }))).toEqual({ titleKey: 'scene.ending.title.lastEmber' });
    expect(titleCardFor(F({ 'story.m56.choice': 'rekindle', 'story.m56.caelLives': false })).lineKey).toBe('scene.ending.title.lastBearer');
    expect(titleCardFor(F({ 'story.m56.choice': 'let-it-die', 'story.m56.caelLives': true })).titleKey).toBe('scene.ending.title.longDawn');
    for (const k of ['scene.ending.title.lastEmber', 'scene.ending.title.lastBearer', 'scene.ending.title.longDawn']) expect(ENDING_STRINGS[k]).toBeTruthy();
  });

  it('every slide of every world resolves to eight titled slides of real text', () => {
    for (const w of WORLDS) {
      const e = epilogueFor(F(w));
      expect(e.slides).toHaveLength(8);
      for (const s of e.slides) {
        expect(s.title).toBeTruthy();
        expect(s.lines.length).toBeGreaterThan(0);
        for (const l of s.lines) { expect(l.trim()).not.toBe(''); expect(isKey(l)).toBe(false); expect(l).not.toContain('undefined'); }
      }
    }
  });

  it('the forge slide follows the branch and Cael', () => {
    const forge = (w: W): string => epilogueFor(F(w)).slides[0]!.lines.join(' ');
    expect(forge({ 'story.m56.choice': 'rekindle', 'story.m56.caelLives': false })).toContain('last bearer');
    expect(forge({ 'story.m56.choice': 'rekindle', 'story.m56.caelLives': true })).toContain('own feet');
    expect(forge({ 'story.m56.choice': 'let-it-die', 'story.m56.caelLives': true })).toContain('cold');
  });

  it('the speaker is the highest track at the M56 snapshot, Tobb on a tie, and the frame opens and closes the deck', () => {
    const one = epilogueFor(F({ ...SNAP('oswin', 80), ...SNAP('halvard', 40) }));
    expect(one.speaker).toBe(EPILOGUE_SPEAKERS.oswin);
    expect(one.tie).toBe(false);
    const tie = epilogueFor(F({ ...SNAP('oswin', 60), ...SNAP('grisel', 60) }));
    expect(tie.speaker).toBe('Tobb Fenwick');
    expect(tie.tie).toBe(true);
    expect(tie.slides[0]!.lines[0]).toContain('tune');
    expect(tie.slides[7]!.lines.at(-1)).toContain('bard');
  });

  it('credits: R30\'s chosen verse, or only the fixed verses when R30 was skipped; five DLC cards; every line real text', () => {
    const sung = creditsFor(F({ 'story.r30.verse': 'gaut' }));
    const chosen = sung.blocks.find((b) => b.kind === 'verse' && b.step === 'chosen');
    expect(chosen && 'lines' in chosen ? chosen.lines[0] : '').toBe(ACT5_CREDITS_STRINGS_EN['hud.credits.verse.gaut.1']);
    const unsung = creditsFor(F({}));
    expect(unsung.blocks.filter((b) => b.kind === 'verse').map((b) => (b as { step: string }).step)).toEqual(['verse1', 'last']);
    expect(unsung.blocks.filter((b) => b.kind === 'card')).toHaveLength(5);
    for (const b of unsung.blocks) {
      const texts = [...('text' in b && b.text ? [b.text] : []), ...('title' in b && b.title ? [b.title] : []), ...('lines' in b ? b.lines : [])];
      for (const t of texts) expect(isKey(t)).toBe(false);
    }
  });
});
