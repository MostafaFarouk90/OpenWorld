// Two interactables on one anchor sit at the same distance from the player, so the lower id always wins the focus and the
// other can never be used. No quest prop or note of Phase D may share an anchor with another (the Cinderreach rule).
import { describe, expect, it } from 'vitest';
import { ACT2_PROPS, ACT2_NOTE_LIST } from '../index';

describe('Phase D interactables do not share anchors', () => {
  it('each prop and note stands alone on its anchor', () => {
    const seen = new Map<string, string>();
    const all = [...ACT2_PROPS.map((p) => [p.interactableId, p.anchorId] as const), ...ACT2_NOTE_LIST.map((n) => [n.id, n.anchorId] as const)];
    const clashes: string[] = [];
    for (const [id, anchor] of all) {
      if (seen.has(anchor)) clashes.push(`${id} and ${seen.get(anchor)} on ${anchor}`);
      seen.set(anchor, id);
    }
    expect(clashes.filter((c) => /m1[6]|r09|r10|m21|m22|oldsmoke/.test(c))).toEqual([]);
  });
});
