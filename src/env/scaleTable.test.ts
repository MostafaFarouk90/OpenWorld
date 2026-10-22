import { describe, expect, it } from 'vitest';
import { auditSize, doorwayOk, KNIGHT_HEIGHT, SCALE_TOLERANCE, TARGETS, treeHeightOk, WORLD_SIZES } from './scaleTable';

describe('scale table', () => {
  it('has targets for the starter set', () => {
    for (const id of ['oak-a', 'birch-a', 'bush-round-a', 'hedge-straight', 'haystack-round', 'haycart-a', 'signpost-a']) {
      expect(TARGETS[id], id).toBeDefined();
    }
  });

  it('every target is positive and finite', () => {
    for (const [id, s] of Object.entries(TARGETS)) {
      for (const v of [s.w, s.d, s.h]) expect(v > 0 && Number.isFinite(v), id).toBe(true);
    }
  });

  it('accepts an exact and a near size', () => {
    const t = TARGETS['haystack-round'];
    expect(auditSize('haystack-round', t).ok).toBe(true);
    expect(auditSize('haystack-round', { w: t.w * 1.1, d: t.d * 0.92, h: t.h }).ok).toBe(true);
  });

  it('rejects a size outside tolerance and names the axis', () => {
    const t = TARGETS['oak-a'];
    const r = auditSize('oak-a', { w: t.w, d: t.d, h: 5.1 });
    expect(r.ok).toBe(false);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/^h 5\.10 m/);
  });

  it('fails an unknown id and a degenerate size', () => {
    expect(auditSize('no-such-thing', { w: 1, d: 1, h: 1 }).ok).toBe(false);
    expect(auditSize('oak-a', { w: 0, d: 1, h: NaN }).ok).toBe(false);
  });

  it('keeps the world sizes the plan fixes', () => {
    expect(KNIGHT_HEIGHT).toBe(1.8);
    expect(WORLD_SIZES.fence).toBe(1.6);
    expect(SCALE_TOLERANCE).toBeGreaterThan(0);
    expect(treeHeightOk(5.1)).toBe(false);
    expect(treeHeightOk(10)).toBe(true);
  });

  it('judges doorways by clear opening', () => {
    expect(doorwayOk(1.1, 2.2)).toBe(true);
    expect(doorwayOk(1.0, 2.6)).toBe(false);
    expect(doorwayOk(1.4, 2.0)).toBe(false);
  });
});
