import type { QuestDef } from '../../types';
import { reads, story } from './helpers';

export const R11_CAMP = ['note-r11-camp-1', 'note-r11-camp-2', 'note-r11-camp-3'];
export const R11_AXE = 'use:r11-axe';

/**
 * R11 Hrolf's Brother's Axe. Hrolf's story, the widow, the brother's last camp, the two den ledges, the den scene, the
 * hounds and the wyrm (A6a spawns `wyrm.r11.den` when the quest starts). The choice is the outcome: Spare or Calm on
 * the wyrm means `spared`, its death means `slain` (`r11Outcome`); the director writes `story.r11.choice`, pays the
 * favour and despawns the group, in that order.
 */
export const r11: QuestDef = {
  id: 'r11',
  titleKey: 'quest.r11.title',
  summaryKey: 'quest.r11.summary',
  sequential: true,
  startWhen: { quest: 'm13', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'hrolf', textKey: 'quest.r11.brief' },
    { id: 'widow', type: 'talk', target: 'wynne', textKey: 'quest.r11.widow' },
    reads('camp', 'quest.r11.camp', R11_CAMP),
    { id: 'ledge1', type: 'goTo', target: 'trg.q12.leap.den.1', textKey: 'quest.r11.ledge1' },
    { id: 'ledge2', type: 'goTo', target: 'trg.q12.leap.den.2', textKey: 'quest.r11.ledge2' },
    story('den', 'quest.r11.den', 'dialogue.ended', { match: { dialogueId: 'scene-r11-den', reason: 'completed' } }),
    { id: 'hounds', type: 'kill', target: 'ember-hound', required: 4, spawnTag: 'r11.hounds', textKey: 'quest.r11.hounds' },
    { id: 'wyrm', type: 'kill', target: 'ember-wyrm', spawnTag: 'r11.den', textKey: 'quest.r11.wyrm' },
    { id: 'axe', type: 'interact', target: R11_AXE, textKey: 'quest.r11.axe' },
    { id: 'report', type: 'talk', target: 'hrolf', textKey: 'quest.r11.report' },
  ],
  rewards: [{ xp: 450 }],
};
