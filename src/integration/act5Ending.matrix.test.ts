// The ending matrix (N12 PR 2, plan 12) on N11's pure ending data (src/scenes/act5/ending.ts), no boot: six speakers (the
// five tracks and a tie) x three endings (Rekindle lives, Rekindle dies, Let It Die) x both Vey outcomes x Scars 0, 8 and
// 12 = 108 cases. Every slide resolves to text (never a strings key), the title card is the ending's, the speaker is the
// snapshot's top track and Tobb on a tie, the Let It Die keepers' line follows the Scar band, and the credits' chosen verse
// follows `story.r30.verse` (none when R30 was not sung).
import { describe, expect, it } from 'vitest';
import { EPILOGUE_SPEAKERS, TITLE_CARDS, creditsFor, epilogueFor, titleCardFor } from '../scenes/act5/ending';
import { ACT5_ENDING_DATA } from './act5EndingData';
import { FAVOUR_TRACKS, snapshotFlag, type FavourTrack } from '../state/favour';
import { M56_CAEL_LIVES_FLAG, M56_CHOICE_FLAG, M56_SCARS_FLAG, R30_VERSE, R30_VERSES, VEY_OUTCOME } from '../quests/content/act5/foundry/flags';

type Speaker = FavourTrack | 'tie';
const SPEAKERS: readonly Speaker[] = [...FAVOUR_TRACKS, 'tie'];
const ENDINGS = [
  { id: 'rekindle-lives', choice: 'rekindle', lives: true, card: TITLE_CARDS.rekindleLives },
  { id: 'rekindle-dies', choice: 'rekindle', lives: false, card: TITLE_CARDS.rekindleDies },
  { id: 'let-it-die', choice: 'let-it-die', lives: true, card: TITLE_CARDS.letItDie },
] as const;
const VEY = ['spared', 'defeated'] as const;
const SCARS = [0, 8, 12] as const;

/** The M56 snapshot with `top` highest (two tracks share the top on a tie). */
function snapshot(top: Speaker): Record<string, unknown> {
  const o: Record<string, unknown> = { [snapshotFlag('m56', 'taken')]: true };
  FAVOUR_TRACKS.forEach((t, i) => (o[snapshotFlag('m56', t)] = 20 + i));
  if (top === 'tie') {
    o[snapshotFlag('m56', 'halvard')] = 80;
    o[snapshotFlag('m56', 'dragons')] = 80;
  } else o[snapshotFlag('m56', top)] = 80;
  return o;
}

function flagsFor(top: Speaker, e: (typeof ENDINGS)[number], vey: (typeof VEY)[number], scars: number, verse?: string) {
  const f: Record<string, unknown> = {
    ...snapshot(top),
    [M56_CHOICE_FLAG]: e.choice,
    [M56_CAEL_LIVES_FLAG]: e.lives,
    [M56_SCARS_FLAG]: scars,
    [VEY_OUTCOME]: vey,
    ...(verse ? { [R30_VERSE]: verse } : {}),
  };
  return (k: string) => f[k];
}

/** A line that is still a strings key (`a.b.c`), not text. */
const looksLikeKey = (s: string) => /^[a-z0-9]+(\.[A-Za-z0-9-]+){2,}$/.test(s.trim());

const CASES = SPEAKERS.flatMap((s) => ENDINGS.flatMap((e) => VEY.flatMap((v) => SCARS.map((n) => ({ s, e, v, n })))));

describe('the ending matrix (108 cases)', () => {
  it('has 108 cases', () => expect(CASES).toHaveLength(108));

  it.each(CASES.map((c) => [`${c.s} / ${c.e.id} / Vey ${c.v} / ${c.n} Scars`, c] as const))('%s', (_name, { s, e, v, n }) => {
    const flags = flagsFor(s, e, v, n);
    // the title card
    expect(titleCardFor(flags)).toEqual(e.card);
    // the epilogue: eight slides, every one resolved to text
    const ep = epilogueFor(flags);
    expect(ep.slides).toHaveLength(8);
    for (const slide of ep.slides) {
      expect(slide.title, 'every slide has a title').toBeTruthy();
      expect(slide.lines.length, `${slide.title}: at least one line`).toBeGreaterThan(0);
      for (const l of slide.lines) {
        expect(typeof l).toBe('string');
        expect(l.trim(), `${slide.title}: an empty line`).not.toBe('');
        expect(looksLikeKey(l), `${slide.title}: "${l}" is a key, not text`).toBe(false);
      }
    }
    // the speaker: the top track, Tobb (who sings it) on a tie
    expect(ep.speaker).toBe(EPILOGUE_SPEAKERS[s]);
    expect(ep.tie).toBe(s === 'tie');
    // the director's port passes the same data through
    expect(ACT5_ENDING_DATA.epilogueFor(flags).speaker).toBe(ep.speaker);
    expect(ACT5_ENDING_DATA.cutscene(e.choice)).toBe(e.choice === 'rekindle' ? 'scene-ending-rekindle' : 'scene-ending-let-it-die');
  });
});

describe('what the matrix varies', () => {
  const slide = (flags: (k: string) => unknown, title: string) => epilogueFor(flags).slides.find((x) => x.title === title)!.lines.join(' ');

  it('the Forge slide differs across the three endings', () => {
    const texts = ENDINGS.map((e) => slide(flagsFor('halvard', e, 'spared', 0), 'The Forge'));
    expect(new Set(texts).size).toBe(3);
  });

  it('the Regent slide follows Vey\'s outcome', () => {
    const [spared, defeated] = VEY.map((v) => slide(flagsFor('halvard', ENDINGS[0], v, 0), 'The Regent'));
    expect(spared).not.toBe(defeated);
  });

  it('under Let It Die the keepers\' slide changes with the Scar band (0, 8, 12)', () => {
    const texts = SCARS.map((n) => slide(flagsFor('dragons', ENDINGS[2], 'spared', n), 'The Keepers'));
    expect(new Set(texts).size).toBe(3);
  });

  it('a tie frames the epilogue in Tobb\'s verse: his opening on the first slide, his close on the last', () => {
    const ep = epilogueFor(flagsFor('tie', ENDINGS[0], 'spared', 0));
    const solo = epilogueFor(flagsFor('halvard', ENDINGS[0], 'spared', 0));
    expect(ep.slides[0]!.lines[0]).not.toBe(solo.slides[0]!.lines[0]);
    expect(ep.slides.at(-1)!.lines.at(-1)).not.toBe(solo.slides.at(-1)!.lines.at(-1));
  });

  it('no M56 snapshot at all still resolves: Tobb speaks', () => {
    const ep = epilogueFor((k) => ({ [M56_CHOICE_FLAG]: 'rekindle', [M56_CAEL_LIVES_FLAG]: true } as Record<string, unknown>)[k]);
    expect(ep.speaker).toBe(EPILOGUE_SPEAKERS.tie);
    expect(ep.slides).toHaveLength(8);
  });

  it('the credits: the chosen verse follows story.r30.verse, and is left out when R30 was not sung', () => {
    const chosen = (v?: string) => creditsFor(flagsFor('halvard', ENDINGS[0], 'spared', 0, v)).blocks.filter((b) => b.kind === 'verse' && b.step === 'chosen');
    const seen = new Set<string>();
    for (const v of R30_VERSES) {
      const c = chosen(v);
      expect(c, v).toHaveLength(1);
      const lines = (c[0] as { lines: readonly string[] }).lines;
      for (const l of lines) expect(looksLikeKey(l), l).toBe(false);
      seen.add(lines.join('|'));
    }
    expect(seen.size, 'four different verses').toBe(R30_VERSES.length);
    expect(chosen(undefined)).toEqual([]);
    // the fixed verses and the five DLC cards are always there
    const all = creditsFor(flagsFor('halvard', ENDINGS[0], 'spared', 0)).blocks;
    expect(all.filter((b) => b.kind === 'verse').map((b) => (b as { step: string }).step)).toEqual(['verse1', 'last']);
    expect(all.filter((b) => b.kind === 'card')).toHaveLength(5);
  });
});
