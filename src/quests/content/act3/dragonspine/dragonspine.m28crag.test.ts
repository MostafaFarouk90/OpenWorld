import { describe, expect, it } from 'vitest';
import { M28_CRAG_OPTIONS } from '../../../../enemies/act3Spawners';
import { DRAGONSPINE_SPAWNERS } from './spawners';

describe('M28 crag group carries K6b crag balance', () => {
  const crag = DRAGONSPINE_SPAWNERS.find((s) => s.id === 'dragonspine.q.m28.crag');

  it('the crag group passes every M28_CRAG_OPTIONS field', () => {
    expect(crag).toBeDefined();
    expect(crag!.options).toMatchObject(M28_CRAG_OPTIONS);
  });

  it('no other lower Dragonspine group picks up the crag wave limit', () => {
    for (const s of DRAGONSPINE_SPAWNERS) if (s.id !== 'dragonspine.q.m28.crag') expect((s.options as { waveSize?: number } | undefined)?.waveSize).toBeUndefined();
  });

  it('the R18 parents keep their own softened stoop', () => {
    const parents = DRAGONSPINE_SPAWNERS.find((s) => s.id === 'dragonspine.q.r18.parents');
    expect((parents!.options as { damageScale?: number }).damageScale).toBe(0.35);
  });
});
