// The final ending's data, behind one port (N12 PR 2, plan 9). N11 PR 2 owns the real data
// (names agreed with N11, 2026-11-07 15:10): `ENDING_CUTSCENES` (N11's director registers both scenes and starts N8's
// theme on `scene.started`), `titleCardFor(flags)` (N11 registers the strings), `epilogueFor(flags)` (resolved text, the
// speaker's display name, Tobb on a tie) and `creditsFor(flags)` (N9's CreditsDef, the verse from `story.r30.verse`).
// N11 PR 2 (d6e78e9) put them in `src/scenes/act5/ending.ts` and registers their strings; the stand-ins that stood here
// until it landed are gone.
import type { SlideDef } from '../hud/act5/slides';
import type { CreditsDef } from '../hud/act5/credits';
import { ACT5_ENDING } from './actEndings';
import { ENDING_CUTSCENES, creditsFor, epilogueFor, titleCardFor } from '../scenes/act5/ending';

export type EndingChoice = 'rekindle' | 'let-it-die';
export const M56_CHOICE_FLAG = ACT5_ENDING.choiceFlag;
export const M56_CAEL_LIVES_FLAG = 'story.m56.caelLives';
export const R30_VERSE_FLAG = 'story.r30.verse';

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

export const ACT5_ENDING_DATA: Act5EndingData = {
  cutscene: (choice) => ENDING_CUTSCENES[choice],
  titleCardFor,
  epilogueFor,
  creditsFor,
};
