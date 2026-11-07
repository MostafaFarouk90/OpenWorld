import { describe, expect, it } from 'vitest';
import { ACT_ENDINGS, actEnding } from '../integration/actEndings';
import { barksHeldForActEnding } from './actEndingHold';

const flags = (on: string[]) => (k: string) => on.includes(k);

describe('barksHeldForActEnding (L4: no bark over the camp scene)', () => {
  const a4 = actEnding(4)!;
  it('holds from the Act 4 gate until its camp is seen', () => {
    expect(barksHeldForActEnding(flags([]))).toBe(false);
    expect(barksHeldForActEnding(flags([a4.gateFlag]))).toBe(true);
    expect(barksHeldForActEnding(flags([a4.gateFlag, a4.campSeenFlag]))).toBe(false);
  });
  it('holds for Act 3 too (it also moves the party before its camp)', () => {
    const a3 = actEnding(3)!;
    expect(a3.campAnchorId).toBeTruthy();
    expect(barksHeldForActEnding(flags([a3.gateFlag]))).toBe(true);
  });
  it('never holds for a row without a camp anchor, so an old save with an unseen camp is never left silent', () => {
    for (const r of ACT_ENDINGS.filter((x) => !x.campAnchorId)) {
      expect(barksHeldForActEnding(flags([r.gateFlag]))).toBe(false);
    }
  });
  it('a completed run (every gate and camp set) holds nothing', () => {
    const all = ACT_ENDINGS.flatMap((r) => [r.gateFlag, r.campSeenFlag]);
    expect(barksHeldForActEnding(flags(all))).toBe(false);
  });
});
