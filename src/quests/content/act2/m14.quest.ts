import type { QuestDef } from '../../types';
import { story } from './helpers';

export const M14_MURALS = [1, 2, 3].map((n) => `use:hushed-anvil-mural-${n}`);

/**
 * M14 Hushed Anvil Rites. Aelfreda's briefing, the three ridge ledges, the golems and hounds on the ridge, the
 * rekindling (A9's shrine), the three murals, the lantern-keeper, two tempering runs (A10), the Anvil singing, then the
 * Hearth Rite and the hand-in in one conversation whose last node writes `story.m14.aelfredaJoined` and her bond rank.
 */
export const m14: QuestDef = {
  id: 'm14',
  titleKey: 'quest.m14.title',
  summaryKey: 'quest.m14.summary',
  sequential: true,
  startWhen: { quest: 'm13', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'aelfreda', textKey: 'quest.m14.brief' },
    { id: 'ledge1', type: 'goTo', target: 'trg.q12.leap.hushed.1', textKey: 'quest.m14.ledge1' },
    { id: 'ledge2', type: 'goTo', target: 'trg.q12.leap.hushed.2', textKey: 'quest.m14.ledge2' },
    { id: 'ledge3', type: 'goTo', target: 'trg.q12.leap.hushed.3', textKey: 'quest.m14.ledge3' },
    { id: 'golems', type: 'kill', target: 'cinder-golem', required: 2, spawnTag: 'm14.golems', textKey: 'quest.m14.golems' },
    { id: 'hounds', type: 'kill', target: 'ember-hound', required: 3, spawnTag: 'm14.hounds', textKey: 'quest.m14.hounds' },
    // Lit before this is current (the ledges climbed past the golems, or an earlier visit): credited from A9's shrine flag
    // (`ForgeShrineBinding.flag('hushed-anvil')`) when it becomes current (review-a #2).
    story('rekindle', 'quest.m14.rekindle', 'shrine.rekindled', { match: { shrineId: 'hushed-anvil' }, doneWhen: { flag: 'shrine.hushed-anvil.lit', equals: true } }),
    {
      id: 'murals', type: 'event', target: 'interact', match: { interactableId: M14_MURALS }, dedupeBy: 'interactableId',
      required: 3, textKey: 'quest.m14.murals',
    },
    { id: 'keeper', type: 'talk', target: 'lantern-keeper', textKey: 'quest.m14.keeper' },
    // Tempers done while an earlier objective was current count too: the director saves them as story.m14.tempered.
    story('temper', 'quest.m14.temper', 'gear.tempered', { required: 2, doneWhen: { flag: 'story.m14.tempered', equals: true } }),
    story('sings', 'quest.m14.sings', 'story.m14.set'),
    { id: 'rite', type: 'talk', target: 'aelfreda', textKey: 'quest.m14.rite' },
  ],
  rewards: [{ xp: 550 }],
};
