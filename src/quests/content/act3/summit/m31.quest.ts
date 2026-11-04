import type { QuestDef } from '../../../types';
import { flagsAll, reads, story } from '../../act2/helpers';

/** The trial's outcome, written once (`won` | `yielded`); the trial step reads it, K15's recap and M52 read it. */
export const M31_CHOICE = 'story.m31.choice';
/** Applied once each: the dragons' favour (+3 won, +8 yielded) and the Surge charge Dragon's Respect grants. */
export const M31_FAVOURED = 'story.m31.favoured';
export const M31_RESPECT = 'story.m31.respectGranted';
export const M31_FAVOUR = { won: 3, yielded: 8 } as const;
export const M31_RESPECT_SOURCE = 'dragons-respect';
/** The trial has been started at least once (the first start is silent; a restart says Ysmeryth calls Cael back). */
export const M31_TRIAL_BEGUN = 'story.m31.trialBegun';
export const M31_AT_GATE = 'story.m31.atGate';
/** Eadgyth has been met at the summit gate: she walks on to the Hearth (a post rule) and stays there. */
export const M31_GATE_MET = 'story.m31.gateMet';
export const M31_LEDGE_FLAGS = ['story.m31.ledge1', 'story.m31.ledge2', 'story.m31.ledge3'] as const;
export const M31_HAWKS_TAG = 'm31.hawks';
export const M31_HAWKS_FLAG = 'story.m31.hawksOut';
export const M31_HAWKS_DOWN = 'story.m31.hawksDown';
/** The claw-scored ledge, the dead hunter's horn and the shed scale. */
export const M31_RELICS = ['note-m31-claws', 'note-m31-horn', 'note-m31-scale'];
export const M31_CLIMB_SCENE = 'scene-m31-climb';
export const M31_CLIMB_NPC = 'scene.m31.climb';
export const M31_BEFORE_SCENE = 'scene-m31-before';
export const M31_BEFORE_NPC = 'scene.m31.before';
export const M31_AFTER_SCENE = 'scene-m31-after';
export const M31_AFTER_NPC = 'scene.m31.after';
/** Cael is back at the Hearth after the trial. */
export const M31_HEARTH = 'story.m31.hearth';
export const M31_ITEM = 'ysmeryths-ember-scale';

/**
 * M31 The Coal-Mother's Trial. Eadgyth, at the Rime Pass shelter, offers it once Greyfen's and the lower slopes' main quests and the cave axe are
 * behind Cael. They ride to the summit gate, she walks on to the Hearth, and Cael climbs the roost (three Leap ledges credited by standing on
 * each top, four hawks, three relics), hears Ysmeryth's "before", and faces her trial: three breaks win it, and after two Cael may yield. Either end
 * is an outcome (`story.m31.choice`); anything else (leaving the arena, a teleport, a load) restarts the trial.
 */
export const m31: QuestDef = {
  id: 'm31',
  titleKey: 'quest.m31.title',
  summaryKey: 'quest.m31.summary',
  sequential: true,
  startWhen: {
    all: ['m23', 'm24', 'm25', 'm26', 'm27', 'd05', 'm28', 'm29', 'm30', 'r16'].map((q) => ({ quest: q, state: 'completed' as const })),
  },
  objectives: [
    { id: 'brief', type: 'talk', target: 'eadgyth', textKey: 'quest.m31.brief' },
    story('gate', 'quest.m31.gate', M31_AT_GATE, { doneWhen: { flag: M31_AT_GATE, equals: true } }),
    { id: 'gatetalk', type: 'talk', target: 'eadgyth', textKey: 'quest.m31.gatetalk' },
    ...M31_LEDGE_FLAGS.map((f, i) => story(`ledge${i + 1}`, `quest.m31.ledge${i + 1}`, f, { doneWhen: { flag: f, equals: true } })),
    { id: 'climb', type: 'talk', target: M31_CLIMB_NPC, textKey: 'quest.m31.climb' },
    story('hawks', 'quest.m31.hawks', M31_HAWKS_DOWN, { doneWhen: { flag: M31_HAWKS_DOWN, equals: true } }),
    reads('relics', 'quest.m31.relics', M31_RELICS),
    { id: 'before', type: 'talk', target: M31_BEFORE_NPC, textKey: 'quest.m31.before' },
    story('trial', 'quest.m31.trial', M31_CHOICE, { doneWhen: { flag: M31_CHOICE } }),
    { id: 'after', type: 'talk', target: M31_AFTER_NPC, textKey: 'quest.m31.after' },
    story('hearth', 'quest.m31.hearth', M31_HEARTH, { doneWhen: { flag: M31_HEARTH, equals: true } }),
    { id: 'report', type: 'talk', target: 'eadgyth', textKey: 'quest.m31.report' },
  ],
  rewards: [{ xp: 750 }, { give: [{ itemId: M31_ITEM, count: 1 }] }],
};

export const M31_LEDGES_DONE = flagsAll([...M31_LEDGE_FLAGS]);
