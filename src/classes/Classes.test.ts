import { describe, expect, it, vi } from 'vitest';
import type { ClassId } from '../actors/classes';
import { Progression, type GoldPort } from '../progression/Progression';
import { SKILLS } from '../progression/skills';
import { respecGold, xpForLevel } from '../progression/tuning';
import { Classes, type ClassInventory } from './Classes';
import { DrillRunner, type DrillPorts } from './DrillRunner';
import { DEFAULT_KITS } from './kits';
import type { ClassKit, DrillStepDef } from './types';

interface Evt {
  type: string;
  payload: any;
}

function make(opts: { gold?: number; level?: number; flags?: Record<string, boolean>; combat?: boolean } = {}) {
  const events: Evt[] = [];
  const warnings: string[] = [];
  const flags = new Map<string, unknown>();
  for (const id of ['knight', 'warden', 'emberwright', 'ashblade', 'pathfinder']) flags.set(`classes.available.${id}`, true);
  for (const [k, v] of Object.entries(opts.flags ?? {})) flags.set(k, v);
  const goldBox = { gold: opts.gold ?? 0 };
  const takeReasons: (string | undefined)[] = [];
  const gold: GoldPort = {
    get gold() { return goldBox.gold; },
    addGold(n) { goldBox.gold += n; },
    takeGold(n, reason) {
      takeReasons.push(reason);
      const t = Math.min(goldBox.gold, n);
      goldBox.gold -= t;
      return t;
    },
  };
  const emit = (type: string, payload: unknown): void => void events.push({ type, payload });
  const actor = { id: 'player', kind: 'player', team: 'player', level: 1, health: 120, maxHealth: 120, stamina: 100, maxStamina: 100, dead: false, restoreStamina() {} };
  const p = new Progression({
    emit: emit as never,
    logger: { warn: () => {} },
    actor: () => actor,
    flags: { get: (k) => flags.get(k), set: (k, v) => void flags.set(k, v) },
    gold: () => gold,
  });
  p.grantXp(xpForLevel(opts.level ?? 3), 'test');

  const inv = {
    has: vi.fn((_id: string) => true),
    equip: vi.fn((_id: string) => ({ ok: true }) as never),
    unequip: vi.fn((_slot: string) => true),
  } satisfies ClassInventory as ClassInventory & { has: any; equip: any; unequip: any };

  const state = { combat: opts.combat ?? false };
  const dress = vi.fn<(c: ClassId) => void>();
  const drillEmits: unknown[] = [];
  const dp: DrillPorts = {
    prompts: () => ({ count: () => 0, show: () => {}, hide: () => {} }),
    enemies: () => undefined,
    pauseKillXp: () => () => {},
    wornClass: () => null,
    hasSkills: () => true,
    canBuySkill: () => true,
    hasBarAbility: () => true,
    distanceFromYard: () => 0,
    hasString: () => false,
    emit: (e) => void drillEmits.push(e),
  };
  const runner = new DrillRunner(dp);
  const items = new Set(['woodcutters-axe', 'hide-jerkin', 'apprentices-staff', 'wool-robe', 'alley-knives', 'leather-vest', 'hunting-crossbow', 'rangers-cloak']);
  const c = new Classes(
    {
      progression: () => p,
      inventory: () => inv,
      flag: (k) => flags.get(k),
      inCombat: () => state.combat,
      emit: emit as never,
      itemExists: (id) => items.has(id),
      dress,
      warn: (m) => void warnings.push(m),
    },
    runner,
  );
  const learnFirst = (): string => {
    const s = SKILLS.find((k) => k.classId === 'knight' && k.available && k.tier === 1)!;
    expect(p.learn(s.id).ok).toBe(true);
    return s.id;
  };
  const evs = (type: string): Evt[] => events.filter((e) => e.type === type);
  return { c, p, runner, inv, dress, events, evs, warnings, goldBox, takeReasons, state, flags, learnFirst, drillEmits };
}

const STEP: DrillStepDef[] = [{ id: 'attack1', mechanic: 'attack1', action: 'attack1', count: 1 }];

describe('Classes.choose', () => {
  it('takes a class: setClass, grants the starter set, equips, emits, dresses and starts the drill', () => {
    const t = make();
    expect(t.c.chosen()).toBe(false);
    expect(t.c.current()).toBe('knight');
    expect(t.c.choose('warden')).toEqual({ ok: true });
    expect(t.p.classId).toBe('warden');
    expect(t.c.chosen()).toBe(true);
    expect(t.evs('loot.granted')).toEqual([
      { type: 'loot.granted', payload: { sourceId: 'trainer:stane', items: [{ itemId: 'woodcutters-axe', count: 1 }, { itemId: 'hide-jerkin', count: 1 }] } },
    ]);
    expect(t.inv.equip).toHaveBeenCalledWith('woodcutters-axe');
    expect(t.inv.equip).toHaveBeenCalledWith('hide-jerkin');
    expect(t.inv.unequip).toHaveBeenCalledWith('offhand');
    expect(t.evs('class.chosen')).toEqual([{ type: 'class.chosen', payload: { classId: 'warden' } }]);
    expect(t.dress).toHaveBeenCalledWith('warden');
    expect(t.c.drill()?.classId).toBe('warden');
  });

  it('refunds learned knight skills for a new class without using the free respec', () => {
    const t = make();
    t.learnFirst();
    const before = t.p.skillPoints;
    t.c.choose('warden');
    expect(t.p.learnedSkills()).toEqual([]);
    expect(t.p.skillPoints).toBeGreaterThan(before);
    expect(t.p.respecQuote().free).toBe(true);
    expect((t.p.serialize() as { respecUsed: boolean }).respecUsed).toBe(false);
  });

  it('the knight keeps knight skills, grants nothing and equips owned starter pieces', () => {
    const t = make();
    const id = t.learnFirst();
    expect(t.c.choose('knight')).toEqual({ ok: true });
    expect(t.p.learnedSkills()).toEqual([id]);
    expect(t.evs('loot.granted')).toEqual([]);
    expect(t.inv.equip.mock.calls.map((x: string[]) => x[0])).toEqual(['squires-arming-sword', 'wooden-round-shield', 'gauts-spare-tabard']);
    expect(t.inv.unequip).not.toHaveBeenCalled();
  });

  it('refuses a second choice', () => {
    const t = make();
    t.c.choose('warden');
    expect(t.c.choose('ashblade')).toEqual({ ok: false, reason: 'already-chosen' });
    expect(t.p.classId).toBe('warden');
  });

  it('refuses without the available flag, in combat and for an unknown id', () => {
    const t = make({ flags: { 'classes.available.warden': false } });
    expect(t.c.available('warden')).toBe(false);
    expect(t.c.choose('warden')).toEqual({ ok: false, reason: 'no-permit' });
    t.state.combat = true;
    expect(t.c.choose('ashblade')).toEqual({ ok: false, reason: 'combat' });
    expect(t.c.choose('wizard' as ClassId)).toEqual({ ok: false, reason: 'unknown' });
    expect(t.p.classId).toBeNull();
    expect(t.evs('class.chosen')).toEqual([]);
  });

  it('skips a starter item that is not defined, with a warning', () => {
    const t = make();
    t.c.choose('pathfinder');
    const granted = t.evs('loot.granted')[0].payload.items.map((s: { itemId: string }) => s.itemId);
    expect(granted).toEqual(['hunting-crossbow', 'rangers-cloak']);
    expect(t.warnings).toHaveLength(1);
    expect(t.warnings[0]).toContain('crossbow-bolts');
  });
});

describe('Classes.change', () => {
  function chosen(opts: Parameters<typeof make>[0] = {}) {
    const t = make(opts);
    t.c.choose('warden');
    t.events.length = 0;
    t.inv.equip.mockClear();
    t.dress.mockClear();
    return t;
  }

  it('with skills learned the first change is free and uses the free respec', () => {
    const t = make({ gold: 1000, level: 3 });
    t.learnFirst();
    t.c.choose('knight');
    t.events.length = 0;
    const permit = t.p.allowRespec('trainer');
    expect(t.c.changeQuote('warden')).toEqual({ ok: true, free: true, gold: 0, canAfford: true });
    expect(t.c.change('warden')).toEqual({ ok: true });
    expect(t.evs('class.changed')[0].payload).toEqual({ classId: 'warden', previous: 'knight', free: true, cost: 0 });
    expect((t.p.serialize() as { respecUsed: boolean }).respecUsed).toBe(true);
    expect(t.takeReasons).toEqual([]);

    permit();
  });

  it('a paid change charges respecGold(level) through the gold port', () => {
    const t = make({ gold: 1000, level: 3 });
    t.c.choose('knight');
    t.learnFirst();
    t.p.allowRespec('trainer');
    // Burn the free respec first.
    expect(t.p.respec().ok).toBe(true);
    t.learnFirst();
    const price = respecGold(t.p.level);
    expect(price).toBe(25 * t.p.level);
    t.events.length = 0;
    expect(t.c.changeQuote('warden')).toEqual({ ok: true, free: false, gold: price, canAfford: true });
    expect(t.c.change('warden')).toEqual({ ok: true });
    expect(t.takeReasons).toEqual(['respec']);
    expect(t.goldBox.gold).toBe(1000 - price);
    expect(t.evs('class.changed')[0].payload).toEqual({ classId: 'warden', previous: 'knight', free: false, cost: price });
  });

  it('without enough gold: no-gold, nothing changed and takeGold is never called', () => {
    const t = make({ gold: 10, level: 3 });
    t.c.choose('knight');
    t.learnFirst();
    t.p.allowRespec('trainer');
    t.p.respec();
    t.learnFirst();
    t.events.length = 0;
    const learned = t.p.learnedSkills().slice();
    expect(t.c.changeQuote('warden')).toMatchObject({ ok: true, free: false, canAfford: false });
    expect(t.c.change('warden')).toEqual({ ok: false, reason: 'no-gold' });
    expect(t.p.classId).toBe('knight');
    expect(t.p.learnedSkills()).toEqual(learned);
    expect(t.takeReasons).toEqual([]);
    expect(t.goldBox.gold).toBe(10);
    expect(t.events).toEqual([]);
  });

  it('refuses the same class, an unchosen state, combat and unknown ids', () => {
    const t = chosen();
    t.p.allowRespec('trainer');
    expect(t.c.change('warden')).toEqual({ ok: false, reason: 'same' });
    expect(t.c.changeQuote('warden')).toEqual({ ok: false, reason: 'same' });
    expect(t.c.change('nope' as ClassId)).toEqual({ ok: false, reason: 'unknown' });
    t.state.combat = true;
    expect(t.c.change('ashblade')).toEqual({ ok: false, reason: 'combat' });
    expect(t.c.changeQuote('ashblade')).toEqual({ ok: false, reason: 'combat' });
    const fresh = make();
    expect(fresh.c.change('warden')).toEqual({ ok: false, reason: 'not-chosen' });
    expect(fresh.c.changeQuote('warden')).toEqual({ ok: false, reason: 'not-chosen' });
  });

  it('with nothing learned the change is free and respecUsed stays unchanged', () => {
    const t = chosen();
    t.p.allowRespec('trainer');
    expect(t.c.changeQuote('ashblade')).toEqual({ ok: true, free: true, gold: 0, canAfford: true });
    expect(t.c.change('ashblade')).toEqual({ ok: true });
    expect((t.p.serialize() as { respecUsed: boolean }).respecUsed).toBe(false);
    expect(t.evs('class.changed')[0].payload).toMatchObject({ free: true, cost: 0 });
  });

  it('with skills learned but no permit the change is refused (no-permit)', () => {
    const t = make();
    t.c.choose('knight');
    t.learnFirst();
    expect(t.c.change('warden')).toEqual({ ok: false, reason: 'no-permit' });
    expect(t.p.classId).toBe('knight');
  });

  it('cancels a running drill, recording it as skipped', () => {
    const t = chosen();
    t.p.allowRespec('trainer');
    expect(t.c.drill()).not.toBeNull();
    t.c.change('ashblade');
    expect(t.c.drill()).toBeNull();
    expect(t.c.drillOutcome('warden')).toBe('skipped');
  });

  it('grants the starter set only the first time a class is taken', () => {
    const t = chosen();
    t.p.allowRespec('trainer');
    t.c.change('ashblade');
    expect(t.evs('loot.granted')).toHaveLength(1);
    t.c.change('warden');
    t.c.change('ashblade');
    expect(t.evs('loot.granted')).toHaveLength(1);
    expect(t.evs('loot.granted')[0].payload.sourceId).toBe('trainer:gerta');
  });
});

describe('Classes drills', () => {
  it('startDrill needs a chosen class and no running drill; skipDrill records skipped', () => {
    const t = make();
    expect(t.c.startDrill()).toBe(false);
    t.c.choose('warden');
    expect(t.c.startDrill()).toBe(false);
    expect(t.c.skipDrill()).toBe(true);
    expect(t.c.drillOutcome('warden')).toBe('skipped');
    expect(t.c.skipDrill()).toBe(false);
    expect(t.c.startDrill()).toBe(true);
  });
});

describe('Classes.registerKit', () => {
  const warden = (over: Partial<ClassKit> = {}): ClassKit => ({ ...DEFAULT_KITS.warden, nameKey: 'custom.warden', ...over });

  it('a valid kit replaces the default and dispose restores it', () => {
    const t = make();
    const r = t.c.registerKit(warden());
    expect(r.ok).toBe(true);
    expect(t.c.kit('warden')?.nameKey).toBe('custom.warden');
    if (r.ok) r.dispose();
    expect(t.c.kit('warden')).toBe(DEFAULT_KITS.warden);
  });

  it('refuses a second kit for the same class until the first is disposed, and a stale dispose does nothing', () => {
    const t = make();
    const a = t.c.registerKit(warden({ nameKey: 'a' }));
    expect(t.c.registerKit(warden({ nameKey: 'b' }))).toEqual({ ok: false, reason: 'duplicate' });
    expect(t.c.kit('warden')?.nameKey).toBe('a');
    if (a.ok) a.dispose();
    const b = t.c.registerKit(warden({ nameKey: 'b' }));
    expect(b.ok).toBe(true);
    if (a.ok) a.dispose();
    expect(t.c.kit('warden')?.nameKey).toBe('b');
  });

  it('refuses a bad class, a bad kit and a different trainer', () => {
    const t = make();
    expect(t.c.registerKit({ ...warden(), classId: 'zzz' as ClassId })).toEqual({ ok: false, reason: 'bad-class' });
    expect(t.c.registerKit({ ...warden(), model: 3 as never })).toEqual({ ok: false, reason: 'bad-kit' });
    expect(t.c.registerKit({ ...warden(), drill: [{ id: 'x', mechanic: 'block', action: 'block', count: 0 }] })).toEqual({ ok: false, reason: 'bad-kit' });
    expect(t.c.registerKit(warden({ trainer: { npcId: 'someone', nameKey: 'x' } }))).toEqual({ ok: false, reason: 'bad-kit' });
    expect(t.c.kit('warden')).toBe(DEFAULT_KITS.warden);
  });

  it('a kit drill is used when the class is chosen', () => {
    const t = make();
    t.c.registerKit(warden({ drill: STEP }));
    t.c.choose('warden');
    expect(t.c.drill()?.steps).toBe(1);
  });
});

describe('Classes save', () => {
  it('round trips drills and starterGranted', () => {
    const t = make();
    t.c.choose('warden');
    t.c.skipDrill();
    const saved = t.c.serialize();
    expect(saved).toEqual({ drills: { warden: 'skipped' }, starterGranted: ['warden'] });
    const other = make();
    other.c.load(JSON.parse(JSON.stringify(saved)));
    expect(other.c.serialize()).toEqual(saved);
    expect(other.c.drillOutcome('warden')).toBe('skipped');
  });

  it('undefined and garbage give defaults; bad entries are dropped', () => {
    const t = make();
    t.c.choose('warden');
    t.c.load(undefined);
    expect(t.c.serialize()).toEqual({ drills: {}, starterGranted: [] });
    t.c.load(42);
    t.c.load([1, 2]);
    t.c.load({ drills: { warden: 'done', nope: 'done', knight: 'weird' }, starterGranted: ['ashblade', 'x', 7] });
    expect(t.c.serialize()).toEqual({ drills: { warden: 'done' }, starterGranted: ['ashblade'] });
    t.c.load({ drills: 5, starterGranted: 'warden' });
    expect(t.c.serialize()).toEqual({ drills: {}, starterGranted: [] });
  });

  it('load cancels a running drill silently', () => {
    const t = make();
    t.c.choose('warden');
    expect(t.c.drill()).not.toBeNull();
    t.c.load({});
    expect(t.c.drill()).toBeNull();
    expect(t.drillEmits).toEqual([]);
    expect(t.c.drillOutcome('warden')).toBeNull();
  });
});
