// v0.8 item 9b: interior-to-interior links are checked at registration (the move itself is the shipped
// `interiors.transfer`, pinned in InteriorController.test.ts: the saved door, the aggro refusal).
import { describe, expect, it } from 'vitest';
import { INTERIOR_LINKS, validateInteriorLinks } from './interiors.plugin';
import type { InteriorDef } from './types';

const def = (id: string, doors: InteriorDef['doors']): InteriorDef => ({ id, doors } as unknown as InteriorDef);
const KEEP = def('keep', [{ doorId: 'keep-front', outside: 'o', inside: 'i', exit: 'e' }]);
const DEEP = def('keep-deep', [{ doorId: 'keep-deep-stair', outside: 'o2', inside: 'i2', exit: 'e2', outsideInteractable: false }]);
const link = (over: Partial<{ id: string; fromI: string; toI: string; door: string }> = {}) => ({
  id: over.id ?? 'stairs',
  from: { interior: over.fromI ?? 'keep', anchor: 'keep.stairs.down' },
  to: { interior: over.toI ?? 'keep-deep', doorId: over.door ?? 'keep-deep-stair' },
});

describe('validateInteriorLinks', () => {
  it('accepts a link to a scripted (no outside interactable) door', () => {
    expect(() => validateInteriorLinks([link()], [KEEP, DEEP])).not.toThrow();
  });
  it('rejects an unknown door, an unknown interior, a self link, a duplicate id, and a door with an outside interactable', () => {
    expect(() => validateInteriorLinks([link({ door: 'nope' })], [KEEP, DEEP])).toThrow(/unknown door/);
    expect(() => validateInteriorLinks([link({ toI: 'gone' })], [KEEP, DEEP])).toThrow(/unknown interior/);
    expect(() => validateInteriorLinks([link({ fromI: 'gone' })], [KEEP, DEEP])).toThrow(/unknown interior/);
    expect(() => validateInteriorLinks([link({ toI: 'keep', door: 'keep-front' })], [KEEP, DEEP])).toThrow(/same interior/);
    expect(() => validateInteriorLinks([link(), link()], [KEEP, DEEP])).toThrow(/duplicate/);
    expect(() => validateInteriorLinks([link({ fromI: 'keep-deep', toI: 'keep', door: 'keep-front' })], [KEEP, DEEP])).toThrow(/outsideInteractable/);
  });
  it('ships empty (L10 adds the Keep links)', () => {
    expect(INTERIOR_LINKS).toEqual([]);
  });
});
