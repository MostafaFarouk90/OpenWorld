import { describe, expect, it } from 'vitest';
import { CALDERA_PLACES, MAP_ACT5_STRINGS_EN, calderaLabels, siegeLive } from './calderaLayer';

// The Caldera box is x 9500..12500, z 6500..9500; the Rim Gate and the stairs sit just below it (the stairs leave the box).
const CALDERA_BOX_CHECK = { x0: 9500, x1: 12500, z0: 6000, z1: 9500 };
const t = (k: string): string => MAP_ACT5_STRINGS_EN[k] ?? k;
const ports = (over: Partial<Parameters<typeof calderaLabels>[0]> = {}) => ({ open: ['caldera'], isRevealed: () => true, flag: () => false, t, ...over });

describe('calderaLabels', () => {
  it('shows nothing while the Caldera is shut', () => {
    expect(calderaLabels(ports({ open: ['ashen-waste'] }))).toEqual([]);
  });
  it('shows only revealed places (or discovered), with unique ids and names', () => {
    const all = calderaLabels(ports());
    expect(all).toHaveLength(CALDERA_PLACES.length);
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
    const some = calderaLabels(ports({ isRevealed: (_x, z) => z === 8000 }));
    expect(some.map((l) => l.text)).toEqual(['Anvil of Ages']);
  });
  it('a throwing fog test shows nothing and does not throw', () => {
    expect(calderaLabels(ports({ isRevealed: () => { throw new Error('x'); } }))).toEqual([]);
  });
  it('the Rim Gate reads "under siege" while M52 runs and only then', () => {
    const gate = (flag: (k: string) => boolean) => calderaLabels(ports({ flag })).find((l) => l.id === 'place.rim-gate')!.text;
    expect(gate(() => false)).toBe('Rim Gate');
    expect(gate((k) => k === 'story.m52.started')).toBe('Rim Gate (under siege)');
    expect(gate((k) => k === 'story.m52.started' || k === 'story.m52.complete')).toBe('Rim Gate');
    expect(siegeLive(() => { throw new Error('x'); })).toBe(false);
  });
  it('every place sits in or at the foot of the Caldera box and has a name string', () => {
    for (const p of CALDERA_PLACES) {
      expect(p.x, p.id).toBeGreaterThanOrEqual(CALDERA_BOX_CHECK.x0);
      expect(p.x, p.id).toBeLessThanOrEqual(CALDERA_BOX_CHECK.x1);
      expect(p.z, p.id).toBeGreaterThanOrEqual(CALDERA_BOX_CHECK.z0);
      expect(p.z, p.id).toBeLessThanOrEqual(CALDERA_BOX_CHECK.z1);
      expect(MAP_ACT5_STRINGS_EN[`map.place.${p.id}`], p.id).toBeTruthy();
    }
  });
});
