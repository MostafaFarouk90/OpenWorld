// Test-only helpers for N13's e2e tests (not imported by the game): the after-ending save built from Act 4's M46 fixture.
import { readAct4Fixture } from '../save/__fixtures__/act4';
import { AFTER_ENDING_FLAG, CAEL_LIVES_FLAG, M56_CHOICE_FLAG } from './flags';

/** The seven side quests the occupation stranded (plans/open-followups.md). */
export const STRANDED = ['r03', 'r04', 'd02', 'j05', 'j07', 'j08', 'j10'] as const;

/** Flags a save that reached the ending carries beyond M46 (Act 5's gates and holds), so the Caldera is open for the wake. */
export const ENDING_REACHED: Readonly<Record<string, unknown>> = {
  'story.m46.complete': true,
  'story.d08.complete': true,
  'story.gate.a5': true,
  'story.m47.rimGateOpen': true,
  'story.m47.complete': true,
  'story.m49.complete': true,
  'story.m52.complete': true,
  'story.phase.foundryOpen': true,
  'story.m53.complete': true,
  'story.gate.end': true,
  // Act 4's ending was seen (its camp scene and card), as in a save that played through
  'story.a4.campSeen': true,
  'codex.actEnding.a4.seen': true,
};

type Save = { entries: Record<string, { data: Record<string, any> }> };

/** The M46 save with the seven quests reset, and (with `after`) the ending played out. */
export async function strandedSave(after: boolean, choice: 'rekindle' | 'let-it-die' = 'rekindle', reset: readonly string[] = STRANDED): Promise<Save> {
  const save = JSON.parse(JSON.stringify(await readAct4Fixture('m46'))) as Save;
  const quests = save.entries.quests!.data.quests as Record<string, unknown>;
  for (const q of reset) delete quests[q];
  quests.j04 = { objectives: {}, state: 'completed' };
  const flags = save.entries['world-state']!.data.flags as Record<string, unknown>;
  for (const k of Object.keys(flags)) {
    // The quests' own progress flags go; the Act 1 ending's camp-scene flag (story.d02.campSeen) is the ending's, and stays.
    if (reset.some((q) => k.startsWith(`story.${q}.`)) && k !== 'story.d02.campSeen') delete flags[k];
  }
  for (const k of ['boss.gaffer-grimtooth.outcome', 'world.harrowmark.inn.price']) delete flags[k];
  if (after) {
    Object.assign(flags, ENDING_REACHED);
    flags[M56_CHOICE_FLAG] = choice;
    flags[CAEL_LIVES_FLAG] = true;
    flags[AFTER_ENDING_FLAG] = true;
  }
  return save;
}

