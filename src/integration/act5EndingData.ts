// The final ending's data, behind one port (N12 PR 2, plan 9). N11 PR 2 owns the real data in `src/scenes/act5/index.ts`
// (names confirmed by N11, 2026-11-07 15:10): `ENDING_CUTSCENES` (N11's director registers both scenes and starts N8's
// theme on `scene.started`), `titleCardFor(flags)` (N11 registers the strings), `epilogueFor(flags)` (resolved text, the
// speaker's display name, Tobb on a tie) and `creditsFor(flags)` (N9's CreditsDef, the verse from `story.r30.verse`). Until that lands these stand-ins say only
// what the plan fixes (design 3, plan 2.7 and 2.8), so the director, its tests and the chain run end to end; the swap is
// this one file, an import in place of each stand-in.
import type { SlideDef } from '../hud/act5/slides';
import type { CreditsDef } from '../hud/act5/credits';
import { ACT5_ENDING } from './actEndings';
import { highestTrack, type FavourTrack } from '../state/favour';

export type EndingChoice = 'rekindle' | 'let-it-die';
export const M56_CHOICE_FLAG = ACT5_ENDING.choiceFlag;
export const M56_CAEL_LIVES_FLAG = 'story.m56.caelLives';
export const R30_VERSE_FLAG = 'story.r30.verse';
export const M56_SNAPSHOT = 'm56';

export type FlagReader = (key: string) => unknown;

export interface TitleCard {
  titleKey: string;
  lineKey?: string;
}

export interface Epilogue {
  /** The display name of who speaks: the M56 snapshot's top track's voice, Tobb on a tie (N11: 'Tobb Fenwick'). */
  speaker: string;
  tie: boolean;
  /** resolved text */
  slides: SlideDef[];
}

export interface Act5EndingData {
  cutscene(choice: EndingChoice): string;
  titleCardFor(flags: FlagReader): TitleCard;
  epilogueFor(flags: FlagReader): Epilogue;
  creditsFor(flags: FlagReader): CreditsDef;
}

export function choiceOf(flags: FlagReader): EndingChoice | undefined {
  const v = flags(M56_CHOICE_FLAG);
  return v === 'rekindle' || v === 'let-it-die' ? v : undefined;
}

export const ACT5_ENDING_STRINGS_EN: Readonly<Record<string, string>> = {
  'hud.ending.a5.lastEmber': 'The Last Ember',
  'hud.ending.a5.lastBearer': 'Cael Brannoc, the last bearer',
  'hud.ending.a5.longDawn': 'The Long Dawn',
};

/** Stand-in until N11 PR 2: the plan's three cards, from the choice and `story.m56.caelLives`. */
function titleCardFor(flags: FlagReader): TitleCard {
  const c = ACT5_ENDING.cards;
  if (choiceOf(flags) === 'let-it-die') return { titleKey: c['long-dawn']! };
  if (flags(M56_CAEL_LIVES_FLAG) === false) return { titleKey: c['last-ember']!, lineKey: c['last-bearer']! };
  return { titleKey: c['last-ember']! };
}

/** Tobb sings on a tie (N11's display name). */
export const TIE_SPEAKER = 'Tobb Fenwick';
const STAND_IN_SPEAKERS: Readonly<Record<FavourTrack, string>> = {
  halvard: 'Halvard', oswin: 'Oswin', grisel: 'Grisel', ashwalkers: 'the Ashwalkers', dragons: 'the Keepers',
};

/** Stand-in until N11 PR 2: the speaker rule and one slide naming the choice; every case resolves. */
function epilogueFor(flags: FlagReader): Epilogue {
  const top = highestTrack({ getFlag: flags }, M56_SNAPSHOT);
  const choice = choiceOf(flags) ?? 'rekindle';
  return {
    speaker: top === 'tie' ? TIE_SPEAKER : top ? STAND_IN_SPEAKERS[top] : TIE_SPEAKER,
    tie: top === 'tie',
    slides: [{ title: choice === 'let-it-die' ? 'The Long Dawn' : 'The Last Ember', lines: ['(N11 PR 2 writes the eight epilogue slides.)'] }],
  };
}

/** Stand-in until N11 PR 2: the ballad's three steps (N8's cues follow them) and nothing else. */
function creditsFor(flags: FlagReader): CreditsDef {
  const verse = flags(R30_VERSE_FLAG);
  return {
    blocks: [
      { kind: 'heading', text: 'Embers of Valdren' },
      { kind: 'verse', step: 'verse1', lines: ['(the first verse)'] },
      { kind: 'verse', step: 'chosen', lines: [typeof verse === 'string' ? `(the ${verse} verse)` : '(the fixed verse)'] },
      { kind: 'verse', step: 'last', lines: ['(the last verse)'] },
    ],
  };
}

export const ACT5_ENDING_DATA: Act5EndingData = {
  cutscene: (choice) => ACT5_ENDING.cutscenes[choice],
  titleCardFor,
  epilogueFor,
  creditsFor,
};
