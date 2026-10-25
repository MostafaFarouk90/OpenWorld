import { describe, expect, it } from 'vitest';
import '../gear/catalog';
import '../gear/sockets/table';
import '../gear/tier4/catalog';
import { Inventory } from '../inventory/Inventory';
import { getItem } from '../inventory/items';
import { Shop, type ShopPorts } from './Shop';

const BLADE = 'wyrm-tempered-oathblade';

function rig(socket = true) {
  const inv = new Inventory({ emit: () => {}, logger: { warn: () => {} } });
  inv.reset({ items: { [BLADE]: 1 }, equipped: {} });
  inv.addGold(100);
  if (socket) inv.setSockets(BLADE, [{ slot: 0, shardId: 'shard-gem.oathfire' }]);
  const events: string[] = [];
  const ports: ShopPorts = {
    gold: () => inv.gold,
    takeGold: (n) => inv.takeGold(n),
    addGold: (n) => inv.addGold(n),
    count: (id) => inv.count(id),
    remove: (id, n) => inv.remove(id, n),
    isEquipped: (id) => inv.equipped(getItem(id)?.slot ?? 'weapon') === id,
    getItem,
    grant: (_s, id, n) => void inv.add(id, n),
    band: () => 'banked',
    isOpen: () => true,
    emit: (t) => void events.push(t),
    warn: () => {},
    gearRecord: (id) => inv.gear(id),
    socketed: (id) => inv.socketsOf(id).length > 0,
  };
  return { inv, shop: new Shop(ports), events };
}

describe('Shop.sell of a socketed piece', () => {
  it('is refused as socketed and takes nothing', () => {
    const t = rig();
    const before = JSON.stringify([t.inv.gold, t.inv.serialize()]);
    expect(t.shop.sell('wystan', BLADE)).toEqual({ ok: false, reason: 'socketed' });
    expect(JSON.stringify([t.inv.gold, t.inv.serialize()])).toBe(before);
    expect(t.shop.buyBackFor('wystan')).toEqual([]);
    expect(t.events).toEqual([]);
  });
  it('sells once the gems are out, and a buy-back brings no stale sockets', () => {
    const t = rig();
    t.inv.setSockets(BLADE, []);
    const r = t.shop.sell('wystan', BLADE);
    expect(r.ok).toBe(true);
    expect(t.inv.has(BLADE)).toBe(false);
    expect(t.shop.buyBack('wystan', 0).ok).toBe(true);
    expect(t.inv.has(BLADE)).toBe(true);
    expect(t.inv.socketsOf(BLADE)).toEqual([]);
  });
  it('sells an unsocketed tier 4 piece directly', () => {
    const t = rig(false);
    expect(t.shop.sell('wystan', BLADE).ok).toBe(true);
  });
});

describe('Shop room with the saddlebags', () => {
  function bagged(bags: boolean) {
    const t = rig(false);
    t.inv.reset({ items: bags ? { 'ashmare-saddlebags': 1 } : {}, equipped: {} });
    t.inv.addGold(100000);
    const ports = (t.shop as unknown as { ports: ShopPorts }).ports;
    ports.capOf = (id) => t.inv.capOf(id);
    return t;
  }
  it('buys rime-iron past 40 with the bags and refuses at 50', () => {
    const t = bagged(true);
    t.inv.add('rime-iron', 40);
    expect(t.shop.buy('thorgar', 'rime-iron', 10)).toEqual({ ok: true, total: expect.any(Number) });
    expect(t.inv.count('rime-iron')).toBe(50);
    expect(t.shop.buy('thorgar', 'rime-iron', 1)).toEqual({ ok: false, reason: 'no-room' });
  });
  it('refuses at 40 without the bags', () => {
    const t = bagged(false);
    t.inv.add('rime-iron', 40);
    expect(t.shop.buy('thorgar', 'rime-iron', 1)).toEqual({ ok: false, reason: 'no-room' });
  });
});
