import type { ObjectiveDef, QuestDef } from '../quests/types';
import { BEATS } from './beats';
import { stepRequired } from './goals';
import type { BeatId } from './types';

/** The `tutorial.goal` objective of one beat step (the director emits one event per earned unit). */
export function stepObjective(beat: BeatId, step: number, textKey: string = `tutorial.${beat}.o${step + 1}`): ObjectiveDef {
  return {
    id: `o${step + 1}`,
    type: 'event',
    target: 'tutorial.goal',
    match: { beatId: beat, step },
    required: stepRequired(BEATS[beat].steps[step]),
    textKey,
  };
}

/**
 * One marker quest per tutorial beat: one `event` objective per beat step, credited by the director's
 * `tutorial.goal` events (the tracker shows p/required). The director still completes the quest itself
 * with completeQuest. t03 and t12 are owned by thread 3 and are not defined here.
 */
const marker = (beat: BeatId, questId: string = beat): QuestDef => ({
  id: questId,
  titleKey: `tutorial.${beat}.title`,
  summaryKey: `tutorial.${beat}.summary`,
  sequential: true,
  objectives: BEATS[beat].steps.map((_, i) => stepObjective(beat, i)),
});

export const TUTORIAL_QUEST_BEATS = [
  't01', 't02', 't04', 't05', 't06', 't07', 't08', 't09', 't10', 't11', 't13', 't14', 't15', 'skirmish',
] as const;

export const TUTORIAL_QUESTS: QuestDef[] = TUTORIAL_QUEST_BEATS.map((b) => marker(b, b === 'skirmish' ? 't-skirmish' : b));
