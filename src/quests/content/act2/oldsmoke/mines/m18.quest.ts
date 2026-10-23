import type { QuestDef } from '../../../../types';
import { reads, story } from '../../helpers';

export const M18_PIPES_NOTE = 'note-m18-pipes';
/** A9's plaque readable (registered with the puzzle, so M18 credits it instead of a note of its own) and the flag it writes. */
export const BELLOWS_PLAQUE = 'use:bellows-plaque';
export const BELLOWS_PLAQUE_FLAG = 'world.bellows.plaqueRead';
/** A9's puzzle and shrine ids (`puzzle.solved` carries `{ id }`, `shrine.rekindled` carries `{ shrineId }`). */
export const BELLOWS_PUZZLE_ID = 'weeping-bellows';
export const BELLOWS_SHRINE_ID = 'weeping-bellows';
/** A9's flags, read only: the puzzle is solved, the shrine is lit. M18 never writes either. */
export const BELLOWS_SOLVED_FLAG = 'world.bellows.solved';
export const BELLOWS_LIT_FLAG = 'shrine.weeping-bellows.lit';
/** Written when the apprentice's lore has been heard: the crawlers under the cavern wake. */
export const M18_CRAWLERS_FLAG = 'story.m18.crawlersOut';
export const M18_SCENE = 'scene-m18-breath';

/**
 * M18 Breath for the Bellows. Pike has found the Weeping Bellows cold: Cael reads A9's plaque and the pipes, hears the
 * apprentice and Pike explain the six valves, clears the crawlers that nested in the cavern, solves A9's puzzle and lights
 * the shrine. The solve, the lit shrine and the Blessing are A9's: the quest only credits `puzzle.solved` and the
 * rekindle (or the flags A9 left, for a puzzle solved before the quest), and never writes `shrine.weeping-bellows.lit`.
 */
export const m18: QuestDef = {
  id: 'm18',
  titleKey: 'quest.m18.title',
  summaryKey: 'quest.m18.summary',
  sequential: true,
  startWhen: { quest: 'm17', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'pike', textKey: 'quest.m18.brief' },
    story('plaque', 'quest.m18.plaque', 'interact', { match: { interactableId: BELLOWS_PLAQUE }, doneWhen: { flag: BELLOWS_PLAQUE_FLAG, equals: true } }),
    reads('pipes', 'quest.m18.pipes', [M18_PIPES_NOTE]),
    { id: 'apprentice', type: 'talk', target: 'pike-apprentice', textKey: 'quest.m18.apprentice' },
    { id: 'lore', type: 'talk', target: 'pike', textKey: 'quest.m18.lore' },
    { id: 'crawlers', type: 'kill', target: 'slag-crawler', required: 6, spawnTag: 'm18.crawler', textKey: 'quest.m18.crawlers' },
    story('solve', 'quest.m18.solve', 'puzzle.solved', { match: { id: BELLOWS_PUZZLE_ID }, doneWhen: { flag: BELLOWS_SOLVED_FLAG, equals: true } }),
    story('rekindle', 'quest.m18.rekindle', 'shrine.rekindled', { match: { shrineId: BELLOWS_SHRINE_ID }, doneWhen: { flag: BELLOWS_LIT_FLAG, equals: true } }),
    story('breathe', 'quest.m18.breathe', 'dialogue.ended', { match: { dialogueId: M18_SCENE, reason: 'completed' } }),
    { id: 'report', type: 'talk', target: 'pike', textKey: 'quest.m18.report' },
  ],
  rewards: [{ xp: 550 }],
};
