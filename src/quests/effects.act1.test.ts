import { describe, it, expect } from 'vitest';
import { createEffectRunner } from './effects';
import { makeWorld } from './testKit';
import { validateEffects } from './validate';
import type { Effect } from './types';

function runner(over: Record<string, unknown> = {}) {
  const w = makeWorld();
  const run = createEffectRunner({
    state: w.state, quests: w.manager, bus: w.bus, sourceId: 'quest:test', warn: (m) => w.warns.push(m),
    progression: () => ({ grantXp() {}, grantAbility: (id, s) => { w.calls.push(`ability:${id}:${s}`); } }),
    inventory: () => ({ remove: () => true, addGold: (n) => { w.gold.n += n; } }),
    npcs: () => w.npcs, enemies: () => w.enemies,
    ...over,
  });
  return { w, run };
}

describe('giveGold', () => {
  it('adds gold', () => { const { w, run } = runner(); run.run([{ giveGold: 15 }]); expect(w.gold.n).toBe(15); });
  it.each([0, -3, NaN, Infinity])('refuses %s', (n) => {
    const { w, run } = runner();
    expect(run.run([{ giveGold: n }])[0].ok).toBe(false);
    expect(w.gold.n).toBe(0);
  });
  it('warns once and fails when the inventory service is absent', () => {
    const { w, run } = runner({ inventory: () => undefined });
    expect(run.run([{ giveGold: 5 }, { giveGold: 5 }]).map((r) => r.ok)).toEqual([false, false]);
    expect(w.warns.filter((m) => m.includes('inventory service absent'))).toHaveLength(1);
  });
});

describe('if', () => {
  const eff = (cond: string): Effect => ({ if: { flag: cond }, then: [{ setFlag: 'out.then', value: true }], else: [{ setFlag: 'out.else', value: true }] });
  it('runs then when the condition holds and else otherwise', () => {
    const a = runner(); a.w.flags.set('c.on', true); a.run.run([eff('c.on')]);
    expect(a.w.flags.get('out.then')).toBe(true); expect(a.w.flags.has('out.else')).toBe(false);
    const b = runner(); b.run.run([eff('c.on')]);
    expect(b.w.flags.get('out.else')).toBe(true);
  });
  it('else is optional', () => {
    const { w, run } = runner();
    expect(run.run([{ if: { flag: 'nope.x' }, then: [{ setFlag: 'a.b', value: 1 }] }])[0].ok).toBe(true);
    expect(w.flags.size).toBe(0);
  });
  it('a failing effect in a branch does not stop its siblings', () => {
    const { w, run } = runner({ inventory: () => undefined });
    run.run([{ if: { all: [] }, then: [{ giveGold: 5 }, { setFlag: 'a.b', value: true }] }]);
    expect(w.flags.get('a.b')).toBe(true);
  });
  it('nests to depth 3 and refuses a fourth level', () => {
    const lvl = (inner: Effect[]): Effect => ({ if: { all: [] }, then: inner });
    const ok = lvl([lvl([lvl([{ setFlag: 'deep.ok', value: true }])])]);
    const tooDeep = lvl([lvl([lvl([lvl([{ setFlag: 'deep.bad', value: true }])])])]);
    const { w, run } = runner();
    run.run([ok]); run.run([tooDeep]);
    expect(w.flags.get('deep.ok')).toBe(true);
    expect(w.flags.has('deep.bad')).toBe(false);
    expect(validateEffects([ok])).toEqual([]);
    expect(validateEffects([tooDeep]).join()).toMatch(/nest at most/);
  });
  it('treats a broken condition as false', () => {
    const { w, run } = runner();
    run.run([{ if: { bogus: 1 } as any, then: [{ setFlag: 'a.b', value: true }], else: [{ setFlag: 'a.c', value: true }] }]);
    expect(w.flags.has('a.b')).toBe(false);
    expect(w.flags.get('a.c')).toBe(true);
  });
});

describe('placeNpc, unlockMercy, grantAbility', () => {
  it('places and reports an unplaceable post', () => {
    const { w, run } = runner();
    run.run([{ placeNpc: { npcId: 'gaut', anchorId: 'npc-post.gaut.ford' } }]);
    expect(w.npcs.placed).toEqual([['gaut', 'npc-post.gaut.ford']]);
    w.npcs.missing.add('nowhere');
    run.run([{ placeNpc: { npcId: 'gaut', anchorId: 'nowhere' } }]);
    expect(w.warns.join()).toMatch(/could not place gaut at nowhere/);
  });
  it('fails quietly when the npcs service is absent, and rejects empty ids', () => {
    const { run } = runner({ npcs: () => undefined });
    expect(run.run([{ placeNpc: { npcId: 'a', anchorId: 'b' } }])[0].ok).toBe(false);
    const r2 = runner().run;
    expect(r2.run([{ placeNpc: { npcId: '', anchorId: 'b' } }])[0].ok).toBe(false);
  });
  it('unlocks release and spare only', () => {
    const { w, run } = runner();
    expect(run.run([{ unlockMercy: 'release' }, { unlockMercy: 'spare' }]).map((r) => r.ok)).toEqual([true, true]);
    expect(w.enemies.unlocked).toEqual(['release', 'spare']);
    expect(run.run([{ unlockMercy: 'calm' } as any])[0].ok).toBe(false);
    expect(w.enemies.unlocked).toHaveLength(2);
  });
  it('unlockMercy fails when the enemies service is absent', () => {
    expect(runner({ enemies: () => undefined }).run.run([{ unlockMercy: 'spare' }])[0].ok).toBe(false);
  });
  it('grantAbility passes the quest source through', () => {
    const { w, run } = runner();
    run.run([{ grantAbility: 'surge-leap' }]);
    expect(w.calls).toEqual(['ability:surge-leap:quest:test']);
  });
  it('grantAbility fails without progression support or an id', () => {
    expect(runner({ progression: () => ({ grantXp() {} }) }).run.run([{ grantAbility: 'x' }])[0].ok).toBe(false);
    expect(runner().run.run([{ grantAbility: '' }])[0].ok).toBe(false);
  });
});

describe('validateEffects for the new shapes', () => {
  it('accepts well-formed ones', () => {
    expect(validateEffects([
      { giveGold: 5 }, { placeNpc: { npcId: 'a', anchorId: 'b' } }, { unlockMercy: 'spare' }, { grantAbility: 'x' },
      { if: { flag: 'a.b' }, then: [{ giveGold: 1 }], else: [] },
    ])).toEqual([]);
  });
  it('flags malformed ones', () => {
    const errs = validateEffects([
      { giveGold: -1 }, { placeNpc: { npcId: 'a' } as any }, { unlockMercy: 'calm' } as any, { grantAbility: '' },
      { if: { flag: 'a.b' } } as any,
    ]);
    expect(errs).toHaveLength(5);
  });
});
