import { describe, expect, it } from 'vitest';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';

// What the plan promises A6b, A7, A9, A12 and A2 (ids or `.1..n` families).
const family = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);
const CONSUMED_ANCHORS = [
  'cinderreach.hushed-anvil.site', 'cinderreach.dell.bed', 'cinderreach.d03.gate', 'cinderreach.scorchhold.keep.door',
  'cinderreach.cinderford.wyrm.approach', 'cinderreach.cinderford.raid.origin', 'cinderreach.cinderford.raid.barricade',
  'cinderreach.m12.refuge.dropoff', 'npc-post.osgar.barricade',
  ...family('cinderreach.cinderford.lane', 3), ...family('cinderreach.cinderford.barricade', 4), ...family('cinderreach.m12.militia', 6),
  ...family('cinderreach.m12.prep', 3), ...family('cinderreach.m12.wounded', 4), ...family('cinderreach.m11.bloom', 3),
  ...family('cinderreach.m14.golem', 2), ...family('cinderreach.hushed-anvil.ledge', 3), ...family('cinderreach.den.ledge', 2),
  ...family('cinderreach.spawn.anvil', 2), ...family('cinderreach.spawn.cinderford', 3), ...family('cinderreach.spawn.road', 4),
  // A6b's ground enemies (merged in #114).
  ...family('cinderreach.spawn.pasture', 3), ...family('cinderreach.spawn.huntercamp', 4), 'cinderreach.spawn.fox.1', 'cinderreach.r05.fox',
  'cinderreach.spawn.scorchhold.7', 'cinderreach.spawn.scorchhold.8',
  ...family('cinderreach.pasture.hollow', 3), ...family('cinderreach.r05.track', 3),
];

const anchors = new Set(CINDERREACH_LAYOUT.anchors.map((a) => a.id));
const triggers = new Set(CINDERREACH_LAYOUT.triggers.map((t) => t.id));

describe('ids other Act 2 threads read', () => {
  it.each(CONSUMED_ANCHORS)('defines anchor %s', (id) => {
    expect(anchors.has(id)).toBe(true);
  });

  it('defines the three fog hollows and the Dell trigger', () => {
    expect(triggers.has('trg.cinderreach.dell')).toBe(true);
    for (const n of [1, 2, 3]) expect(anchors.has(`cinderreach.pasture.hollow.${n}`), String(n)).toBe(true);
  });

  it('keeps every id under the A3 prefixes or a contract name', () => {
    for (const id of [...anchors, ...triggers]) {
      expect(/^(cinderreach\.|trg\.cinderreach\.|waystone\.|npc-post\.|trg\.scorchhold\.|scorchhold\.)/.test(id), id).toBe(true);
    }
  });
});
