import { describe, expect, it } from 'vitest';
import { synthStem } from './stemSynth';
import { BARLEY_AND_BRAZIER, loopSamples } from './tracks';

const SR = 8000;
const L = loopSamples(BARLEY_AND_BRAZIER, SR);

describe('synthStem', () => {
  for (const id of BARLEY_AND_BRAZIER.stems) {
    describe(id, () => {
      const a = synthStem(BARLEY_AND_BRAZIER, id, SR);

      it('is exactly loopSamples long', () => {
        expect(a).toBeInstanceOf(Float32Array);
        expect(a.length).toBe(L);
      });
      it('is deterministic', () => {
        const b = synthStem(BARLEY_AND_BRAZIER, id, SR);
        expect(b.length).toBe(a.length);
        let same = true;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) same = false;
        expect(same).toBe(true);
      });
      it('has no NaN, |x| <= 1, and is not silent', () => {
        let peak = 0;
        let finite = true;
        for (let i = 0; i < a.length; i++) {
          if (!Number.isFinite(a[i])) finite = false;
          peak = Math.max(peak, Math.abs(a[i]));
        }
        expect(finite).toBe(true);
        expect(peak).toBeLessThanOrEqual(1);
        expect(peak).toBeGreaterThan(0.05);
      });
      it('wraps continuously at the loop seam', () => {
        let maxStep = 0;
        for (let i = 1; i < a.length; i++) maxStep = Math.max(maxStep, Math.abs(a[i] - a[i - 1]));
        const seam = Math.abs(a[0] - a[a.length - 1]);
        expect(seam).toBeLessThanOrEqual(maxStep);
      });
    });
  }

  const halvesDiffer = (id: string): void => {
    const a = synthStem(BARLEY_AND_BRAZIER, id, SR);
    const half = Math.floor(L / 2);
    let diff = 0;
    for (let i = 0; i < half; i++) diff = Math.max(diff, Math.abs(a[i] - a[i + half]));
    expect(diff).toBeGreaterThan(0.01);
  };
  it('melody A and B halves differ', () => halvesDiffer('melody'));
  it('hat A and B halves differ', () => halvesDiffer('hat'));

  it('throws for an unknown stem id', () => {
    expect(() => synthStem(BARLEY_AND_BRAZIER, 'banjo', SR)).toThrow(/banjo/);
  });
});
