// v0.8 item 10: the benched companions' post moves from the Tilted Anvil to the Ashgate refuge at the betrayal.
import { describe, expect, it } from 'vitest';
import { PARTY_POST_MOVES_FLAG, partyPost } from './CompanionController';

describe('partyPost', () => {
  it('is the Tilted Anvil without flags or before M38, the refuge after', () => {
    expect(partyPost('hrolf')).toBe('npc-post.hrolf.tilted-anvil');
    expect(partyPost('hrolf', { getFlag: () => undefined })).toBe('npc-post.hrolf.tilted-anvil');
    expect(partyPost('hrolf', { getFlag: (k) => k === PARTY_POST_MOVES_FLAG })).toBe('ashgate.refuge.companions.hrolf');
  });
});
