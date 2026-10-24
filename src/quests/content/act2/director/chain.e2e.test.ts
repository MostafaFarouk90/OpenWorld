// Wiring checks with every real plugin booted: the trigger volumes exist and the real quest manager chains M11 into M12.
// This is NOT the headless chain test through Phase C that A12's brief asked for: that run is #122's
// src/integration/phaseC.ts, driven by phaseC.runA.e2e.test.ts and phaseC.runB.e2e.test.ts (review-a #10).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootChapter, type ChapterHarness } from '../../../../integration/chapterHarness';
import { ACT2_TRIGGERS } from '../triggers';

let h: ChapterHarness;
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  h = await bootChapter();
});
afterEach(() => {
  h.dispose();
  vi.restoreAllMocks();
});

describe('Cinderreach quest wiring with every real plugin (the Phase C chain itself: integration/phaseC.run*.e2e)', () => {
  it('registers every trg.q12 volume the quests name', async () => {
    for (const t of ACT2_TRIGGERS) expect(h.triggerCentre(t.id), t.id).not.toBeNull();
  });

  it('M12 starts once M11 is done (real quest manager)', async () => {
    const q = h.ctx.services.get('quests') as any;
    for (const id of ['m01', 'm02', 'm03', 'm04', 'm05', 'r01', 'r02', 'm06', 'm07', 'm08', 'm09', 'm10', 'r03', 'r04', 'd02', 'm11']) {
      q.start(id); q.complete(id);
    }
    expect(q.start('m12')).toBe(true);
    expect(q.state('m12')).toBe('active');
  });
});
