import { describe, expect, it } from 'vitest';
import { StubDocument } from './dom';
import { StructureBar } from './StructureBar';

const make = () => new StructureBar(new StubDocument(), { structure: () => ({ kind: 'cart', maxHealth: 100 }) });

describe('StructureBar.suppress (Act 5 N9)', () => {
  it('without a predicate the bar behaves as before', () => {
    const b = make();
    b.damaged('s.cart.1.1', 100);
    b.damaged('s.gate', 100);
    expect(b.count).toBe(2);
  });
  it('skips matching structures, drops rows already showing, and restores on null', () => {
    const b = make();
    b.damaged('s.gate', 100);
    b.damaged('s.cart.1.1', 100);
    b.suppress((id) => id.includes('gate'));
    expect(b.count).toBe(1);
    b.damaged('s.gate', 50);
    expect(b.count).toBe(1);
    b.suppress(null);
    b.damaged('s.gate', 50);
    expect(b.count).toBe(2);
  });
});
