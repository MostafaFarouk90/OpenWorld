import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../../inventory/items';
import { dialogueStrings } from '../../../dialogue/strings.en';
import { questStrings } from '../../strings.en';
import { ACT2_QUEST_DEFS, ACT2_QUEST_ITEMS, ACT2_QUEST_ITEM_STRINGS } from './index';
import type { Effect } from '../../types';

describe('Cinderreach quest items', () => {
  it('registers each item once, with a name and a description in the string tables', () => {
    for (const d of ACT2_QUEST_ITEMS) {
      expect(ITEMS[d.id], d.id).toBe(d);
      expect(ACT2_QUEST_ITEM_STRINGS[d.nameKey], d.nameKey).toBeTruthy();
      expect(ACT2_QUEST_ITEM_STRINGS[d.descKey], d.descKey).toBeTruthy();
    }
    expect(new Set(ACT2_QUEST_ITEMS.map((d) => d.id)).size).toBe(ACT2_QUEST_ITEMS.length);
  });

  it('keeps the numbers of the plan: Axe-Rune +3, the Brother\'s Axe 18 whole and 13 rested, Maud\'s Remedy 40%', () => {
    expect(ITEMS['hrolfs-axe-rune'].stats).toEqual({ attack: 3 });
    expect(ITEMS['hrolfs-axe-rune'].slot).toBe('trinket');
    expect(ITEMS['brothers-axe-full'].stats).toEqual({ attack: 18 });
    expect(ITEMS['brothers-axe-lesser'].stats).toEqual({ attack: 13 });
    expect(ITEMS['maud-remedy'].use?.healFraction).toBe(0.4);
    expect(ITEMS['fox-fire-ember'].use?.noHeal).toBe(true);
    expect(ITEMS['fox-fire-ember'].use?.healFraction).toBeUndefined();
  });

  it('every item a Cinderreach quest gives exists, including the Ashmare Saddle of Gaut', () => {
    const gives: string[] = [];
    const walk = (effects: Effect[] | undefined) => {
      for (const e of effects ?? []) {
        const c = e as { give?: Array<{ itemId: string }>; then?: Effect[]; else?: Effect[] };
        for (const g of c.give ?? []) gives.push(g.itemId);
        walk(c.then);
        walk(c.else);
      }
    };
    for (const q of ACT2_QUEST_DEFS) for (const k of ['onStart', 'onComplete', 'rewards'] as const) walk(q[k]);
    expect(gives).toContain('ashmare-saddle');
    for (const id of gives) expect(ITEMS[id], id).toBeDefined();
  });

  it('item strings do not collide with the quest or dialogue tables', () => {
    for (const k of Object.keys(ACT2_QUEST_ITEM_STRINGS)) {
      expect(k in questStrings, k).toBe(false);
      expect(k in dialogueStrings, k).toBe(false);
    }
  });
});
