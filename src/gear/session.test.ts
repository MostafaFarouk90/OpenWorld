import { describe, expect, it, vi } from 'vitest';
import { pickAffix } from './affixes';
import { PATTERNS } from './rhythm';
import { createTemperingSession, type GearState, type SessionPorts } from './session';
import { STEP, metronome, testInventory } from './testkit';

function make(items: Record<string, number>, gold: number, o: { m14?: string; state?: GearState } = {}) {
  const inv = testInventory(items, gold);
  const state: GearState = o.state ?? { anvilTiers: [], lessonRuns: 0 };
  const m14 = { v: o.m14 ?? 'completed' };
  const clock = { t: 0 };
  const emitted: unknown[] = [];
  const ports: SessionPorts = {
    inventory: inv,
    state,
    now: () => clock.t,
    makeClock: () => metronome(),
    anvilUsable: () => ['active', 'completed'].includes(m14.v),
    smithUsable: () => m14.v === 'completed',
    lessonActive: () => m14.v === 'active',
    emitTempered: (p) => emitted.push(p),
  };
  const s = createTemperingSession(ports);
  /** Plays the whole bar of tier `tier`, each strike `off` ms late, then lets the window close. */
  const play = (tier: 1 | 2 | 3, off = 0, skip: number[] = []) => {
    PATTERNS[tier].forEach((st, i) => {
      if (!skip.includes(i)) s.strike((4 + st) * STEP + off);
    });
    s.update((4 + 16) * STEP);
  };
  return { s, inv, state, m14, clock, emitted, play };
}

describe('session state machine', () => {
  it('opens only when the station is usable', () => {
    const t = make({}, 0, { m14: 'inactive' });
    expect(t.s.open('anvil')).toBe(false);
    expect(t.s.open('smith')).toBe(false);
    expect(t.s.state).toBe('idle');
    t.m14.v = 'active';
    expect(t.s.open('smith')).toBe(false); // smith needs completed
    expect(t.s.open('anvil')).toBe(true);
    expect(t.s.open('anvil')).toBe(false); // already open
  });

  it('runs picking -> rhythm -> affix-reveal -> result -> picking on a perfect anvil run', () => {
    const t = make({ 'halvard-steel-blade': 1, 'iron-ore': 1, coal: 1 }, 100);
    const seen: string[] = [];
    t.s.subscribe(() => seen.push(t.s.state));
    t.s.open('anvil');
    t.s.select('halvard-steel-blade');
    t.s.start();
    expect(t.s.state).toBe('rhythm');
    expect(t.s.view().run?.steps).toEqual(PATTERNS[2]);
    t.play(2);
    const affix = pickAffix('halvard-steel-blade', 1);
    expect(t.s.state).toBe('affix-reveal');
    expect(t.s.view().lastResult).toEqual({ ok: true, perfect: true, level: 1, affix });
    expect(t.emitted).toEqual([{ itemId: 'halvard-steel-blade', level: 1, affix }]);
    expect(t.inv.gear('halvard-steel-blade')).toEqual({ temper: 1, affix });
    expect(t.inv.gold).toBe(60);
    expect(t.state.anvilTiers).toEqual([2]);
    t.s.confirm();
    expect(t.s.state).toBe('result');
    t.s.confirm();
    expect(t.s.state).toBe('picking');
    expect(seen).toContain('rhythm');
  });

  it('a non-perfect run still tempers but grants no affix', () => {
    const t = make({ 'practice-sword': 1 }, 100);
    t.s.open('anvil');
    t.s.select('practice-sword');
    t.s.start();
    t.play(1, 80); // good, not perfect
    expect(t.s.state).toBe('result');
    expect(t.s.view().lastResult).toEqual({ ok: true, perfect: false, level: 1 });
    expect(t.inv.gear('practice-sword')).toEqual({ temper: 1 });
    expect(t.emitted).toEqual([{ itemId: 'practice-sword', level: 1 }]);
  });

  it('missed strikes and a stray press forfeit the affix but never the temper', () => {
    const t = make({ 'practice-sword': 1 }, 100);
    t.s.open('anvil');
    t.s.select('practice-sword');
    t.s.start();
    t.play(1, 0, [0, 1, 2, 3]);
    expect(t.s.view().lastResult).toMatchObject({ ok: true, perfect: false });
    const u = make({ 'practice-sword': 1 }, 100);
    u.s.open('anvil');
    u.s.select('practice-sword');
    u.s.start();
    u.s.strike(STEP); // stray in the count-in
    u.play(1);
    expect(u.s.view().lastResult).toMatchObject({ ok: true, perfect: false });
    expect(u.inv.gear('practice-sword').affix).toBeUndefined();
  });

  it('offers keep or replace when the piece already has a different affix', () => {
    const mk = () => {
      const t = make({ 'practice-sword': 1 }, 100);
      const other = pickAffix('practice-sword', 2) === 'ember' ? 'gleam' : 'ember';
      t.inv.setTemper('practice-sword', 1, other);
      t.s.open('anvil');
      t.s.select('practice-sword');
      t.s.start();
      t.play(1);
      return { t, other, fresh: pickAffix('practice-sword', 2) };
    };
    const a = mk();
    expect(a.t.s.state).toBe('affix-reveal');
    expect(a.t.s.view().affix).toEqual({ affix: a.fresh, existing: a.other, choice: true });
    expect(a.t.inv.gear('practice-sword').temper).toBe(1); // nothing applied yet
    a.t.s.confirm(); // does not skip the choice
    expect(a.t.s.state).toBe('affix-reveal');
    a.t.s.keepAffix();
    expect(a.t.inv.gear('practice-sword')).toEqual({ temper: 2, affix: a.other });
    expect(a.t.s.state).toBe('result');
    expect(a.t.emitted).toEqual([{ itemId: 'practice-sword', level: 2 }]);
    const b = mk();
    b.t.s.replaceAffix();
    expect(b.t.inv.gear('practice-sword')).toEqual({ temper: 2, affix: b.fresh });
    expect(b.t.emitted).toEqual([{ itemId: 'practice-sword', level: 2, affix: b.fresh }]);
  });

  it('refuses at start without taking anything (no gold, materials, cap, not held, locked)', () => {
    const t = make({ 'halvard-steel-blade': 1, 'iron-ore': 1 }, 100);
    t.s.open('anvil');
    t.s.select('halvard-steel-blade');
    t.s.start();
    expect(t.s.state).toBe('picking');
    expect(t.s.view().lastResult).toMatchObject({ ok: false, reason: 'no-materials' });
    expect(t.inv.gold).toBe(100);
    const capped = make({ 'practice-sword': 1 }, 1000);
    capped.inv.setTemper('practice-sword', 5);
    capped.s.open('anvil');
    capped.s.select('practice-sword');
    capped.s.start();
    expect(capped.s.view().lastResult).toMatchObject({ reason: 'at-cap' });
    // Selecting an item that is not held is ignored.
    capped.s.select('ashplate');
    expect(capped.s.view().selected).toBe('practice-sword');
    // Locked mid-session: the station goes away.
    const l = make({ 'practice-sword': 1 }, 100);
    l.s.open('anvil');
    l.s.select('practice-sword');
    l.m14.v = 'inactive';
    l.s.start();
    expect(l.s.view().lastResult).toMatchObject({ reason: 'locked' });
    expect(l.s.state).toBe('picking');
    expect(l.emitted).toEqual([]);
  });

  it('a gold loss during the run turns into a refusal at the end, still taking nothing', () => {
    const t = make({ 'practice-sword': 1 }, 15);
    t.s.open('anvil');
    t.s.select('practice-sword');
    t.s.start();
    t.inv.takeGold(15);
    t.play(1);
    expect(t.s.view().lastResult).toMatchObject({ ok: false, reason: 'no-gold' });
    expect(t.emitted).toEqual([]);
    expect(t.state.anvilTiers).toEqual([]);
  });

  it('close cancels a run and takes nothing', () => {
    const t = make({ 'practice-sword': 1 }, 50);
    t.s.open('anvil');
    t.s.select('practice-sword');
    t.s.start();
    t.s.close();
    expect(t.s.state).toBe('idle');
    t.s.strike(4 * STEP);
    expect(t.inv.gold).toBe(50);
    expect(t.s.view().items).toEqual([]);
  });

  it('ignores commands in the wrong state', () => {
    const t = make({ 'practice-sword': 1 }, 50);
    t.s.start();
    t.s.strike(0);
    t.s.confirm();
    t.s.keepAffix();
    t.s.replaceAffix();
    t.s.forge('brigandine');
    t.s.close();
    expect(t.s.state).toBe('idle');
  });
});

describe('smith', () => {
  it('pays without a run, no affix, once the tier has been done at the anvil', () => {
    const t = make({ 'practice-sword': 1 }, 100, { state: { anvilTiers: [1], lessonRuns: 0 } });
    t.s.open('smith');
    t.s.select('practice-sword');
    t.s.start();
    expect(t.s.state).toBe('result');
    expect(t.s.view().lastResult).toEqual({ ok: true, perfect: false, level: 1 });
    expect(t.inv.gold).toBe(85);
    expect(t.emitted).toEqual([{ itemId: 'practice-sword', level: 1 }]);
    expect(t.state.anvilTiers).toEqual([1]);
  });
  it('sends the first temper of a tier to the anvil', () => {
    const t = make({ 'practice-sword': 1 }, 100);
    t.s.open('smith');
    t.s.select('practice-sword');
    t.s.start();
    expect(t.s.state).toBe('picking');
    expect(t.s.view().lastResult).toMatchObject({ ok: false, reason: 'anvil-first' });
    expect(t.s.view().items[0].blockedBy).toBe('anvil-first');
    expect(t.inv.gold).toBe(100);
  });
});

describe('lesson runs', () => {
  it('make the first two anvil tempers free while m14 is active, then charge', () => {
    const t = make({ 'practice-sword': 1 }, 0, { m14: 'active' });
    for (let i = 1; i <= 2; i++) {
      t.s.open('anvil');
      t.s.select('practice-sword');
      expect(t.s.view().free).toBe(true);
      t.s.start();
      t.play(1, 80);
      expect(t.s.view().lastResult).toMatchObject({ ok: true, level: i });
      t.s.close();
    }
    expect(t.state.lessonRuns).toBe(2);
    expect(t.inv.gold).toBe(0);
    t.s.open('anvil');
    t.s.select('practice-sword');
    expect(t.s.view().free).toBe(false);
    t.s.start();
    expect(t.s.view().lastResult).toMatchObject({ reason: 'no-gold' });
  });
  it('are not free once m14 is completed', () => {
    const t = make({ 'practice-sword': 1 }, 0, { m14: 'completed' });
    t.s.open('anvil');
    t.s.select('practice-sword');
    expect(t.s.view().free).toBe(false);
    t.s.start();
    expect(t.s.view().lastResult).toMatchObject({ reason: 'no-gold' });
    expect(t.state.lessonRuns).toBe(0);
  });
});

describe('forge through the session', () => {
  it('forges at the anvil and lists the recipe in the item row', () => {
    const t = make({ brigandine: 1, 'cinder-steel-ingot': 1 }, 200);
    t.inv.equip('brigandine');
    t.s.open('anvil');
    const row = t.s.view().items[0];
    expect(row.forge).toEqual({ to: 'ashplate', gold: 120, ingots: 1, canAfford: true });
    t.s.forge('brigandine');
    expect(t.s.view().lastResult).toEqual({ ok: true, perfect: false, forged: 'ashplate' });
    expect(t.inv.equipped('armour')).toBe('ashplate');
    expect(t.s.state).toBe('picking');
    t.s.forge('brigandine');
    expect(t.s.view().lastResult).toMatchObject({ ok: false, reason: 'not-held' });
  });
  it('is anvil only', () => {
    const t = make({ brigandine: 1, 'cinder-steel-ingot': 1 }, 200, { state: { anvilTiers: [2], lessonRuns: 0 } });
    t.s.open('smith');
    expect(t.s.view().items[0].forge).toBeNull();
    t.s.forge('brigandine');
    expect(t.inv.has('brigandine')).toBe(true);
  });
  it('is refused when the anvil is locked mid-session', () => {
    const t = make({ brigandine: 1, 'cinder-steel-ingot': 1 }, 200);
    t.s.open('anvil');
    t.m14.v = 'inactive';
    t.s.forge('brigandine');
    expect(t.s.view().lastResult).toMatchObject({ reason: 'locked' });
    expect(t.inv.has('brigandine')).toBe(true);
  });
});

describe('view', () => {
  it('lists temperable pieces with cost, affordability and materials', () => {
    const t = make({ 'halvard-steel-blade': 1, 'iron-ore': 2, 'healing-flask': 3, ashplate: 1 }, 50);
    expect(t.s.view().items).toEqual([]);
    t.s.open('anvil');
    const v = t.s.view();
    expect(v.items.map((i) => i.id).sort()).toEqual(['ashplate', 'halvard-steel-blade']);
    const blade = v.items.find((i) => i.id === 'halvard-steel-blade')!;
    expect(blade).toMatchObject({ tier: 2, temper: 0, canAfford: false, blockedBy: 'no-materials' });
    expect(blade.nextCost?.gold).toBe(40);
    expect(v.materials).toEqual({ ore: 2, coal: 0, ingot: 0 });
    expect(v.gold).toBe(50);
  });
  it('notifies subscribers and stops after unsubscribe', () => {
    const t = make({}, 0);
    const fn = vi.fn();
    const off = t.s.subscribe(fn);
    t.s.open('anvil');
    expect(fn).toHaveBeenCalled();
    off();
    fn.mockClear();
    t.s.close();
    expect(fn).not.toHaveBeenCalled();
  });
});
