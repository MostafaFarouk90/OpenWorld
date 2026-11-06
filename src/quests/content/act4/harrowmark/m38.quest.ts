import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { CHAMBER_ID, OCCUPIED_FLAG } from '../../../../harrowmark/act4/sites';

/**
 * The side quests that can still be open at the Council with a step inside the walls (plan 3's inside-the-walls check, in
 * cityClosure.test.ts): Edric's offer warns while any is under way. Act 1's Harrowmark side quests (R03, R04, and D02 under the city) and the
 * city jobs j05 to j11; their in-city steps cannot be done once the city is Vey's (logged for Mostafa's veto).
 */
export const M38_SIDE_JOBS = ['r03', 'r04', 'd02', 'j05', 'j06', 'j07', 'j08', 'j09', 'j10', 'j11'] as const;
export const M38_ENTERED = 'story.m38.entered';
/** The three allies seated in the chamber, spoken to before the case (each read what they carry in). */
export const M38_ALLIES = ['wystan', 'merrin', 'wenna'] as const;
export const M38_EVIDENCE = 'use:m38-evidence';
export const M38_EVIDENCE_FLAG = 'story.m38.evidence';
/** The case is put through Edric at the podium: a one-way talk read from the flags of every earlier quest (Q5: never the outcome). */
export const M38_CASE_NPC = 'scene.m38.case';
export const M38_CASE_SCENE = 'scene-m38-case';
/** L0's sequencer scene: Vey's signal, Aldous rises, the side doors open, six Footmen in, Edric seized and freed. */
export const M38_BETRAYAL = 'm38.betrayal';
export const M38_TURNED = 'story.m38.turned';
export const M38_CHAMBER_GROUP = 'm38.chamber';
export const M38_CHAMBER_DOWN = 'story.m38.chamberDown';
export const M38_NOTES = ['note-m38-list', 'note-m38-seal'] as const;
/** The witness total the case reads (Act 2 and Act 3 spared hunters, plus Redmane and Skarl spared). */
export const M38_WITNESS_SOURCES = ['story.a2.witnesses', 'story.m27.witnesses', 'story.m33.witnesses'] as const;
export const M38_WITNESS_BOSSES = ['boss.thrandil-redmane.outcome', 'boss.corvin-skarl.outcome'] as const;
export { OCCUPIED_FLAG };

/**
 * M38 The Council of Houses (plan 3). Edric's offer warns of what the city will close on; then the chamber, the case put from
 * the podium (every earlier choice is read, none changes the end, Q5), the betrayal scene, the six Footmen and the Keep stairs.
 * From `story.m38.complete` the city is Vey's (L2).
 */
export const m38: QuestDef = {
  id: 'm38',
  titleKey: 'quest.m38.title',
  summaryKey: 'quest.m38.summary',
  sequential: true,
  startWhen: { quest: 'm37', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'edric', textKey: 'quest.m38.brief' },
    story('enter', 'quest.m38.enter', 'interior.entered', { match: { interiorId: CHAMBER_ID }, doneWhen: { flag: M38_ENTERED, equals: true } }),
    ...M38_ALLIES.map((id) => ({ id, type: 'talk' as const, target: id, textKey: `quest.m38.${id}` })),
    { id: 'evidence', type: 'interact', target: M38_EVIDENCE, textKey: 'quest.m38.evidence' },
    { id: 'case', type: 'talk', target: M38_CASE_NPC, textKey: 'quest.m38.case' },
    story('turn', 'quest.m38.turn', M38_TURNED, { doneWhen: { flag: M38_TURNED, equals: true } }),
    story('fight', 'quest.m38.fight', M38_CHAMBER_DOWN, { doneWhen: { flag: M38_CHAMBER_DOWN, equals: true } }),
    reads('search', 'quest.m38.search', M38_NOTES),
    // L2 unlocks the stair door on `story.m38.complete` (and shuts the chamber's front door), so the quest ends on Edric's
    // rally and M39 opens on the stairs
    { id: 'rally', type: 'talk', target: 'edric', textKey: 'quest.m38.rally' },
  ],
  rewards: [{ xp: 1200 }],
};
