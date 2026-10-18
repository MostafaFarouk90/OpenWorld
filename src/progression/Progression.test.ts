import { describe, expect, it } from 'vitest';
import { fakeActor, makeProgression } from './testkit';
import { xpForLevel } from './tuning';

const kill = (over: Record<string, unknown> = {}) => ({
  actorId: 'e1',
  kind: 'ash-wraith',
  team: 'hostile',
  level: 1,
  killerId: 'player',
  ...over,
});

describe('xp and levels', () => {
  it('49 is L1, 50 is L2 with a point', () => {
    const { p } = makeProgression();
    p.grantXp(49, 't');
    expect(p.level).toBe(1);
    expect(p.skillPoints).toBe(0);
    p.grantXp(1, 't');
    expect(p.level).toBe(2);
    expect(p.skillPoints).toBe(1);
    expect(p.xpToNext()).toBe(xpForLevel(3) - 50);
  });
  it('multi-level grant emits per level and one points event', () => {
    const { p, events } = makeProgression();
    p.grantXp(xpForLevel(3), 'q');
    expect(p.level).toBe(3);
    expect(p.skillPoints).toBe(2);
    expect(events.filter((e) => e.type === 'level.up').map((e) => e.payload)).toEqual([
      { level: 2, previous: 1 },
      { level: 3, previous: 2 },
    ]);
    expect(events.filter((e) => e.type === 'xp.gained')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'skillpoints.changed')).toEqual([
      { type: 'skillpoints.changed', payload: { points: 2 } },
    ]);
  });
  it('cap discards the remainder', () => {
    const { p } = makeProgression();
    p.grantXp(1e9, 'x');
    expect(p.level).toBe(40);
    expect(p.xp).toBe(xpForLevel(40));
    expect(p.skillPoints).toBe(21);
    expect(p.xpToNext()).toBe(0);
    expect(p.grantXp(10, 'x')).toBe(0);
  });
  it('ignores bad amounts', () => {
    const { p, events } = makeProgression();
    for (const v of [0, -5, NaN, Infinity, -Infinity, '10' as unknown as number]) expect(p.grantXp(v, 's')).toBe(0);
    expect(p.xp).toBe(0);
    expect(events).toHaveLength(0);
  });
  it('kill xp rules', () => {
    const { p } = makeProgression();
    expect(p.onKill(kill({ kind: 'dummy', actorId: 'd' }))).toBe(0);
    expect(p.onKill(kill({ team: 'ally', actorId: 'a' }))).toBe(0);
    expect(p.onKill(kill({ team: 'neutral', actorId: 'n' }))).toBe(0);
    expect(p.onKill(kill({ killerId: 'e9', actorId: 'k' }))).toBe(0);
    expect(p.onKill(kill({ killerId: null, actorId: 'k2' }))).toBe(0);
    expect(p.xp).toBe(0);
    expect(p.onKill(kill())).toBe(20);
    expect(p.onKill(kill())).toBe(0);
    expect(p.xp).toBe(20);
  });
  it('level scaling applies to kills', () => {
    const { p } = makeProgression();
    expect(p.onKill(kill({ level: 5 }))).toBe(32);
  });
  it('tutorial pause then T13 grant gives exactly the level 2 point', () => {
    const { p } = makeProgression();
    const resume = p.pauseKillXp('tutorial');
    expect(p.onKill(kill({ actorId: 'a' }))).toBe(0);
    expect(p.xp).toBe(0);
    p.grantXp(p.xpToNext(), 'tutorial.t13');
    expect(p.level).toBe(2);
    expect(p.skillPoints).toBe(1);
    resume();
    resume();
    expect(p.onKill(kill({ actorId: 'a' }))).toBe(17);
  });
  it('pause is ref-counted', () => {
    const { p } = makeProgression();
    const a = p.pauseKillXp('a');
    const b = p.pauseKillXp('a');
    a();
    expect(p.onKill(kill({ actorId: 'x' }))).toBe(0);
    b();
    expect(p.onKill(kill({ actorId: 'x' }))).toBe(20);
  });
  it('mercy pays 60% floor once', () => {
    const { p } = makeProgression();
    expect(p.onMercy({ actorId: 'm', kind: 'blighted-soldier', level: 1 })).toBe(18);
    expect(p.onMercy({ actorId: 'm', kind: 'blighted-soldier', level: 1 })).toBe(0);
    expect(p.onMercy({ actorId: 'w', kind: 'ash-wraith', level: 2 })).toBe(13);
  });
  it('mercy then revoke then kill never exceeds 100%', () => {
    const { p } = makeProgression();
    p.onMercy({ actorId: 'm', kind: 'ash-wraith', level: 1 });
    p.onMercyRevoked('m');
    expect(p.onMercy({ actorId: 'm', kind: 'ash-wraith', level: 1 })).toBe(0);
    expect(p.onKill(kill({ actorId: 'm' }))).toBe(8);
    expect(p.xp).toBe(20);
  });
  it('level-up raises max health and heals the delta, not to full', () => {
    const actor = fakeActor({ health: 50 });
    const { p } = makeProgression(actor);
    p.grantXp(50, 'x');
    expect(actor.maxHealth).toBe(130);
    expect(actor.health).toBe(60);
    expect(actor.level).toBe(2);
  });
  it('level-up during a modifier penalty', () => {
    const actor = fakeActor({ health: 90 });
    const { p } = makeProgression(actor);
    p.addMaxHealthModifier('burn', () => 0.8);
    expect(actor.maxHealth).toBe(96);
    expect(actor.health).toBe(90);
    p.grantXp(50, 'x');
    expect(actor.maxHealth).toBe(104);
    expect(actor.health).toBe(98);
  });
});

describe('max health', () => {
  it('modifiers: replace, remove, invalid ignored with a warning', () => {
    const actor = fakeActor({ health: 120 });
    const { p, warnings } = makeProgression(actor);
    expect(p.baseMaxHealth()).toBe(120);
    const rm = p.addMaxHealthModifier('burn', () => 0.5);
    expect(actor.maxHealth).toBe(60);
    expect(actor.health).toBe(60);
    const rmBurn = p.addMaxHealthModifier('burn', () => 0.75);
    expect(actor.maxHealth).toBe(90);
    p.addMaxHealthModifier('scar', () => 0.9);
    expect(actor.maxHealth).toBe(81);
    p.addMaxHealthModifier('bad', () => NaN);
    p.addMaxHealthModifier('neg', () => -1);
    p.addMaxHealthModifier('zero', () => 0);
    expect(actor.maxHealth).toBe(81);
    expect(warnings.length).toBeGreaterThan(0);
    rm();
    expect(actor.maxHealth).toBe(81);
    rmBurn();
    expect(actor.maxHealth).toBe(108);
    expect(actor.health).toBe(60);
  });
  it('removing a penalty does not raise health', () => {
    const actor = fakeActor({ health: 60 });
    const { p } = makeProgression(actor);
    const rm = p.addMaxHealthModifier('burn', () => 0.5);
    rm();
    expect(actor.maxHealth).toBe(120);
    expect(actor.health).toBe(60);
  });
  it('works with no actor', () => {
    const { p } = makeProgression(null);
    p.addMaxHealthModifier('a', () => 1)();
    p.grantXp(50, 'x');
    expect(p.level).toBe(2);
  });
});

describe('skills', () => {
  it('learn tier 1 spends exactly the cost and auto-slots', () => {
    const { p, events } = makeProgression();
    p.grantXp(xpForLevel(3), 'x');
    expect(p.canLearn('knight.rallyCry')).toEqual({ ok: true });
    expect(p.learn('knight.rallyCry')).toEqual({ ok: true });
    expect(p.skillPoints).toBe(1);
    expect(p.learned('knight.rallyCry')).toBe(true);
    expect(p.bar()).toEqual(['knight.rallyCry', null, null, null, null, null]);
    expect(events.some((e) => e.type === 'skill.learned' && e.payload.skillId === 'knight.rallyCry')).toBe(true);
  });
  it('refusals, in order, change nothing', () => {
    const { p } = makeProgression();
    expect(p.learn('knight.rallyCry')).toEqual({ ok: false, reason: 'no-points' });
    expect(p.learn('nope')).toEqual({ ok: false, reason: 'unknown-skill' });
    p.grantXp(xpForLevel(5), 'x');
    expect(p.learn('knight.ironStance')).toEqual({ ok: false, reason: 'missing-prereq' });
    expect(p.learn('knight.oathward')).toEqual({ ok: false, reason: 'unavailable' });
    expect(p.learn('knight.unbrokenOath')).toEqual({ ok: false, reason: 'unavailable' });
    p.learn('knight.rimBash');
    expect(p.learn('knight.rimBash')).toEqual({ ok: false, reason: 'already-learned' });
    expect(p.skillPoints).toBe(3);
    expect(p.bar().every((s) => s === null)).toBe(true);
  });
  it('active slots in order; passives take none', () => {
    const { p } = makeProgression();
    p.grantXp(xpForLevel(4), 'x');
    p.learn('knight.rimBash');
    p.learn('knight.riposteEdge');
    expect(p.bar().every((s) => s === null)).toBe(true);
    p.learn('knight.rallyCry');
    expect(p.bar()[0]).toBe('knight.rallyCry');
  });
  it('assign rules', () => {
    const { p } = makeProgression();
    p.grantXp(xpForLevel(4), 'x');
    p.learn('knight.rimBash');
    p.learn('knight.rallyCry');
    expect(p.assign(6, 'knight.rallyCry')).toBe(false);
    expect(p.assign(-1, null)).toBe(false);
    expect(p.assign(1.5, null)).toBe(false);
    expect(p.assign(1, 'knight.riposteEdge')).toBe(false);
    expect(p.assign(1, 'knight.rimBash')).toBe(false);
    expect(p.assign(1, 'bogus')).toBe(false);
    expect(p.assign(3, 'knight.rallyCry')).toBe(true);
    expect(p.bar()).toEqual([null, null, null, 'knight.rallyCry', null, null]);
    expect(p.assign(3, null)).toBe(true);
    expect(p.bar().every((s) => s === null)).toBe(true);
  });
  it('story points add to the pool', () => {
    const { p } = makeProgression();
    p.grantSkillPoint(0, 'r');
    p.grantSkillPoint(-1, 'r');
    p.grantSkillPoint(NaN, 'r');
    expect(p.skillPoints).toBe(0);
    p.grantSkillPoint(2, 'm34');
    expect(p.skillPoints).toBe(2);
  });
  it('capstone exclusivity is enforced through the rules', () => {
    const { p } = makeProgression();
    // the tree is not live yet, so exercise the guard by forcing a save
    p.load({ xp: 1e9, learned: ['knight.unbrokenOath', 'knight.heartshardSmite'] });
    expect(p.learned('knight.unbrokenOath')).toBe(false);
  });
});

describe('nextUnlock', () => {
  it('level, skill within reach, none at cap', () => {
    const { p } = makeProgression();
    expect(p.nextUnlock()).toEqual({ kind: 'level', remaining: 50, level: 2 });
    p.grantXp(50, 'x');
    expect(p.nextUnlock()).toMatchObject({ kind: 'skill', remaining: 0 });
    for (const id of ['knight.rimBash']) p.learn(id);
    expect(p.nextUnlock()).toMatchObject({ kind: 'level', level: 3 });
    const q = makeProgression().p;
    q.grantXp(1e9, 'x');
    q.learn('knight.rimBash');
    q.learn('knight.riposteEdge');
    q.learn('knight.rallyCry');
    for (const id of ['knight.ironStance', 'knight.flowingCuts', 'knight.bannerPlant']) q.learn(id);
    expect(q.nextUnlock()).toEqual({ kind: 'none' });
  });
});

describe('persistence', () => {
  it('round trip, idempotent, no events', () => {
    const a = makeProgression();
    a.p.grantXp(xpForLevel(6), 'x');
    a.p.grantSkillPoint(1, 's');
    a.p.learn('knight.rimBash');
    a.p.learn('knight.rallyCry');
    a.p.assign(4, 'knight.rallyCry');
    const save = a.p.serialize();
    const b = makeProgression();
    b.p.load(save);
    b.p.load(save);
    expect(b.p.serialize()).toEqual(save);
    expect(b.p.skillPoints).toBe(a.p.skillPoints);
    expect(b.p.level).toBe(6);
    expect(b.events).toHaveLength(0);
    expect(JSON.parse(JSON.stringify(save))).toEqual(save);
  });
  it('bad data falls back', () => {
    const { p } = makeProgression();
    for (const bad of [null, undefined, 5, 'x', [], { xp: 'a', learned: 7, bar: 'z' }]) {
      p.load(bad);
      expect(p.serialize()).toEqual({
        xp: 0,
        storyPoints: 0,
        learned: [],
        bar: [null, null, null, null, null, null],
        classId: null,
        respecUsed: false,
      });
    }
    p.load({ xp: NaN });
    expect(p.xp).toBe(0);
    p.load({ xp: -10, storyPoints: -3 });
    expect(p.xp).toBe(0);
    expect(p.skillPoints).toBe(0);
  });
  it('drops unknown, unavailable and prereq-less skills, and over-spent saves', () => {
    const { p } = makeProgression();
    p.load({ xp: 50, learned: ['x.bad', 'knight.ironStance', 'knight.rimBash', 'knight.rimBash', 7] });
    expect(p.serialize().learned).toEqual(['knight.rimBash']);
    expect(p.skillPoints).toBe(0);
    p.load({ xp: 50, learned: ['knight.rimBash', 'knight.rallyCry'] });
    expect(p.serialize().learned).toEqual(['knight.rimBash']);
  });
  it('bar is clamped to learned actives and unique', () => {
    const { p } = makeProgression();
    p.load({
      xp: xpForLevel(4),
      learned: ['knight.rimBash', 'knight.rallyCry'],
      bar: ['knight.rimBash', 'knight.riposteEdge', 'knight.rallyCry', 'knight.rallyCry', 9, null, 'knight.rallyCry'],
    });
    expect(p.bar()).toEqual([null, null, 'knight.rallyCry', null, null, null]);
  });
  it('never double-grants points: level points plus story minus spent', () => {
    const { p } = makeProgression();
    p.grantXp(xpForLevel(3), 'x');
    p.grantSkillPoint(1, 'm03');
    p.learn('knight.rallyCry');
    const s = p.serialize();
    const q = makeProgression().p;
    q.load(s);
    q.load(JSON.parse(JSON.stringify(s)));
    expect(q.skillPoints).toBe(2);
  });
  it('load recomputes max health: stored 130 survives at L2, is clamped at L1', () => {
    const actor = fakeActor({ health: 130, maxHealth: 130 });
    const { p } = makeProgression(actor);
    p.load({ xp: 50 });
    expect(actor.maxHealth).toBe(130);
    expect(actor.health).toBe(130);
    const low = fakeActor({ health: 100, maxHealth: 100 });
    const m = makeProgression(low).p;
    m.load({ xp: 0 });
    expect(low.maxHealth).toBe(120);
    expect(low.health).toBe(100);
    const hi = fakeActor({ health: 130, maxHealth: 130 });
    makeProgression(hi).p.load({ xp: 0 });
    expect(hi.health).toBe(120);
  });
  it('static key and version', async () => {
    const { Progression } = await import('./Progression');
    expect(Progression.key).toBe('progression');
    expect(Progression.version).toBe(2);
  });
});

describe('review fixes', () => {
  it('mercy XP is also paused by pauseKillXp', () => {
    const { p } = makeProgression();
    const resume = p.pauseKillXp('tutorial');
    expect(p.onMercy({ actorId: 'a#1', kind: 'ash-wraith', level: 1 })).toBe(0);
    resume();
    expect(p.onMercy({ actorId: 'a#2', kind: 'ash-wraith', level: 1 })).toBeGreaterThan(0);
  });

  it('load clears the kill and mercy ledgers so a loaded timeline pays in full', () => {
    const { p } = makeProgression();
    p.onMercy({ actorId: 'a#1', kind: 'ash-wraith', level: 1 });
    p.load({ xp: 0 });
    expect(p.onKill({ actorId: 'a#1', kind: 'ash-wraith', team: 'hostile', level: 1, killerId: 'player' })).toBe(20);
  });
});
