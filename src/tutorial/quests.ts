import type { QuestDef } from '../quests/types';

/**
 * One marker quest per tutorial beat (the director completes `o1` itself with completeObjective;
 * nothing ever emits the interact target). t03 and t12 are owned by thread 3 and are not defined here.
 */
const marker = (beat: string, questId: string = beat): QuestDef => ({
  id: questId,
  titleKey: `tutorial.${beat}.title`,
  summaryKey: `tutorial.${beat}.summary`,
  objectives: [{ id: 'o1', type: 'interact', target: `use:tutorial-${beat}`, textKey: `tutorial.${beat}.o1` }],
});

export const TUTORIAL_QUEST_BEATS = [
  't01', 't02', 't04', 't05', 't06', 't07', 't08', 't09', 't10', 't11', 't13', 't14', 't15', 'skirmish',
] as const;

export const TUTORIAL_QUESTS: QuestDef[] = TUTORIAL_QUEST_BEATS.map((b) => marker(b, b === 'skirmish' ? 't-skirmish' : b));
