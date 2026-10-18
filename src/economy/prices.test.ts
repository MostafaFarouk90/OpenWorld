import { describe, expect, it } from 'vitest';
import { bandPrice, listPrice, sellPrice } from './prices';

describe('prices', () => {
  it('applies band multipliers and rounds to whole gold on an odd list price', () => {
    expect(bandPrice(25, 'cold')).toBe(30);
    expect(bandPrice(25, 'banked')).toBe(25);
    expect(bandPrice(25, 'stoked')).toBe(23); // 22.5 rounds up
    expect(bandPrice(25, 'hearthbound')).toBe(20);
    expect(bandPrice(7, 'stoked')).toBe(6); // 6.3
    expect(bandPrice(25, null)).toBe(25);
  });

  it('never prices below 1', () => {
    expect(bandPrice(1, 'hearthbound')).toBe(1);
  });

  it('sells at 40% of list and refuses unpriced items', () => {
    expect(sellPrice('squires-arming-sword')).toBe(24);
    expect(sellPrice('hearth-stone')).toBeUndefined();
    expect(listPrice('constructor')).toBeUndefined();
  });
});
