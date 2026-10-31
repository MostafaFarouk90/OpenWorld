import type { QuestDef } from '../../../types';
import { reads } from '../../act2/helpers';

/** The five trophies on Eadgyth's wall, in order: a dragon tooth, an old harpoon, a child's drawing, a map of old roosts, a hunting tally. */
export const M29_TROPHIES = ['note-m29-tooth', 'note-m29-harpoon', 'note-m29-drawing', 'note-m29-map', 'note-m29-tally'];
export const M29_HAWKS_TAG = 'm29.hawks';
export const M29_HAWKS_FLAG = 'story.m29.hawksOut';
export const M29_HAWKS_DOWN = 'story.m29.hawksDown';
export const M29_WOOD = 'use:m29-wood';
export const M29_WOOD_FLAG = 'story.m29.wood';
export const M29_FIRE = 'use:m29-fire';
export const M29_FIRE_FLAG = 'story.m29.fire';
export const M29_CONFESSION_SCENE = 'scene-m29-confession';
export const M29_CONFESSION_NPC = 'scene.m29.confession';

/**
 * M29 The Hermit of Rime Pass. Eadgyth Frostbrow keeps the shelter on the pass; Cael reads her five trophies, gathers her wood
 * (two hawks nest by the pile), lights her fire and hears, by it, what she did. Plain quest: no choice, no favour.
 */
export const m29: QuestDef = {
  id: 'm29',
  titleKey: 'quest.m29.title',
  summaryKey: 'quest.m29.summary',
  sequential: true,
  startWhen: { quest: 'm28', state: 'completed' },
  objectives: [
    { id: 'greet', type: 'talk', target: 'eadgyth', textKey: 'quest.m29.greet' },
    reads('trophies', 'quest.m29.trophies', M29_TROPHIES),
    { id: 'hawks', type: 'event', target: M29_HAWKS_DOWN, textKey: 'quest.m29.hawks', doneWhen: { flag: M29_HAWKS_DOWN, equals: true } },
    { id: 'wood', type: 'event', target: 'interact', match: { interactableId: M29_WOOD }, textKey: 'quest.m29.wood', doneWhen: { flag: M29_WOOD_FLAG, equals: true } },
    { id: 'fire', type: 'event', target: 'interact', match: { interactableId: M29_FIRE }, textKey: 'quest.m29.fire', doneWhen: { flag: M29_FIRE_FLAG, equals: true } },
    { id: 'firetalk', type: 'talk', target: 'eadgyth', textKey: 'quest.m29.firetalk' },
    { id: 'confession', type: 'talk', target: M29_CONFESSION_NPC, textKey: 'quest.m29.confession' },
    { id: 'report', type: 'talk', target: 'eadgyth', textKey: 'quest.m29.report' },
  ],
  rewards: [{ xp: 600 }, { give: [{ itemId: 'frostbrows-hunting-knife', count: 1 }] }],
};

