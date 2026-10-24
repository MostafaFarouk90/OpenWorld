import { beforeEach, describe, expect, it } from 'vitest';
import { Inventory } from '../../inventory/Inventory';
import './catalog';
import { knifeIsKeen, type KnifePorts } from './knifeUpgrade';

const KNIFE = 'frostbrows-hunting-knife';

let inv: Inventory;
let flags: Record<string, unknown>;
const ports = (): KnifePorts => ({ has: (id) => inv.has(id), flag: (k) => flags[k] });

beforeEach(() => {
  inv = new Inventory({ emit: () => {}, logger: { warn: () => {} } });
  inv.reset({ items: {}, equipped: {} });
  flags = {};
});

describe('R15 knife keen state', () => {
  it('is keen when the knife arrives after the hut choice', () => {
    flags['story.r15.choice'] = 'hut';
    expect(knifeIsKeen(ports())).toBe(false);
    inv.add(KNIFE, 1);
    expect(knifeIsKeen(ports())).toBe(true);
  });
  it('is keen when the choice arrives after the knife', () => {
    inv.add(KNIFE, 1);
    expect(knifeIsKeen(ports())).toBe(false);
    flags['story.r15.choice'] = 'hut';
    expect(knifeIsKeen(ports())).toBe(true);
  });
  it('never turns keen for lodge, an unset choice or another value', () => {
    inv.add(KNIFE, 1);
    for (const v of ['lodge', undefined, 'Hut', true]) {
      flags['story.r15.choice'] = v;
      expect(knifeIsKeen(ports()), String(v)).toBe(false);
    }
  });
  it('does not keen without the knife, and drops back if it is lost', () => {
    flags['story.r15.choice'] = 'hut';
    expect(knifeIsKeen(ports())).toBe(false);
    inv.add(KNIFE, 1);
    inv.remove(KNIFE, 1);
    expect(knifeIsKeen(ports())).toBe(false);
  });
  it('never changes the item: the knife id stays held and equipped, and no keen item exists', () => {
    inv.add(KNIFE, 1);
    inv.equip(KNIFE);
    flags['story.r15.choice'] = 'hut';
    expect(knifeIsKeen(ports())).toBe(true);
    expect(knifeIsKeen(ports())).toBe(true); // idempotent
    expect(inv.has(KNIFE)).toBe(true);
    expect(inv.equipped('trinket')).toBe(KNIFE);
    expect(inv.items()).toEqual([{ id: KNIFE, count: 1 }]);
    expect(inv.add('frostbrows-hunting-knife-keen', 1)).toBe(0); // unregistered
  });
});
