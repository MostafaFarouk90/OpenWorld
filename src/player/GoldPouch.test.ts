import { describe, expect, it } from 'vitest';
import { GoldPouch } from './GoldPouch';

const wallet = (gold: number, giveBack?: number) => ({
  gold,
  takeGold(n: number) {
    const t = giveBack ?? Math.min(n, this.gold);
    this.gold -= t;
    return t;
  },
  addGold(n: number) {
    this.gold += n;
  },
});
const at = { x: 1, y: 2, z: 3 };

describe('GoldPouch', () => {
  it('drops floor(10%) of gold', () => {
    const p = new GoldPouch();
    const w = wallet(19);
    expect(p.drop(at, w, true)).toEqual({ gold: 1 });
    expect(w.gold).toBe(18);
    expect(p.pouch).toEqual({ position: at, gold: 1 });
  });
  it('makes no pouch when the share rounds to 0', () => {
    const p = new GoldPouch();
    const w = wallet(9);
    expect(p.drop(at, w, true)).toBeNull();
    expect(w.gold).toBe(9);
    expect(p.pouch).toBeNull();
  });
  it('takes nothing before the tutorial is complete', () => {
    const p = new GoldPouch();
    const w = wallet(100);
    expect(p.drop(at, w, false)).toBeNull();
    expect(w.gold).toBe(100);
  });
  it('handles an absent inventory', () => {
    expect(new GoldPouch().drop(at, undefined, true)).toBeNull();
  });
  it('replaces an older pouch, losing its gold', () => {
    const p = new GoldPouch();
    p.drop(at, wallet(100), true);
    p.drop({ x: 9, y: 9, z: 9 }, wallet(50), true);
    expect(p.pouch).toEqual({ position: { x: 9, y: 9, z: 9 }, gold: 5 });
  });
  it('honours takeGold returning less than asked', () => {
    const p = new GoldPouch();
    expect(p.drop(at, wallet(100, 3), true)).toEqual({ gold: 3 });
    expect(p.pouch?.gold).toBe(3);
    expect(new GoldPouch().drop(at, wallet(100, 0), true)).toBeNull();
  });
  it('recovers the exact amount and clears', () => {
    const p = new GoldPouch();
    const w = wallet(250);
    p.drop(at, w, true);
    expect(w.gold).toBe(225);
    expect(p.recover(w)).toBe(25);
    expect(w.gold).toBe(250);
    expect(p.pouch).toBeNull();
    expect(p.recover(w)).toBe(0);
  });
  it('keeps the pouch when recovery has no inventory', () => {
    const p = new GoldPouch();
    p.drop(at, wallet(100), true);
    expect(p.recover(undefined)).toBe(0);
    expect(p.pouch?.gold).toBe(10);
  });
  it('round trips through serialize and load', () => {
    const p = new GoldPouch();
    p.drop(at, wallet(100), true);
    const data = JSON.parse(JSON.stringify(p.serialize()));
    const q = new GoldPouch();
    q.load(data);
    expect(q.pouch).toEqual({ position: at, gold: 10 });
    expect(new GoldPouch().serialize()).toBeNull();
  });
  it('floors loaded gold and ignores corrupt data', () => {
    const q = new GoldPouch();
    q.load({ position: at, gold: 7.9 });
    expect(q.pouch?.gold).toBe(7);
    for (const bad of [undefined, 5, 'x', [], {}, { position: at, gold: -1 }, { position: at, gold: NaN },
      { position: { x: 1, y: 'a', z: 3 }, gold: 5 }, { position: null, gold: 5 }, { position: at, gold: '5' }]) {
      q.load(bad);
      expect(q.pouch).toEqual({ position: at, gold: 7 });
    }
    q.load(null);
    expect(q.pouch).toBeNull();
  });
});
