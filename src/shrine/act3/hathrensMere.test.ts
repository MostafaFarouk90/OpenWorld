import { describe, expect, it } from 'vitest';
import { HathrensMere } from './hathrensMere';
import { WAYSTONE_LOCKS } from '../../waystones/tuning';

function setup() {
  const flags = new Set<string>();
  const quests = new Map<string, string>();
  const log: string[] = [];
  const s = { items: 0, scars: 5, canRemove: true };
  const m = new HathrensMere({
    getBool: (k) => flags.has(k),
    setFlag: (k, v) => {
      log.push(`flag:${k}=${v}`);
      if (v) flags.add(k);
      else flags.delete(k);
    },
    questState: (id) => quests.get(id) ?? 'inactive',
    itemCount: (id) => (id === 'hathrens-scale' ? s.items : 0),
    canRemoveScars: () => s.canRemove,
    removeScars: (n) => {
      const removed = Math.min(n, s.scars);
      s.scars -= removed;
      log.push(`remove:${n}`);
      return removed;
    },
    clearIgnite: () => log.push('ignite-cleared'),
    toast: (key) => log.push(`toast:${key}`),
  });
  return { m, flags, quests, log, s };
}

describe('Hathren\'s Mere gate', () => {
  it('is locked by the derived open flag', () => {
    expect(WAYSTONE_LOCKS['hathrens-mere']).toBe('shrine.hathrens-mere.open');
  });

  it('stays closed until M26\'s nets are cut', () => {
    const t = setup();
    t.m.deriveOpen();
    expect(t.flags.has('shrine.hathrens-mere.open')).toBe(false);
    t.flags.add('story.m26.netsCut');
    t.m.deriveOpen();
    expect(t.flags.has('shrine.hathrens-mere.open')).toBe(true);
  });

  it('stays closed with M26 inactive (or failed) and none of the flags: M23 to M25', () => {
    const t = setup();
    for (const q of ['inactive', 'failed']) {
      t.quests.set('m26', q);
      t.m.deriveOpen();
      expect(t.flags.has('shrine.hathrens-mere.open')).toBe(false);
    }
  });

  it('opens on each input alone: M26 active, M26 completed, story.m26.complete, the shrine lit', () => {
    const inputs: [string, (t: ReturnType<typeof setup>) => void][] = [
      ['m26 active', (t) => t.quests.set('m26', 'active')],
      ['m26 completed', (t) => t.quests.set('m26', 'completed')],
      ['story.m26.complete', (t) => t.flags.add('story.m26.complete')],
      ['shrine lit', (t) => t.flags.add('shrine.hathrens-mere.lit')],
    ];
    for (const [name, apply] of inputs) {
      const t = setup();
      t.m.deriveOpen();
      expect(t.flags.has('shrine.hathrens-mere.open'), `${name} before`).toBe(false);
      apply(t);
      t.m.deriveOpen();
      expect(t.flags.has('shrine.hathrens-mere.open'), name).toBe(true);
    }
  });

  it('the nets flag never written, M26 active: the rite can still happen (no soft-lock)', () => {
    const t = setup();
    t.quests.set('m26', 'active');
    t.m.deriveOpen();
    expect(t.flags.has('shrine.hathrens-mere.open')).toBe(true);
  });

  it('writes the derived flag only on change', () => {
    const t = setup();
    t.flags.add('story.m26.netsCut');
    t.m.deriveOpen();
    t.m.deriveOpen();
    expect(t.log.filter((l) => l.startsWith('flag:shrine.hathrens-mere.open'))).toHaveLength(1);
  });
});

describe('the Mere\'s rest', () => {
  it('clears ignite only at the Mere and only after the shrine is lit', () => {
    const t = setup();
    t.m.onRest('hathrens-mere');
    expect(t.log).toEqual([]);
    t.flags.add('shrine.hathrens-mere.lit');
    t.m.onRest('quenchstone');
    expect(t.log).toEqual([]);
    t.m.onRest('hathrens-mere');
    expect(t.log).toEqual(['ignite-cleared', 'toast:mere.rest.ignite']);
  });
});

describe('Hathren\'s Scale', () => {
  it('removes min(3, scars) once and sets the flag before removing', () => {
    const t = setup();
    t.s.items = 1;
    expect(t.m.checkScale()).toBe(true);
    expect(t.log.slice(0, 2)).toEqual(['flag:shrine.hathrens-mere.scaleUsed=true', 'remove:3']);
    expect(t.s.scars).toBe(2);
    expect(t.m.checkScale()).toBe(false);
    expect(t.s.scars).toBe(2);
  });

  it('removes only what exists (2 scars: 2 go)', () => {
    const t = setup();
    t.s.scars = 2;
    t.s.items = 1;
    t.m.checkScale();
    expect(t.s.scars).toBe(0);
    expect(t.log).toContain('toast:mere.scale.eased');
  });

  it('0 Scars still spends it', () => {
    const t = setup();
    t.s.scars = 0;
    t.s.items = 1;
    expect(t.m.checkScale()).toBe(true);
    expect(t.flags.has('shrine.hathrens-mere.scaleUsed')).toBe(true);
    t.s.scars = 4;
    expect(t.m.checkScale()).toBe(false);
    expect(t.s.scars).toBe(4);
  });

  it('does not fire without the item, and not when dropped and picked up again', () => {
    const t = setup();
    expect(t.m.checkScale()).toBe(false);
    t.s.items = 1;
    t.m.checkScale();
    t.s.items = 0;
    t.m.checkScale();
    t.s.items = 1;
    t.s.scars = 5;
    expect(t.m.checkScale()).toBe(false);
    expect(t.s.scars).toBe(5);
  });

  it('is not spent while spells.removeScars is unavailable, and applies once it appears', () => {
    const t = setup();
    t.s.items = 1;
    t.s.canRemove = false;
    expect(t.m.checkScale()).toBe(false);
    expect(t.flags.has('shrine.hathrens-mere.scaleUsed')).toBe(false);
    t.s.canRemove = true;
    expect(t.m.checkScale()).toBe(true);
  });
});
