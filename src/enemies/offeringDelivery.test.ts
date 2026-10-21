import { describe, expect, it } from 'vitest';
import { offeringDelivery } from './types';

describe('offeringDelivery', () => {
  it('defaults to held', () => {
    expect(offeringDelivery({})).toBe('held');
  });
  it('honours thrown and held', () => {
    expect(offeringDelivery({ delivery: 'thrown' })).toBe('thrown');
    expect(offeringDelivery({ delivery: 'held' })).toBe('held');
  });
});
