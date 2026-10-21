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

describe('Cinderreach quests with every real plugin', () => {
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
