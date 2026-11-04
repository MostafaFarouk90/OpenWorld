import type { QuestDef } from '../../types';

/**
 * j11 The Crates' Cart Tracks (side job, after D02; the Sewer Master Key D02 pays opens the grate). Rook remembers a spur
 * off the Underways where the carts turned aside. With the key Cael opens the grate (it refuses without it, see
 * src/interiors/keyedGrates.ts), follows the cart tracks to two marks, puts down the two hounds that guard the end, reads the
 * waybill nailed there (it points at Vey's Crucible and says nothing of what the carts carried) and tells Rook.
 */
export const j11: QuestDef = {
  id: 'j11',
  titleKey: 'quest.j11.title',
  summaryKey: 'quest.j11.summary',
  startWhen: { quest: 'd02', state: 'completed' },
  objectives: [
    { id: 'listen', type: 'talk', target: 'rook', textKey: 'quest.j11.listen' },
    // the keyed grate (interiors plugin) writes `world.underways.cartway` when the key turns; the objective reads it, so a grate
    // opened before Rook's word still counts
    {
      id: 'grate', type: 'event', target: 'interact', match: { interactableId: 'use:j11-grate' }, doneWhen: { flag: 'world.underways.cartway' },
      textKey: 'quest.j11.grate', when: { objective: ['j11', 'listen'], done: true },
    },
    { id: 'track1', type: 'goTo', target: 'trg.underways.j11-track-1', textKey: 'quest.j11.track1', when: { objective: ['j11', 'grate'], done: true } },
    { id: 'track2', type: 'goTo', target: 'trg.underways.j11-track-2', textKey: 'quest.j11.track2', when: { objective: ['j11', 'track1'], done: true } },
    { id: 'hounds', type: 'kill', target: 'ember-hound', required: 2, spawnTag: 'j11.hounds', textKey: 'quest.j11.hounds' },
    { id: 'waybill', type: 'talk', target: 'note-j11-waybill', textKey: 'quest.j11.waybill', when: { objective: ['j11', 'hounds'], done: true } },
    { id: 'report', type: 'talk', target: 'rook', textKey: 'quest.j11.report', when: { objective: ['j11', 'waybill'], done: true } },
  ],
  rewards: [{ xp: 60 }, { giveGold: 25 }],
};
