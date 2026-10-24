import { describe, expect, it } from 'vitest';
import type { ClassId } from '../../actors/classes';
import { Inventory } from '../../inventory/Inventory';
import { bossBeaten, grantBossGem, retroGrant, type GrantPorts } from './grants';
import { gemFor } from './table';
import { ACT3_FLAG_OWNERS } from '../../quests/lint/act3Flags';
import { GEM_BOSSES, grantedFlag } from './tuning';

function rig(cls: ClassId | null, flags: Record<string, unknown> = {}, done: string[] = []) {
  const inv = new Inventory({ emit: () => {}, logger: { warn: () => {} } });
  inv.reset({ items: {}, equipped: {} });
  const state = { cls, flags: { ...flags } as Record<string, unknown> };
  const ports: GrantPorts = {
    getFlag: (k) => state.flags[k],
    setFlag: (k, v) => void (state.flags[k] = v),
    classId: () => state.cls,
    add: (id, n) => inv.add(id, n),
    questDone: (q) => done.includes(q),
  };
  const gems = () => inv.items().filter((i) => i.id.startsWith('shard-gem.'));
  return { inv, state, ports, gems };
}
const outcomes = (...ids: string[]) => Object.fromEntries(ids.map((i) => [`boss.${i}.outcome`, 'defeated']));

describe('grantBossGem', () => {
  it('pays the class gem of the boss variant and sets the flag', () => {
    const t = rig('warden');
    expect(grantBossGem(t.ports, 'ashen-prior')).toEqual({ bossId: 'ashen-prior', gemId: 'shard-gem.rootstone' });
    expect(t.inv.count('shard-gem.rootstone')).toBe(1);
    expect(t.state.flags[grantedFlag('ashen-prior')]).toBe(true);
    expect(grantedFlag('ashen-prior')).toBe('gear.shardgem.granted.ashen-prior');
  });
  it('grants nothing until a class is chosen, then grants on the retry', () => {
    const t = rig(null);
    expect(grantBossGem(t.ports, 'ashen-prior')).toBeNull();
    expect(t.gems()).toEqual([]);
    expect(t.state.flags[grantedFlag('ashen-prior')]).toBeUndefined();
    t.state.cls = 'pathfinder';
    expect(grantBossGem(t.ports, 'ashen-prior')?.gemId).toBe('shard-gem.fletching');
  });
  it('pays a boss once', () => {
    const t = rig('knight');
    grantBossGem(t.ports, 'gaffer-grimtooth');
    expect(grantBossGem(t.ports, 'gaffer-grimtooth')).toBeNull();
    expect(t.inv.count('shard-gem.oathfire')).toBe(1);
  });
  it('alternates gem A and B down the boss list for every class', () => {
    for (const cls of ['knight', 'warden', 'emberwright', 'ashblade', 'pathfinder'] as const) {
      const t = rig(cls);
      GEM_BOSSES.forEach((b, i) => {
        expect(b.variant).toBe(i % 2 === 0 ? 'a' : 'b');
        expect(grantBossGem(t.ports, b.bossId)?.gemId).toBe(gemFor(cls, b.variant).id);
      });
    }
  });
  it('ignores a boss that has no gem', () => {
    const t = rig('knight');
    expect(grantBossGem(t.ports, 'hathren')).toBeNull();
    expect(t.gems()).toEqual([]);
    expect(Object.keys(t.state.flags)).toEqual([]);
  });
  it('keeps the flag unset when the stack is full, so a later call retries', () => {
    const t = rig('knight');
    t.inv.add('shard-gem.bulwark', 10);
    expect(grantBossGem(t.ports, 'ashen-prior')).toBeNull();
    expect(t.state.flags[grantedFlag('ashen-prior')]).toBeUndefined();
    expect(t.inv.count('shard-gem.bulwark')).toBe(10);
    t.inv.remove('shard-gem.bulwark', 1);
    expect(grantBossGem(t.ports, 'ashen-prior')?.gemId).toBe('shard-gem.bulwark');
    expect(t.state.flags[grantedFlag('ashen-prior')]).toBe(true);
  });
});

describe('retroGrant', () => {
  it('pays only bosses with an outcome, among the four Act 1 and 2 bosses', () => {
    const t = rig('knight', outcomes('ashen-prior', 'the-slagmaw'));
    const got = retroGrant(t.ports);
    expect(got.map((g) => g?.bossId)).toEqual(['ashen-prior', 'the-slagmaw']);
    expect(t.gems().map((g) => g.id).sort()).toEqual(['shard-gem.bulwark', 'shard-gem.oathfire']);
  });
  it('ignores empty or non-string outcomes', () => {
    const t = rig('knight', { 'boss.ashen-prior.outcome': '', 'boss.gaffer-grimtooth.outcome': 1 });
    expect(retroGrant(t.ports)).toEqual([]);
    expect(t.gems()).toEqual([]);
  });
  it('pays the Slagmaw gem from a completed D04 quest with no boss outcome flag', () => {
    const t = rig('knight', {}, ['d04']);
    expect(retroGrant(t.ports)).toEqual([{ bossId: 'the-slagmaw', gemId: 'shard-gem.oathfire' }]);
    expect(t.state.flags[grantedFlag('the-slagmaw')]).toBe(true);
    expect(retroGrant(t.ports)).toEqual([]);
  });
  it('does not pay for a quest that is not completed', () => {
    const t = rig('knight', {}, []);
    expect(retroGrant(t.ports)).toEqual([]);
  });
  it('works without a questDone port (outcome flags only)', () => {
    const t = rig('knight', outcomes('ashen-prior'));
    delete t.ports.questDone;
    expect(retroGrant(t.ports)).toHaveLength(1);
  });
  it('covers all six bosses: a Murkjaw drop a full stack refused is paid on the next load once room frees', () => {
    const t = rig('knight', outcomes('murkjaw', 'corvin-skarl'));
    t.inv.add('shard-gem.bulwark', 10); // Murkjaw is gem A
    expect(grantBossGem(t.ports, 'murkjaw')).toBeNull();
    expect(t.state.flags[grantedFlag('murkjaw')]).toBeUndefined();
    expect(retroGrant(t.ports).map((g) => g?.bossId)).toEqual(['corvin-skarl']);
    t.inv.remove('shard-gem.bulwark', 1);
    expect(retroGrant(t.ports)).toEqual([{ bossId: 'murkjaw', gemId: 'shard-gem.bulwark' }]);
    expect(retroGrant(t.ports)).toEqual([]);
  });
  it('pays nothing without a class, then everything once one is chosen', () => {
    const t = rig(null, outcomes('ashen-prior', 'gaffer-grimtooth', 'thrandil-redmane', 'the-slagmaw'));
    expect(retroGrant(t.ports)).toEqual([]);
    t.state.cls = 'ashblade';
    expect(retroGrant(t.ports)).toHaveLength(4);
    expect(t.inv.count('shard-gem.nightedge')).toBe(2);
    expect(t.inv.count('shard-gem.quickstep')).toBe(2);
  });
  it('pays twice-run once', () => {
    const t = rig('knight', outcomes('ashen-prior', 'gaffer-grimtooth'));
    expect(retroGrant(t.ports)).toHaveLength(2);
    expect(retroGrant(t.ports)).toEqual([]);
    expect(t.gems().reduce((n, g) => n + g.count, 0)).toBe(2);
  });
  it('pays a live drop then the retro-grant as one gem', () => {
    const t = rig('knight', outcomes('ashen-prior'));
    grantBossGem(t.ports, 'ashen-prior');
    expect(retroGrant(t.ports)).toEqual([]);
    expect(t.inv.count('shard-gem.bulwark')).toBe(1);
  });
  it('pays the retro-grant then a live drop as one gem', () => {
    const t = rig('knight', outcomes('ashen-prior'));
    retroGrant(t.ports);
    expect(grantBossGem(t.ports, 'ashen-prior')).toBeNull();
    expect(t.inv.count('shard-gem.bulwark')).toBe(1);
  });
  it('retries a full stack later without double paying the rest', () => {
    const t = rig('knight', outcomes('ashen-prior', 'thrandil-redmane'));
    t.inv.add('shard-gem.bulwark', 10); // both are gem A
    expect(retroGrant(t.ports)).toEqual([]);
    t.inv.remove('shard-gem.bulwark', 1);
    expect(retroGrant(t.ports).map((g) => g?.bossId)).toEqual(['ashen-prior']);
    expect(t.state.flags[grantedFlag('thrandil-redmane')]).toBeUndefined();
    t.inv.remove('shard-gem.bulwark', 1);
    expect(retroGrant(t.ports).map((g) => g?.bossId)).toEqual(['thrandil-redmane']);
    expect(retroGrant(t.ports)).toEqual([]);
  });
});

describe('bossBeaten', () => {
  it('reads the outcome flag or the quest, and rejects non-gem bosses', () => {
    expect(bossBeaten({ getFlag: () => 'defeated' }, 'ashen-prior')).toBe(true);
    expect(bossBeaten({ getFlag: () => undefined, questDone: (q) => q === 'd02' }, 'gaffer-grimtooth')).toBe(true);
    expect(bossBeaten({ getFlag: () => undefined, questDone: (q) => q === 'd02' }, 'ashen-prior')).toBe(false);
    expect(bossBeaten({ getFlag: () => 'defeated' }, 'hathren')).toBe(false);
    expect(GEM_BOSSES.map((b) => b.questId)).toEqual(['d01', 'd02', 'd03', 'd04', 'd05', 'd06']);
  });
});

describe('flag ownership', () => {
  it('registers the granted flag family for K10 and every boss flag fits one path segment', () => {
    const row = ACT3_FLAG_OWNERS.find((o) => o.pattern === 'gear.shardgem.granted.<id>');
    expect(row?.owner).toBe('K10');
    for (const b of GEM_BOSSES) expect(grantedFlag(b.bossId)).toMatch(/^gear\.shardgem\.granted\.[a-z0-9-]+$/);
  });
});
