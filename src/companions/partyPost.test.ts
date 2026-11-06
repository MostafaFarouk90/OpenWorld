// v0.8 item 10: the benched companions' post moves from the Tilted Anvil to the Ashgate refuge at the betrayal.
import { describe, expect, it } from 'vitest';
import { PARTY_POST_MOVES_FLAG, partyPost } from './CompanionController';

describe('partyPost', () => {
  it('is the Tilted Anvil without flags or before M38, the M41 camp after, the refuge after M41 (L4)', () => {
    expect(partyPost('hrolf')).toBe('npc-post.hrolf.tilted-anvil');
    expect(partyPost('hrolf', { getFlag: () => undefined })).toBe('npc-post.hrolf.tilted-anvil');
    expect(partyPost('hrolf', { getFlag: (k) => k === PARTY_POST_MOVES_FLAG })).toBe('harrowmark.a4.m41.camp.companions.hrolf');
    const both = new Set([PARTY_POST_MOVES_FLAG, 'story.m41.complete']);
    expect(partyPost('hrolf', { getFlag: (k) => both.has(k) })).toBe('ashgate.refuge.companions.hrolf');
  });
});
