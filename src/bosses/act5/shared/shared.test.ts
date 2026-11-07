import { describe, expect, it } from 'vitest';
import { barFloorHealth, checkFloors, clampToFloor } from './barFloors';
import { bossPoiseScale, HEAVY_ATTACK_IDS, isBossHeavy } from './heavyHits';
import { KNIGHT_ATTACK_SET } from '../../../player/attackSets';
import { WARDEN_ATTACK_SET } from '../../../classes/warden/attackSet';
import { ASHBLADE_ATTACK_SET } from '../../../classes/ashblade/attackSet';

describe('bar floors', () => {
  const floors = [0.75, 0.5, 0.25, 0.04];
  it('holds each bar at its floor until its break, then lifts', () => {
    expect(barFloorHealth(3400, floors, 0)).toBe(2550);
    expect(barFloorHealth(3400, floors, 1)).toBe(1700);
    expect(barFloorHealth(3400, floors, 3)).toBe(136);
    expect(barFloorHealth(3400, floors, 4)).toBe(0);
    expect(barFloorHealth(3400, floors, 0, true)).toBe(0);
  });
  it('a 10,000-damage hit stops at the first floor, never two down', () => {
    const req = { amount: 10_000 };
    clampToFloor(req, 3400, barFloorHealth(3400, floors, 0));
    expect(3400 - req.amount).toBe(2550);
    const again = { amount: 10_000 };
    clampToFloor(again, 2550, barFloorHealth(3400, floors, 0));
    expect(again.amount).toBe(0);
  });
  it('edge: bad inputs never throw and never hold below 1 HP', () => {
    expect(barFloorHealth(0, floors, 0)).toBe(0);
    expect(barFloorHealth(100, [0], 0)).toBe(1);
    expect(barFloorHealth(100, floors, Number.NaN)).toBe(75);
    const req = { amount: 5 };
    clampToFloor(req, 100, 0);
    expect(req.amount).toBe(5);
  });
  it('rejects floors that do not descend', () => {
    expect(() => checkFloors([0.5, 0.6])).toThrow();
    expect(() => checkFloors([1])).toThrow();
    expect(() => checkFloors([0.75, 0.5, 0.25, 0.04])).not.toThrow();
  });
});

describe('heavy and light poise', () => {
  it('every class has a heavy route', () => {
    const routes: Record<string, string[]> = {
      knight: [KNIGHT_ATTACK_SET.attacks[KNIGHT_ATTACK_SET.heavyIndex]!.clip],
      warden: [WARDEN_ATTACK_SET.attacks[WARDEN_ATTACK_SET.heavyIndex]!.clip, 'warden.skullsplitter'],
      ashblade: [ASHBLADE_ATTACK_SET.attacks[ASHBLADE_ATTACK_SET.heavyIndex]!.clip],
      pathfinder: ['pathfinder.bolt.3', 'pathfinder.bolt.2'],
      emberwright: ['emberwright.flameBall', 'emberwright.colossus'],
    };
    for (const [cls, ids] of Object.entries(routes)) {
      expect(ids.some((id) => isBossHeavy({ attackId: id, poise: 10 })), cls).toBe(true);
      for (const id of ids) expect(bossPoiseScale({ attackId: id, poise: 10 })).toBe(2);
    }
  });
  it('light hits are halved; a scripted 30-poise hit is heavy', () => {
    expect(bossPoiseScale({ attackId: '1H_Melee_Attack_Slice_Horizontal', poise: 12 })).toBe(0.5);
    expect(bossPoiseScale({ attackId: 'pathfinder.bolt.1', poise: 10 })).toBe(0.5);
    expect(bossPoiseScale({ attackId: undefined, poise: 30 })).toBe(2);
    expect(HEAVY_ATTACK_IDS.has('emberwright.bolt')).toBe(false);
  });
});
