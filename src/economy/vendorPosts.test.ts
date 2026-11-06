// v0.8 item 16: the Act 4 vendors, VENDOR_OPEN_WHEN (ANDed with the shipped rule) and VENDOR_POSTS (one moving shop).
import { describe, expect, it } from 'vitest';
import { VENDORS, VENDOR_OPEN_WHEN, VENDOR_POSTS, isVendorId, vendorAnchor, vendorOpenByTable } from './stock';

const flags = (f: Record<string, boolean>) => ({ getFlag: (k: string) => f[k] });

describe('Act 4 vendors (v0.8 item 16)', () => {
  it('Wulfhild and Hild are vendors, empty until L7 stocks them', () => {
    expect(isVendorId('wulfhild')).toBe(true);
    expect(isVendorId('hild')).toBe(true);
    expect(VENDORS.wulfhild.lines).toEqual([]);
    expect(VENDORS.hild.lines).toEqual([]);
  });
  it('Wulfhild and Hild stay closed until L7 sets their rows; a vendor without a row is open by the table', () => {
    const late = flags({ 'story.m41.complete': true, 'story.m42.started': true, 'story.gate.a5': true });
    expect(vendorOpenByTable('wulfhild', late)).toBe(false);
    expect(vendorOpenByTable('hild', late)).toBe(false);
    expect(vendorOpenByTable('wystan', flags({}))).toBe(true);
    expect(Object.keys(VENDOR_OPEN_WHEN).sort()).toEqual(['hild', 'wulfhild']);
  });
  it('a closing row (Aldous from M38) closes the table half', () => {
    const t = { aldous: { none: ['story.m38.complete'] } };
    expect(vendorOpenByTable('aldous', flags({}), t)).toBe(true);
    expect(vendorOpenByTable('aldous', flags({ 'story.m38.complete': true }), t)).toBe(false);
  });
  it('a shop moves with its posts (the last holding row wins), and ships with none', () => {
    const rows = [
      { vendorId: 'gerta' as const, anchorId: 'a.one', when: { all: ['story.m38.complete'] } },
      { vendorId: 'gerta' as const, anchorId: 'a.two', when: { all: ['story.m41.complete'] } },
    ];
    expect(vendorAnchor('gerta', flags({}), rows)).toBe('shop.gerta');
    expect(vendorAnchor('gerta', flags({ 'story.m38.complete': true }), rows)).toBe('a.one');
    expect(vendorAnchor('gerta', flags({ 'story.m38.complete': true, 'story.m41.complete': true }), rows)).toBe('a.two');
    expect(VENDOR_POSTS).toEqual([]);
  });
});
