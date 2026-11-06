import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';

export const M39_STAIRHEAD = 'm39.stairhead';
export const M39_STAIRHEAD_DOWN = 'story.m39.stairheadDown';
export const M39_BARRICADE = 'use:m39-barricade';
export const M39_BARRICADE_FLAG = 'story.m39.barricade';
export const M39_WAVES = 'm39.stairs';
export const M39_HELD = 'story.m39.held';
/** The champion's guard on the last landing (L2's group), spawned when the fourth wave falls; cleared, the stair is held. */
export const M39_GUARD = 'm39.guard';
/** L0's sequencer scene: the champion, the blow, the sword handed over, Gaut's last line. */
export const M39_FALL = 'm39.fall';
export const M39_FALLEN = 'story.m39.fallen';
export const M39_NOTE_TOKEN = 'note-m39-token';
/** Gaut's word between the second and third waves (a one-way talk at the barricade). */
export const M39_BREATH_NPC = 'scene.m39.breath';
export const M39_BREATH_SCENE = 'scene-m39-breath';
export const M39_RESPAWN_ID = 'm39.stairs';

/**
 * M39 Gaut's Last Stand (plan 3). Gaut on the top landing; the four at the stair-head; the barricade shut; four waves up the
 * flights (Gaut holds beside Cael and is never killed by them); a word between the waves; the champion and Gaut's fall; his
 * token, then the King at the stair foot. Completion retires Gaut everywhere and gives the Oathblade (Q3) in the form Cael's class carries.
 */
export const m39: QuestDef = {
  id: 'm39',
  titleKey: 'quest.m39.title',
  summaryKey: 'quest.m39.summary',
  sequential: true,
  startWhen: { quest: 'm38', state: 'completed' },
  objectives: [
    { id: 'gaut', type: 'talk', target: 'gaut', textKey: 'quest.m39.gaut' },
    story('stairhead', 'quest.m39.stairhead', M39_STAIRHEAD_DOWN, { doneWhen: { flag: M39_STAIRHEAD_DOWN, equals: true } }),
    { id: 'barricade', type: 'interact', target: M39_BARRICADE, textKey: 'quest.m39.barricade' },
    story('hold', 'quest.m39.hold', M39_HELD, { doneWhen: { flag: M39_HELD, equals: true } }),
    story('fall', 'quest.m39.fall', M39_FALLEN, { doneWhen: { flag: M39_FALLEN, equals: true } }),
    reads('token', 'quest.m39.token', [M39_NOTE_TOKEN]),
    { id: 'edric', type: 'talk', target: 'edric', textKey: 'quest.m39.edric' },
  ],
  rewards: [{ xp: 1300 }],
};
