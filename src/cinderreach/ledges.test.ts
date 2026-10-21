import { describe, expect, it } from 'vitest';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';
import { LEDGE_HEIGHT, ledgeRise } from './ledgeFit';

const ids = ['den.ledge.1', 'den.ledge.2', 'hushed-anvil.ledge.1', 'hushed-anvil.ledge.2', 'hushed-anvil.ledge.3'].map((s) => `cinderreach.${s}`);

describe('Leap ledges', () => {
  it.each(ids)('%s is climbable from its launch anchor (top 1.4 to 1.8 m above the launch ground)', (id) => {
    const top = CINDERREACH_LAYOUT.anchors.find((a) => a.id === id)!;
    const launch = CINDERREACH_LAYOUT.anchors.find((a) => a.id === `${id}.launch`)!;
    expect(top && launch).toBeTruthy();
    const ledge = CINDERREACH_LAYOUT.structures.find((s) => s.role === 'ledge' && Math.abs(s.x - top.x) < 0.01 && Math.abs(s.z - (top.z - 1)) < 0.01)!;
    expect(ledge, id).toBeTruthy();
    const rise = ledgeRise(ledge.x, ledge.z);
    expect(rise).toBeGreaterThanOrEqual(1.4);
    expect(rise).toBeLessThanOrEqual(LEDGE_HEIGHT + 0.001);
  });
});
