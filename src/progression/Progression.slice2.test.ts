import { afterEach, describe, expect, it } from 'vitest';
import { classStats, hasClassStats, registerClassStats, resetClassStats } from './classStats';
import { Progression, type GoldPort } from './Progression';
import { getSkill, registerClassSkills, resetClassSkills, SKILLS, TIER_COST, type SkillDef } from './skills';
import { fakeActor, type Evt } from './testkit';
import { baseMaxHealthForLevel, respecGold, xpForLevel } from './tuning';

function make(opts: { gold?: number; flags?: boolean } = {}) {
  const events: Evt[] = [];
  const warnings: string[] = [];
  const flags = new Map<string, unknown>();
  const goldBox = { gold: opts.gold ?? 0 };
  const gold: GoldPort = {
    get gold() { return goldBox.gold; },
    addGold(n) { goldBox.gold += n; },
    takeGold(n) { const t = Math.min(goldBox.gold, n); goldBox.gold -= t; return t; },
  };
  const actor = fakeActor();
  const p = new Progression({
    emit: (type, payload) => events.push({ type, payload }),
    logger: { warn: (m) => warnings.push(m) },
    actor: () => actor,
    flags: opts.flags === false ? undefined : { get: (k) => flags.get(k), set: (k, v) => void flags.set(k, v) },
    gold: () => gold,
  });
  return { p, events, warnings, flags, goldBox, actor };
}

afterEach(() => {
  resetClassSkills();
  resetClassStats();
});

describe('granted abilities (the Leap)', () => {
  it('grants once: flag set, ability.learned emitted once, second grant is a no-op', () => {
    const { p, events, flags } = make();
    expect(p.hasAbility('surge-leap')).toBe(false);
    expect(p.grantAbility('surge-leap', 'm03')).toBe(true);
    expect(flags.get('ability.surge-leap.learned')).toBe(true);
    expect(p.hasAbility('surge-leap')).toBe(true);
    expect(p.grantAbility('surge-leap', 'm03')).toBe(false);
    expect(events.filter((e) => e.type === 'ability.learned')).toEqual([{ type: 'ability.learned', payload: { id: 'surge-leap', source: 'm03' } }]);
  });
  it('the flag is the single source: a flag set elsewhere (a loaded save) counts', () => {
    const { p, flags } = make();
    flags.set('ability.surge-leap.learned', true);
    expect(p.hasAbility('surge-leap')).toBe(true);
    expect(p.grantAbility('surge-leap', 'again')).toBe(false);
  });
  it('refuses bad ids and works only with a flag store', () => {
    expect(make().p.grantAbility('', 'x')).toBe(false);
    const none = make({ flags: false });
    expect(none.p.grantAbility('surge-leap', 'x')).toBe(false);
    expect(none.p.hasAbility('surge-leap')).toBe(false);
  });
  it('is not a tree skill, so it costs no points and survives a respec', () => {
    const { p, flags } = make();
    p.grantAbility('surge-leap', 'm03');
    p.grantXp(xpForLevel(3), 'x');
    p.learn('knight.rimBash');
    p.allowRespec('shrine');
    expect(p.respec().ok).toBe(true);
    expect(flags.get('ability.surge-leap.learned')).toBe(true);
    expect(getSkill('surge-leap')).toBeUndefined();
  });
});

describe('respec', () => {
  const learnSome = (p: Progression) => {
    p.grantXp(xpForLevel(6), 'x');
    p.learn('knight.rallyCry');
    p.learn('knight.rimBash');
    p.learn('knight.ironStance');
  };

  it('is refused without a permit, and nothing changes', () => {
    const { p } = make({ gold: 1000 });
    learnSome(p);
    const before = p.serialize();
    expect(p.respec()).toEqual({ ok: false, reason: 'no-permit' });
    expect(p.serialize()).toEqual(before);
  });

  it('the permit can be released, and two permits are independent', () => {
    const { p } = make();
    learnSome(p);
    const a = p.allowRespec('shrine');
    const b = p.allowRespec('trainer');
    a();
    expect(p.respec().ok).toBe(true);
    learnSome(p);
    b();
    expect(p.respec()).toEqual({ ok: false, reason: 'no-permit' });
  });

  it('the first respec is free, refunds every spent point, clears the bar, keeps the class', () => {
    const { p, events } = make();
    learnSome(p);
    p.setClass('knight');
    expect(p.skillPoints).toBe(5 - 3);
    p.allowRespec('shrine');
    expect(p.respecQuote()).toEqual({ free: true, gold: 0, canAfford: true });
    expect(p.respec()).toEqual({ ok: true, refunded: 3, cost: 0 });
    expect(p.skillPoints).toBe(5);
    expect(p.learnedSkills()).toEqual([]);
    expect(p.bar().every((s) => s === null)).toBe(true);
    expect(p.classId).toBe('knight');
    expect(events.some((e) => e.type === 'ability.bar.changed')).toBe(true);
    expect(events.filter((e) => e.type === 'skillpoints.changed').at(-1)?.payload).toEqual({ points: 5 });
  });

  it('later respecs cost 25 gold x level capped at 500, taken from the inventory', () => {
    const { p, goldBox } = make({ gold: 1000 });
    learnSome(p);
    p.allowRespec('shrine');
    p.respec(); // the free one
    p.learn('knight.rimBash');
    expect(p.respecQuote()).toEqual({ free: false, gold: respecGold(6), canAfford: true });
    expect(p.respec()).toEqual({ ok: true, refunded: 1, cost: 150 });
    expect(goldBox.gold).toBe(850);
    expect(respecGold(39)).toBe(500);
    expect(respecGold(1)).toBe(25);
  });

  it('without the gold it is refused and nothing changes, not even partial gold', () => {
    const { p, goldBox } = make({ gold: 100 });
    learnSome(p);
    p.allowRespec('shrine');
    p.respec();
    p.learn('knight.rimBash');
    const before = p.serialize();
    expect(p.respecQuote().canAfford).toBe(false);
    expect(p.respec()).toEqual({ ok: false, reason: 'no-gold' });
    expect(goldBox.gold).toBe(100);
    expect(p.serialize()).toEqual(before);
  });

  it('with nothing learned it is refused and the free use is kept', () => {
    const { p } = make();
    p.grantXp(xpForLevel(3), 'x');
    p.allowRespec('shrine');
    expect(p.respec()).toEqual({ ok: false, reason: 'nothing-learned' });
    expect(p.respecQuote().free).toBe(true);
  });

  it('without an inventory a paid respec is refused', () => {
    const { p } = make();
    (p as unknown as { deps: { gold?: unknown } }).deps.gold = undefined;
    learnSome(p);
    p.allowRespec('shrine');
    p.respec();
    p.learn('knight.rimBash');
    expect(p.respec()).toEqual({ ok: false, reason: 'no-gold' });
  });

  it('the used flag survives a save round trip', () => {
    const a = make();
    learnSome(a.p);
    a.p.allowRespec('s');
    a.p.respec();
    const b = make();
    b.p.load(JSON.parse(JSON.stringify(a.p.serialize())), 2);
    expect(b.p.respecQuote().free).toBe(false);
  });

  it('a respec drops Banner Plant (the banner module reads learned())', () => {
    const { p } = make();
    p.grantXp(xpForLevel(4), 'x');
    p.learn('knight.rallyCry');
    p.learn('knight.bannerPlant');
    expect(p.learned('knight.bannerPlant')).toBe(true);
    p.allowRespec('s');
    p.respec();
    expect(p.learned('knight.bannerPlant')).toBe(false);
  });
});

describe('classes', () => {
  it('no class reads as the Knight; the Knight row is Knight 120 + 10 per level', () => {
    const { p } = make();
    expect(p.classId).toBeNull();
    expect(p.baseMaxHealth()).toBe(120);
    expect(baseMaxHealthForLevel(5)).toBe(160);
    expect(classStats(null)).toEqual(classStats('knight'));
    expect(classStats('nope')).toEqual(classStats('knight'));
  });
  it('a registered class drives base max health and is re-applied by setClass', () => {
    const { p, actor } = make();
    expect(registerClassStats('warden', { health: 150, healthPerLevel: 14, stamina: 90, ember: 20 })).toEqual({ ok: true });
    p.setClass('warden');
    expect(p.baseMaxHealth()).toBe(150);
    expect(actor.maxHealth).toBe(150);
    p.grantXp(xpForLevel(3), 'x');
    expect(p.baseMaxHealth()).toBe(178);
    p.setClass(null);
    expect(p.baseMaxHealth()).toBe(140);
  });
  it('stats registration rejects duplicates, bad rows and bad ids', () => {
    expect(registerClassStats('knight', { health: 1, healthPerLevel: 1, stamina: 1, ember: 1 })).toEqual({ ok: false, reason: 'duplicate' });
    expect(registerClassStats('', { health: 1, healthPerLevel: 1, stamina: 1, ember: 1 })).toEqual({ ok: false, reason: 'bad-class' });
    expect(registerClassStats('x', { health: Number.NaN, healthPerLevel: 1, stamina: 1, ember: 1 })).toEqual({ ok: false, reason: 'bad-stats' });
    expect(registerClassStats('x', { health: 0, healthPerLevel: 1, stamina: 1, ember: 1 })).toEqual({ ok: false, reason: 'bad-stats' });
    expect(hasClassStats('x')).toBe(false);
  });
  it('a class row sets the stamina maximum and tells the listener its Ember maximum', () => {
    const rows: number[] = [];
    const actor = fakeActor();
    const p = new Progression({ emit: () => {}, actor: () => actor, onClassStats: (r) => rows.push(r.ember) });
    registerClassStats('mage', { health: 85, healthPerLevel: 6, stamina: 80, ember: 160 });
    actor.stamina = 100;
    p.setClass('mage');
    expect(actor.maxStamina).toBe(80);
    expect(actor.stamina).toBe(80);
    expect(rows).toEqual([160]);
    p.setClass(null);
    expect(actor.maxStamina).toBe(100);
    expect(actor.stamina).toBe(80);
    expect(rows).toEqual([160, 100]);
  });
  it('applyClassResources(true) fills stamina; a throwing listener is reported, not fatal', () => {
    const warnings: string[] = [];
    const actor = fakeActor();
    actor.stamina = 10;
    const p = new Progression({ emit: () => {}, actor: () => actor, logger: { warn: (m) => warnings.push(m) }, onClassStats: () => { throw new Error('boom'); } });
    p.applyClassResources(true);
    expect(actor.stamina).toBe(100);
    expect(warnings.some((w) => w.includes('class stats listener failed'))).toBe(true);
  });
  it('works without an actor or a listener', () => {
    const p = new Progression({ emit: () => {}, actor: () => null });
    expect(() => p.setClass('knight')).not.toThrow();
  });
  it("the Knight's row keeps the shipped Ember maximum of 100", () => {
    expect(classStats('knight').ember).toBe(100);
  });
});

describe('class skills', () => {
  const def = (name: string, tier: SkillDef['tier'], requires?: string): SkillDef => ({
    id: `warden.${name}`, classId: 'warden', branch: 'hewer', tier, cost: TIER_COST[tier - 1], requires,
    kind: 'passive', nameKey: `skill.warden.${name}.name`, descKey: `skill.warden.${name}.desc`, available: true,
  });
  it('registers all or nothing and then resolves by id', () => {
    const n = SKILLS.length;
    expect(registerClassSkills('warden', [def('a', 1), def('b', 2, 'warden.a')])).toEqual({ ok: true, count: 2 });
    expect(SKILLS.length).toBe(n + 2);
    expect(getSkill('warden.b')?.requires).toBe('warden.a');
    expect(getSkill('knight.rimBash')?.classId).toBe('knight');
  });
  it.each([
    ['wrong id prefix', 'warden', [{ ...def('a', 1), id: 'knight.zzz' }], 'bad-id'],
    ['class mismatch', 'warden', [{ ...def('a', 1), classId: 'mage' }], 'class-mismatch'],
    ['wrong cost for the tier', 'warden', [{ ...def('a', 2), cost: 9 }], 'bad-tier-or-cost'],
    ['unknown prerequisite', 'warden', [def('a', 2, 'warden.ghost')], 'bad-requires'],
    ['duplicate id inside the call', 'warden', [def('a', 1), def('a', 1)], 'duplicate-id'],
    ['id of another class', 'warden', [{ ...def('a', 1), id: 'warden.rimBash' }, { ...def('b', 1), id: 'knight.rimBash' }], 'bad-id'],
    ['bad class id', 'War den', [def('a', 1)], 'bad-class'],
  ] as const)('refuses %s and registers nothing', (_n, cls, defs, reason) => {
    const n = SKILLS.length;
    const r = registerClassSkills(cls, defs as unknown as SkillDef[]);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain(reason);
    expect(SKILLS.length).toBe(n);
  });
  it('a class cannot be registered twice', () => {
    registerClassSkills('warden', [def('a', 1)]);
    expect(registerClassSkills('warden', [def('b', 1)])).toEqual({ ok: false, reason: 'duplicate-class' });
  });
  it('learning a class skill works through the same list', () => {
    const { p } = make();
    registerClassSkills('warden', [def('a', 1)]);
    p.grantXp(xpForLevel(2), 'x');
    p.setClass('warden');
    expect(p.learn('warden.a')).toEqual({ ok: true });
    expect(p.serialize().learned).toEqual(['warden.a']);
  });
});

describe('class gating', () => {
  it('a Knight cannot learn another class\'s skill, and next-unlock never points at it', () => {
    const { p } = make();
    registerClassSkills('ranger', [{ id: 'ranger.a', classId: 'ranger', branch: 'trail', tier: 1, cost: 1, kind: 'passive', nameKey: 'k', descKey: 'k', available: true }]);
    p.grantXp(xpForLevel(2), 'x');
    expect(p.learn('ranger.a')).toEqual({ ok: false, reason: 'unavailable' });
    expect(p.nextUnlock()).not.toMatchObject({ skillId: 'ranger.a' });
    expect(['knight.rimBash', 'knight.riposteEdge', 'knight.rallyCry']).toContain((p.nextUnlock() as { skillId: string }).skillId);
  });
  it('after setClass the class skills are learnable and Knight ones are not', () => {
    const { p } = make();
    registerClassSkills('ranger', [{ id: 'ranger.a', classId: 'ranger', branch: 'trail', tier: 1, cost: 1, kind: 'passive', nameKey: 'k', descKey: 'k', available: true }]);
    p.grantXp(xpForLevel(2), 'x');
    p.setClass('ranger');
    expect(p.learn('ranger.a')).toEqual({ ok: true });
    expect(p.learn('knight.rimBash')).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('save migration', () => {
  it('a v1 (Phase A) save loads as the Knight with no class and keeps its skills and bar', () => {
    const { p } = make();
    const v1 = { xp: xpForLevel(5), storyPoints: 1, learned: ['knight.rallyCry', 'knight.rimBash', 'knight.ironStance'], bar: ['knight.rallyCry', null, null, null, null, null] };
    p.load(v1, 1);
    expect(p.classId).toBeNull();
    expect(p.respecQuote().free).toBe(true);
    expect(p.learnedSkills()).toEqual(['knight.rallyCry', 'knight.rimBash', 'knight.ironStance']);
    expect(p.bar()[0]).toBe('knight.rallyCry');
    expect(p.baseMaxHealth()).toBe(160);
    expect(p.serialize()).toMatchObject({ classId: null, respecUsed: false });
  });
  it('a v1 save never reads v2-only fields', () => {
    const { p } = make();
    p.load({ xp: 0, classId: 'warden', respecUsed: true }, 1);
    expect(p.classId).toBeNull();
    expect(p.respecQuote().free).toBe(true);
  });
  it('a v2 save round-trips class and the used flag', () => {
    const a = make();
    registerClassStats('warden', { health: 150, healthPerLevel: 14, stamina: 90, ember: 20 });
    a.p.setClass('warden');
    const b = make();
    b.p.load(JSON.parse(JSON.stringify(a.p.serialize())), 2);
    expect(b.p.classId).toBe('warden');
  });
  it('a newer version is read best-effort with a warning; a bad version warns too', () => {
    const { p, warnings } = make();
    p.load({ xp: 50, classId: 'knight' }, 9);
    expect(p.level).toBe(2);
    expect(warnings.some((w) => w.includes('newer'))).toBe(true);
    p.load({ xp: 50 }, 0);
    expect(warnings.some((w) => w.includes('bad save version'))).toBe(true);
  });
  it('a bad classId in a v2 save is ignored', () => {
    const { p } = make();
    for (const bad of [5, '', null, {}]) {
      p.load({ xp: 0, classId: bad }, 2);
      expect(p.classId).toBeNull();
    }
  });
  it('the gold port is not touched by load', () => {
    const { p, goldBox } = make({ gold: 7 });
    p.load({ xp: 0 }, 2);
    expect(goldBox.gold).toBe(7);
  });
});

describe('the M07 class choice refund and the respec gold (thread 12)', () => {
  const learnTwo = (p: Progression) => {
    p.grantXp(xpForLevel(3), 'test');
    expect(p.learn('knight.rimBash').ok).toBe(true);
    expect(p.learn('knight.ironStance').ok).toBe(true);
  };

  it('refundForClassChoice refunds every point silently, clears the bar and leaves the used respec as saved', () => {
    const { p, events } = make();
    p.load({ xp: xpForLevel(3), storyPoints: 0, learned: [], bar: [], classId: null, respecUsed: true }, 2);
    learnTwo(p);
    const before = p.skillPoints;
    events.length = 0;
    expect(p.refundForClassChoice()).toBe(2);
    expect(p.skillPoints).toBe(before + 2);
    expect(p.learnedSkills()).toEqual([]);
    expect(p.bar().every((s) => s === null)).toBe(true);
    expect(p.serialize().respecUsed).toBe(true);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['skillpoints.changed', 'ability.bar.changed']));
    expect(events.some((e) => e.type === 'gold.spent')).toBe(false);
  });

  it('refundForClassChoice is refused once a class is chosen, so it can never be a free respec', () => {
    const { p } = make();
    learnTwo(p);
    p.setClass('knight');
    expect(p.refundForClassChoice()).toBe(0);
    expect(p.learnedSkills()).toHaveLength(2);
  });

  it('refundForClassChoice re-applies max health', () => {
    const { p, actor } = make();
    learnTwo(p);
    actor.maxHealth = 1;
    p.refundForClassChoice();
    expect(actor.maxHealth).toBe(p.baseMaxHealth());
  });

  it('a paid respec passes the reason respec, and too little gold takes nothing', () => {
    const { p, goldBox } = make({ gold: 10 });
    learnTwo(p);
    const release = p.allowRespec('test');
    expect(p.respec().ok).toBe(true); // the free one
    learnTwo(p);
    const reasons: unknown[] = [];
    const takeSpy = (p as any).deps.gold();
    const original = takeSpy.takeGold.bind(takeSpy);
    takeSpy.takeGold = (n: number, reason?: string) => {
      reasons.push(reason);
      return original(n);
    };
    expect(p.respec()).toEqual({ ok: false, reason: 'no-gold' });
    expect(reasons).toEqual([]);
    expect(goldBox.gold).toBe(10);
    goldBox.gold = 1000;
    expect(p.respec().ok).toBe(true);
    expect(reasons).toEqual(['respec']);
    release();
  });
});
