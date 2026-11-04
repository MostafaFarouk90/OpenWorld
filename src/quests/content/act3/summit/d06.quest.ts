import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';

/** K4 reads these (src/dragonspine/flags.ts, pinned by a test): the keep door opens on `started`, the gate on `gateOpen`, the drake roosts on `complete`. */
export const D06_STARTED = 'story.d06.started';
export const D06_GATE_OPEN = 'story.d06.gateOpen';
export const D06_COMPLETE = 'story.d06.complete';
/** Cael has come down at the Aerie by glide (a landing at the landing area) or is inside its arrival volume. */
export const D06_LANDED = 'story.d06.landed';
/** The courtyard's twelve are down (the group's `down` flag; the lines scene is offered next). */
export const D06_COURTYARD_CLEAR = 'story.d06.courtyardClear';
/** The courtyard scene has ended (completed); K8's Skarl arms on this, not on `courtyardClear`, so the scene never opens on top of the boss intro. Re-derived from the objective. */
export const D06_LINES_DONE = 'story.d06.linesDone';
export const D06_LED_OFF = 'story.d06.ledOff';
export const D06_HAWK_FLAG = 'story.d06.hawkFreed';
export const D06_HAWK_PROP = 'use:aerie-hawk-cage';
export const D06_WINCH_PROP = 'use:aerie-winch';
export const D06_SKARL_OUTCOME = 'boss.corvin-skarl.outcome';
export const D06_KEEP = ['note-d06-orders', 'note-d06-ledger', 'note-d06-letter'];
export const D06_AERIE = ['note-d06-nests', 'note-d06-tally'];
export const D06_FEED_LOG = ['note-d06-feedlog'];
export const D06_HUNTERS_TAG = 'd06.courtyard';
export const D06_ARM_FLAG = 'story.d06.courtyardOut';
export const D06_GROUP = 'dragonspine.q.d06.courtyard';
export const D06_LIP_SCENE = 'scene-d06-lip';
export const D06_LIP_NPC = 'scene.d06.lip';
export const D06_LINES_SCENE = 'scene-d06-aerie';
export const D06_LINES_NPC = 'scene.d06.aerie';
export const D06_OUTCOME_SCENE = 'scene-d06-outcome';
export const D06_OUTCOME_NPC = 'scene.d06.outcome';
export const D06_ITEM = 'skarls-crossbow';

/**
 * D06 Wings of Frostfang. Thorgar sends Cael over the chasm by glide to the Frostfang Aerie. Cael turns the gate winch first (it stands outside the wall, and
 * the keep, the cage and the lists are all inside it), speaks to the captive hunter in the keep, reads the keep's papers and the Aerie's lists,
 * frees the caged hawk, clears the courtyard (eight hunters and four wall
 * harpooners, one group) and faces Hunt-Marshal Skarl (K8's fight, K8's favour). The outcome is read from the boss registry's flag.
 */
export const d06: QuestDef = {
  id: 'd06',
  titleKey: 'quest.d06.title',
  summaryKey: 'quest.d06.summary',
  sequential: true,
  startWhen: { quest: 'm34', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'thorgar', textKey: 'quest.d06.brief' },
    { id: 'lip', type: 'talk', target: D06_LIP_NPC, textKey: 'quest.d06.lip' },
    story('land', 'quest.d06.land', D06_LANDED, { doneWhen: { flag: D06_LANDED, equals: true } }),
    { id: 'winch', type: 'event', target: 'interact', match: { interactableId: D06_WINCH_PROP }, textKey: 'quest.d06.winch', doneWhen: { flag: D06_GATE_OPEN, equals: true } },
    { id: 'captive', type: 'talk', target: 'captive-hunter', textKey: 'quest.d06.captive' },
    reads('keep', 'quest.d06.keep', D06_KEEP),
    reads('aerie', 'quest.d06.aerie', D06_AERIE),
    { id: 'hawk', type: 'event', target: 'interact', match: { interactableId: D06_HAWK_PROP }, textKey: 'quest.d06.hawk', doneWhen: { flag: D06_HAWK_FLAG, equals: true } },
    story('courtyard', 'quest.d06.courtyard', D06_COURTYARD_CLEAR, { doneWhen: { flag: D06_COURTYARD_CLEAR, equals: true } }),
    { id: 'lines', type: 'talk', target: D06_LINES_NPC, textKey: 'quest.d06.lines' },
    story('skarl', 'quest.d06.skarl', D06_SKARL_OUTCOME, { doneWhen: { flag: D06_SKARL_OUTCOME } }),
    { id: 'outcome', type: 'talk', target: D06_OUTCOME_NPC, textKey: 'quest.d06.outcome' },
    reads('feed', 'quest.d06.feed', D06_FEED_LOG),
    { id: 'report', type: 'talk', target: 'thorgar', textKey: 'quest.d06.report' },
  ],
  rewards: [{ xp: 1000 }, { give: [{ itemId: D06_ITEM, count: 1 }] }],
};

