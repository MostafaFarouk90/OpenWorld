import { describe, expect, it } from 'vitest';
import { dismountsBefore, mountRefusal, unseatingHit, type MountState } from './rules';

const OK: MountState = { available: true, indoors: false, travelling: false, stealth: false, chase: false, aggro: false, busy: false };

describe('mount rules', () => {
  it('allows mounting in the clear and refuses each gated state', () => {
    expect(mountRefusal(OK)).toBeNull();
    expect(mountRefusal({ ...OK, available: false })).toBe('unavailable');
    expect(mountRefusal({ ...OK, indoors: true })).toBe('interior');
    expect(mountRefusal({ ...OK, travelling: true })).toBe('travel');
    expect(mountRefusal({ ...OK, stealth: true })).toBe('stealth');
    expect(mountRefusal({ ...OK, chase: true })).toBe('chase');
    expect(mountRefusal({ ...OK, aggro: true })).toBe('combat');
    expect(mountRefusal({ ...OK, busy: true })).toBe('busy');
    expect(mountRefusal({ ...OK, available: false, aggro: true })).toBe('unavailable');
  });

  it('rest, kneel, hide and the shrine unseat first; doors, talk and chests do not', () => {
    expect(dismountsBefore('waystone', 'waystone:south-gate')).toBe(true);
    expect(dismountsBefore('kneel', 'kneel:x')).toBe(true);
    expect(dismountsBefore('hide', 'hide:hay')).toBe(true);
    expect(dismountsBefore('use', 'use:quenchstone-respec')).toBe(true);
    expect(dismountsBefore('door', 'door:keep')).toBe(false);
    expect(dismountsBefore('talk', 'talk:wace')).toBe(false);
    expect(dismountsBefore('use', 'use:shard-study')).toBe(false);
  });

  it('melee and spell hits unseat; status ticks, script and poise-less zero hits do not', () => {
    expect(unseatingHit({ kind: 'melee', dealt: 5, staggered: false })).toBe(true);
    expect(unseatingHit({ kind: 'spell', dealt: 0, staggered: true })).toBe(true);
    expect(unseatingHit({ kind: 'melee', dealt: 0, staggered: false })).toBe(false);
    expect(unseatingHit({ kind: 'status', dealt: 4, staggered: false })).toBe(false);
    expect(unseatingHit({ kind: 'script', dealt: 50, staggered: false })).toBe(false);
  });
});
