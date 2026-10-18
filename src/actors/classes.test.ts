import { describe, expect, it } from 'vitest';
import { CLASS_IDS, DEFAULT_CLASS, isClassId } from './classes';
import { MERCY_UNLOCK_FLAGS } from '../state/favour';
import { WORLD_BOUNDS } from '../config/constants';

describe('v0.5 class ids, mercy unlock flags and world bounds', () => {
  it('lists the five classes with the Knight as the default', () => {
    expect(CLASS_IDS).toEqual(['knight', 'warden', 'emberwright', 'ashblade', 'pathfinder']);
    expect(DEFAULT_CLASS).toBe('knight');
  });

  it('isClassId accepts only the five ids', () => {
    for (const id of CLASS_IDS) expect(isClassId(id)).toBe(true);
    for (const bad of ['Knight', 'mage', '', null, undefined, 3, {}]) expect(isClassId(bad)).toBe(false);
  });

  it('names the three mercy unlock flags', () => {
    expect(MERCY_UNLOCK_FLAGS).toEqual({ release: 'enemies.mercy.release', spare: 'enemies.mercy.spare', calm: 'enemies.mercy.calm' });
  });

  it('the world bounds hold Brightwater and the whole Harrowmark region box', () => {
    expect(WORLD_BOUNDS).toEqual({ minX: -2000, maxX: 10500, minZ: -2000, maxZ: 4500 });
  });
});

describe('MercyEvent.ledgerId (v0.5)', () => {
  it('a boss mercy with a ledger id applies exactly as one without', async () => {
    const { WorldState } = await import('../state/WorldState');
    const { GameEvents } = await import('../core/events');
    const mk = () => new WorldState(new GameEvents(() => {}), () => {});
    const a = mk();
    const b = mk();
    const base = { verb: 'release', tier: 'boss', track: 'ashwalkers', creature: 'ashen-prior', amount: 4 } as const;
    expect(a.recordMercy({ ...base, ledgerId: 'D01' })).toEqual(b.recordMercy(base));
    expect(a.favour('ashwalkers')).toBe(b.favour('ashwalkers'));
  });
});
