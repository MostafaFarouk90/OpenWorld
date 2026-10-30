import { describe, expect, it } from 'vitest';
import { SHRINE_POSITIONS } from '../../map/ForgeMarks';
import { GREYFEN_LAYOUT } from '../../greyfen/greyfen.layout';
import { DRAGONSPINE_LAYOUT } from '../../dragonspine/dragonspine.layout';
import type { LayoutData } from '../../region/layoutTypes';

// The map's forge marks must sit on the shrine sites K3 and K4 placed (plan act3-K9 section 4).
const site = (layout: LayoutData, id: string) => {
  const a = layout.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`missing anchor ${id}`);
  return a;
};

describe('Act 3 SHRINE_POSITIONS', () => {
  it.each([
    ['hathrens-mere', GREYFEN_LAYOUT, 'greyfen.mere.shrine'],
    ['last-anvil', DRAGONSPINE_LAYOUT, 'dragonspine.anvil.shrine'],
  ] as const)('%s is within 30 m of its site anchor', (id, layout, anchorId) => {
    const mark = SHRINE_POSITIONS[id]!;
    const a = site(layout, anchorId);
    expect(Math.hypot(mark.x - a.x, mark.z - a.z)).toBeLessThanOrEqual(30);
  });

  it('every site anchor K9 waits for exists in the layouts', () => {
    for (const id of ['greyfen.mere.shrine', 'waystone.hathrens-mere']) expect(() => site(GREYFEN_LAYOUT, id)).not.toThrow();
    const spine = ['dragonspine.anvil.shrine', 'waystone.last-anvil'];
    for (let n = 1; n <= 6; n++) spine.push(`dragonspine.anvil.carving.${n}`, `dragonspine.wayside.${n}`);
    for (const id of spine) expect(() => site(DRAGONSPINE_LAYOUT, id)).not.toThrow();
  });
});
