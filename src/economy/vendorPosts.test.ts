// v0.8 item 16: the Act 4 vendors, VENDOR_OPEN_WHEN (ANDed with the shipped rule) and VENDOR_POSTS (one moving shop).
import { describe, expect, it } from 'vitest';
import { VENDORS, VENDOR_OPEN_WHEN, VENDOR_POSTS, isVendorId, vendorAnchor, vendorOpenByTable } from './stock';

const flags = (f: Record<string, boolean>) => ({ getFlag: (k: string) => f[k] });

describe('Act 4 vendors (v0.8 item 16)', () => {
  it('Wulfhild and Hild are vendors (L7 stocks them; stock.act4.test.ts pins the lines)', () => {
    expect(isVendorId('wulfhild')).toBe(true);
    expect(isVendorId('hild')).toBe(true);
    expect(VENDORS.wulfhild.lines.length).toBeGreaterThan(0);
    expect(VENDORS.hild.lines.length).toBeGreaterThan(0);
  });
  it("Wulfhild and Hild open by L7's rows (M43, M41); a vendor without a row is open by the table", () => {
    expect(vendorOpenByTable('wulfhild', flags({ 'story.m41.complete': true }))).toBe(false);
    expect(vendorOpenByTable('wulfhild', flags({ 'story.m43.complete': true }))).toBe(true);
    expect(vendorOpenByTable('hild', flags({}))).toBe(false);
    expect(vendorOpenByTable('hild', flags({ 'story.m41.complete': true }))).toBe(true);
    expect(vendorOpenByTable('wystan', flags({}))).toBe(true);
    expect(Object.keys(VENDOR_OPEN_WHEN).sort()).toEqual(['aldous', 'hild', 'wenna', 'wulfhild']);
  });
  it('a closing row (Aldous from M38) closes the table half', () => {
    const t = { aldous: { none: ['story.m38.complete'] } };
    expect(vendorOpenByTable('aldous', flags({}), t)).toBe(true);
    expect(vendorOpenByTable('aldous', flags({ 'story.m38.complete': true }), t)).toBe(false);
  });
  it('a shop moves with its posts (the last holding row wins); L7 ships the refuge rows', () => {
    const rows = [
      { vendorId: 'gerta' as const, anchorId: 'a.one', when: { all: ['story.m38.complete'] } },
      { vendorId: 'gerta' as const, anchorId: 'a.two', when: { all: ['story.m41.complete'] } },
    ];
    expect(vendorAnchor('gerta', flags({}), rows)).toBe('shop.gerta');
    expect(vendorAnchor('gerta', flags({ 'story.m38.complete': true }), rows)).toBe('a.one');
    expect(vendorAnchor('gerta', flags({ 'story.m38.complete': true, 'story.m41.complete': true }), rows)).toBe('a.two');
    expect(VENDOR_POSTS.every((r) => r.when.all && r.when.all.length > 0)).toBe(true);
  });
});
