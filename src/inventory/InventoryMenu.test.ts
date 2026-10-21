import { describe, expect, it } from 'vitest';
import { StubDocument, StubElement, textOf } from '../hud/dom';
import { Inventory } from './Inventory';
import { InventoryMenu } from './InventoryMenu';
import { inventoryViewModel } from './inventoryViewModel';
import { NEW_GAME_KIT } from './items';
import { INVENTORY_STRINGS_EN } from './strings.en';

const t = (k: string, p?: Record<string, string | number>): string => {
  const s = INVENTORY_STRINGS_EN[k] ?? `[[${k}]]`;
  return s.replace(/\{(\w+)\}/g, (_, n) => String(p?.[n] ?? `{${n}}`));
};

function setup() {
  const inv = new Inventory({ emit: () => {}, logger: { warn: () => {} } });
  inv.reset(NEW_GAME_KIT);
  let closed = 0;
  const service = {
    count: (i: string) => inv.count(i), has: (i: string) => inv.has(i), add: (i: string, n: number) => inv.add(i, n),
    remove: (i: string, n: number) => inv.remove(i, n), equip: (i: string) => inv.equip(i), unequip: (s: any) => inv.unequip(s),
    equipped: (s: any) => inv.equipped(s), equippedStat: (s: any) => inv.equippedStat(s), use: () => ({ ok: false, reason: 'busy' }) as const,
    reset: (k: any) => inv.reset(k), items: () => inv.items(), get gold() { return inv.gold; }, addGold: (n: number) => inv.addGold(n), takeGold: (n: number) => inv.takeGold(n),
    gear: (i: string) => inv.gear(i), setTemper: (i: string, l: number, a?: string) => inv.setTemper(i, l, a),
  };
  const menu = new InventoryMenu(new StubDocument(), { inventory: service, t, close: () => closed++ });
  const buttons = (): StubElement[] => {
    const out: StubElement[] = [];
    const walk = (e: any) => { if (e.tag === 'button') out.push(e); e.children.forEach(walk); };
    walk(menu.element);
    return out;
  };
  const press = (label: string) => buttons().find((b) => b.textContent === label)?.click();
  return { inv, menu, service, buttons, press, closed: () => closed };
}

describe('inventoryViewModel', () => {
  it('lists slots and stacks, skipping unknown ids and zero counts', () => {
    const { inv, service } = setup();
    inv.load({ items: { 'practice-sword': 1, 'wooden-round-shield': 1, 'future-gem': 4 }, equipped: {}, unknown: {} }, 1);
    const vm = inventoryViewModel(service);
    expect(vm.rows.map((r) => r.id).sort()).toEqual(['practice-sword', 'wooden-round-shield']);
    expect(vm.slots.map((s) => s.slot)).toEqual(['weapon', 'offhand', 'armour', 'trinket']);
  });

  it('marks equipped rows and equippable/usable flags', () => {
    const { inv, service } = setup();
    inv.add('healing-flask', 2);
    inv.add('squires-arming-sword', 1);
    const vm = inventoryViewModel(service);
    expect(vm.rows.find((r) => r.id === 'practice-sword')).toMatchObject({ equipped: true, canEquip: true, canUse: false });
    expect(vm.rows.find((r) => r.id === 'healing-flask')).toMatchObject({ equipped: false, canEquip: false, canUse: true, count: 2 });
  });
});

describe('InventoryMenu', () => {
  it('shows equipment, an empty armour slot and the gold', () => {
    const { menu, inv } = setup();
    inv.addGold(12);
    menu.render();
    const text = textOf(menu.element);
    expect(text).toContain('Practice Sword');
    expect(text).toContain('Armour');
    expect(text).toContain('(empty)');
    expect(text).toContain('Gold: 12');
  });

  it('equips from the list and re-renders', () => {
    const { menu, inv, press } = setup();
    inv.add('squires-arming-sword', 1);
    menu.render();
    press('Equip');
    expect(inv.equipped('weapon')).toBe('squires-arming-sword');
    expect(textOf(menu.element)).toContain('(equipped)');
  });

  it('unequip button empties the slot', () => {
    const { menu, inv, press } = setup();
    menu.render();
    press('Unequip');
    expect([inv.equipped('weapon'), inv.equipped('offhand')].filter(Boolean)).toHaveLength(1);
  });

  it('use button calls the service and a refusal changes nothing', () => {
    const { menu, inv, press } = setup();
    inv.add('healing-flask', 1);
    menu.render();
    press('Use');
    expect(inv.count('healing-flask')).toBe(1);
  });

  it('the close button calls close', () => {
    const { buttons, closed } = setup();
    buttons().find((b) => b.textContent === 'Close')?.click();
    expect(closed()).toBe(1);
  });

  it('unknown-string keys render [[key]] and an empty inventory says so', () => {
    const { menu, inv } = setup();
    inv.remove('practice-sword', 1);
    inv.remove('wooden-round-shield', 1);
    menu.render();
    expect(textOf(menu.element)).toContain('Nothing here yet.');
  });
});
