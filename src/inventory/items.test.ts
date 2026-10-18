import { describe, expect, it } from 'vitest';
import { ITEMS, NEW_GAME_KIT, STARTER_KIT, getItem } from './items';

describe('items', () => {
  it('has exactly the v2 item ids', () => {
    expect(Object.keys(ITEMS).sort()).toEqual(
      [
        'barley-cake',
        'ford-guard-shield',
        'hearth-stone',
        'hearth-token',
        'priors-censer',
        'tobbs-lucky-whistle',
        'training-weights',
        'gauts-spare-blade',
        'gauts-spare-tabard',
        'healing-flask',
        'hearth-bread',
        'hearth-stone-charm',
        'practice-sword',
        'squires-arming-sword',
        'wooden-round-shield',
        // Class starter gear (thread 12).
        'woodcutters-axe',
        'hide-jerkin',
        'apprentices-staff',
        'wool-robe',
        'alley-knives',
        'leather-vest',
        'hunting-crossbow',
        'rangers-cloak',
      ].sort(),
    );
  });

  it('uses derived string keys and a matching id', () => {
    for (const [id, d] of Object.entries(ITEMS)) {
      expect(d.id).toBe(id);
      expect(d.nameKey).toBe(`item.${id}.name`);
      expect(d.descKey).toBe(`item.${id}.desc`);
    }
  });

  it('gives gear a slot matching its kind and a stack of 1', () => {
    for (const d of Object.values(ITEMS)) {
      if (d.kind === 'consumable' || d.kind === 'quest') expect(d.slot).toBeUndefined();
      else {
        expect(d.slot).toBe(d.kind);
        expect(d.stackMax).toBe(1);
      }
    }
  });

  it('carries the table numbers', () => {
    expect(ITEMS['practice-sword'].stats).toEqual({ attack: 8 });
    expect(ITEMS['squires-arming-sword'].stats).toEqual({ attack: 12 });
    expect(ITEMS['gauts-spare-blade'].stats).toEqual({ attack: 14 });
    expect(ITEMS['wooden-round-shield'].stats).toEqual({ defense: 2 });
    expect(ITEMS['gauts-spare-tabard'].stats).toEqual({ defense: 2 });
    expect(ITEMS['hearth-stone-charm'].stats).toEqual({ defense: 1 });
    expect(ITEMS['hearth-stone'].kind).toBe('quest');
    expect(ITEMS['hearth-bread']).toMatchObject({ stackMax: 5, use: { healFlat: 15, drinkSeconds: 0.8 } });
    expect(ITEMS['healing-flask']).toMatchObject({ stackMax: 5, use: { healFraction: 0.4, drinkSeconds: 1.2 } });
  });

  it('defines the Brightwater quest rewards', () => {
    expect(ITEMS['ford-guard-shield']).toMatchObject({ kind: 'offhand', slot: 'offhand', stats: { defense: 3 } });
    expect(ITEMS['barley-cake']).toMatchObject({ kind: 'consumable', stackMax: 10, use: { healFlat: 10 } });
    for (const id of ['training-weights', 'tobbs-lucky-whistle', 'priors-censer']) {
      expect(ITEMS[id]).toMatchObject({ kind: 'trinket', slot: 'trinket', stackMax: 1 });
      expect(ITEMS[id].stats).toBeUndefined();
      expect(ITEMS[id].use).toBeUndefined(); // the Whistle is not usable
    }
  });

  it('getItem finds known ids and refuses unknown and prototype names', () => {
    expect(getItem('healing-flask')).toBe(ITEMS['healing-flask']);
    expect(getItem('nope')).toBeUndefined();
    expect(getItem('toString')).toBeUndefined();
    expect(getItem('__proto__')).toBeUndefined();
  });

  it('kits only reference known items, owned when equipped', () => {
    for (const kit of [NEW_GAME_KIT, STARTER_KIT]) {
      for (const id of Object.keys(kit.items)) expect(getItem(id)).toBeDefined();
      for (const [slot, id] of Object.entries(kit.equipped)) {
        expect(kit.items[id as string]).toBeGreaterThan(0);
        expect(getItem(id as string)?.slot).toBe(slot);
      }
    }
    expect(STARTER_KIT.items['healing-flask']).toBe(3);
    expect(Object.keys(NEW_GAME_KIT.equipped).sort()).toEqual(['offhand', 'weapon']);
  });
});
