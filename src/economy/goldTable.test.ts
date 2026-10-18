import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_SPAWNERS } from '../enemies/brightwaterSpawners';
import { respecGold } from '../progression/tuning';
import { M06_BRIBE_GOLD, M06_TIP_GOLD } from '../quests/content/gold';
import {
  CAMP_FOOTMEN,
  CHEST_GOLD,
  PAID_RESPEC_COST,
  PAID_RESPEC_LEVEL,
  PURSE_GOLD,
  PURSE_SPAWNERS,
  THUG_SPAWNERS,
  harrowmarkIncome,
  incomeToM06,
  netAtActEnd,
} from './goldTable';

describe('gold budget', () => {
  it('pays for the bribe before Harrowmark with a margin', () => {
    expect(incomeToM06()).toBeGreaterThanOrEqual(M06_BRIBE_GOLD + 15);
  });

  it('is a stretch beside the persuasion tip, which is cheaper', () => {
    expect(M06_TIP_GOLD).toBeLessThan(M06_BRIBE_GOLD);
  });

  it.each(['take', 'forgive'] as const)('leaves a paid respec at level 10 after every sink (%s the coin)', (route) => {
    expect(PAID_RESPEC_COST).toBe(respecGold(PAID_RESPEC_LEVEL));
    expect(netAtActEnd(route)).toBeGreaterThanOrEqual(PAID_RESPEC_COST);
    expect(harrowmarkIncome(route)).toBeGreaterThan(0);
  });

  it('counts exactly the camp Footmen and chests it assumes', () => {
    expect(CAMP_FOOTMEN * PURSE_GOLD).toBe(24);
    expect(Object.keys(CHEST_GOLD)).toEqual(
      expect.arrayContaining(['chest:deadroad-camp-1', 'chest:deadroad-camp-2', 'chest:harrowmark-1', 'chest:harrowmark-4']),
    );
    expect(CHEST_GOLD['chest:ledge-cache']).toBeUndefined();
  });

  it('keeps the ford pairs, the patrols and the tutorial soldiers off the purse whitelist', () => {
    const tags = [...PURSE_SPAWNERS, ...THUG_SPAWNERS];
    for (const s of BRIGHTWATER_SPAWNERS) {
      expect(tags).not.toContain(s.id);
      if ('tag' in s && typeof s.tag === 'string') expect(tags).not.toContain(s.tag);
    }
    expect(tags).not.toContain('replay.blocker');
    expect(tags).not.toContain('t09.soldier');
    expect([...PURSE_SPAWNERS]).toEqual(['deadroad.camp-1', 'deadroad.camp-2']);
  });
});
