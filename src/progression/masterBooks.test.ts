// v0.7 item 10: tiers 4 and 5 learn once Act 3 has begun and the class master's book is given; the condition gates
// learning only, never loading (review finding 1).
import { describe, expect, it } from 'vitest';
import { Progression } from './Progression';
import { SKILLS, getSkill, masterBookFlag, masterBookGate, registerClassSkills, skillLearnable } from './skills';
import { skillViewModel } from './skillViewModel';
import { fakeActor } from './testkit';
import { ASHBLADE_SKILLS } from '../classes/ashblade/skills';
import { buildEmberwrightSkills } from '../classes/emberwright/skills';
import { buildPathfinderSkills } from '../classes/pathfinder/skills';
import { WARDEN_SKILLS } from '../classes/warden/skills';

const ALL_ROWS = [...SKILLS, ...ASHBLADE_SKILLS, ...buildEmberwrightSkills(), ...buildPathfinderSkills(), ...WARDEN_SKILLS];

const TIER4_SAVE = {
  xp: 0,
  storyPoints: 7,
  learned: ['knight.rimBash', 'knight.ironStance', 'knight.oathward', 'knight.bastionWall'],
  bar: ['knight.oathward', 'knight.bastionWall', null, null, null, null],
  classId: null,
  respecUsed: false,
};

function make(flags: Record<string, boolean> = {}, withStore = true) {
  const f = new Map(Object.entries(flags));
  const p = new Progression({
    emit: () => {},
    logger: { warn: () => {} },
    actor: () => fakeActor(),
    ...(withStore ? { flags: { get: (k: string) => f.get(k), set: (k: string, v: boolean) => void f.set(k, v) } } : {}),
  });
  return { p, f };
}

describe('skills: the master-book gate', () => {
  it('every class: tiers 1 to 3 are plain true; tiers 4 and 5 wait on story.gate.a3 and the class book', () => {
    for (const s of ALL_ROWS) {
      if (s.tier <= 3) expect(typeof s.availableWhen, s.id).toBe('boolean');
      else expect(s.availableWhen, s.id).toEqual(masterBookGate(s.classId));
    }
    expect(new Set(ALL_ROWS.filter((s) => s.tier >= 4).map((s) => s.classId))).toEqual(new Set(['knight', 'warden', 'emberwright', 'pathfinder', 'ashblade']));
    expect(masterBookFlag('pathfinder')).toBe('trainer.pathfinder.masterBook');
  });

  it('skillLearnable: shorthands, a condition, and a missing reader reads every flag as unset', () => {
    expect(skillLearnable({ availableWhen: true })).toBe(true);
    expect(skillLearnable({ availableWhen: false }, { getFlag: () => true })).toBe(false);
    const gate = { availableWhen: masterBookGate('knight') };
    expect(skillLearnable(gate)).toBe(false);
    expect(skillLearnable(gate, { getFlag: (k) => k === 'story.gate.a3' })).toBe(false);
    expect(skillLearnable(gate, { getFlag: () => true })).toBe(true);
  });
});

describe('Progression: learning a tier 4 skill', () => {
  const ready = { ...TIER4_SAVE, learned: TIER4_SAVE.learned.slice(0, 3), bar: [] };

  it('before Act 3: refused with the Act 3 text', () => {
    const { p } = make();
    p.load(ready);
    expect(p.canLearn('knight.bastionWall')).toEqual({ ok: false, reason: 'master', textKey: 'hud.skills.act3' });
  });

  it('in Act 3 without the book: refused naming the master', () => {
    const { p } = make({ 'story.gate.a3': true });
    p.load(ready);
    expect(p.learn('knight.bastionWall')).toEqual({ ok: false, reason: 'master', textKey: 'hud.skills.master.knight' });
    expect(p.learned('knight.bastionWall')).toBe(false);
  });

  it('with the book: learned, and placed on the bar', () => {
    const { p } = make({ 'story.gate.a3': true, 'trainer.knight.masterBook': true });
    p.load(ready);
    expect(p.learn('knight.bastionWall')).toEqual({ ok: true });
    expect(p.bar()).toContain('knight.bastionWall');
  });

  it('nextUnlock skips a gated skill and offers it once the book is given', () => {
    const { p, f } = make({ 'story.gate.a3': true });
    const knightLow = SKILLS.filter((k) => k.classId === 'knight' && k.tier <= 3).map((k) => k.id);
    p.load({ ...ready, learned: knightLow, storyPoints: 40 });
    expect(p.nextUnlock().kind).toBe('level');
    f.set('trainer.knight.masterBook', true);
    const next = p.nextUnlock();
    expect(next.kind).toBe('skill');
    expect(next.kind === 'skill' && getSkill(next.skillId)!.tier).toBe(4);
  });

  it('the view model shows an unavailable tier 4 node with the master text', () => {
    const { p } = make({ 'story.gate.a3': true });
    p.load(ready);
    const nodes = skillViewModel(p, 'knight').branches.flatMap((b) => b.nodes);
    const wall = nodes.find((n) => n.skill.id === 'knight.bastionWall')!;
    expect(wall).toMatchObject({ state: 'unavailable', textKey: 'hud.skills.master.knight' });
    const rim = nodes.find((n) => n.skill.id === 'knight.rimBash')!;
    expect(rim.state).toBe('learned');
  });

  it('a Pathfinder learns from Cenric or Leofa: the refusal names both', () => {
    expect(registerClassSkills('pathfinder', buildPathfinderSkills()).ok).toBe(true);
    const { p } = make({ 'story.gate.a3': true });
    p.load({ ...ready, classId: 'pathfinder', learned: [], bar: [] });
    const t4 = buildPathfinderSkills().find((s) => s.tier === 4)!;
    expect(skillLearnable(t4, { getFlag: (k) => k === 'story.gate.a3' })).toBe(false);
    expect(p.canLearn(t4.id)).toMatchObject({ reason: 'master', textKey: 'hud.skills.master.pathfinder' });
  });
});

describe('Progression.load never reads the learn condition (review finding 1)', () => {
  it('a learned tier 4 skill and its bar slot load with story.gate.a3 and the book absent', () => {
    const { p } = make();
    p.load(TIER4_SAVE);
    expect(p.learned('knight.bastionWall')).toBe(true);
    expect(p.bar()).toEqual(['knight.oathward', 'knight.bastionWall', null, null, null, null]);
    expect(p.skillPoints).toBe(0);
  });

  it('the same when progression loads before the world-state flags (no flag store yet)', () => {
    const { p } = make({}, false);
    p.load(TIER4_SAVE);
    expect(p.serialize().learned).toEqual(TIER4_SAVE.learned);
    expect(p.serialize().bar).toEqual(TIER4_SAVE.bar);
  });

  it('requires, exclusivity and the point cap still hold on load', () => {
    const { p } = make();
    // No tier 3 below it: the tier 4 is dropped (requires).
    p.load({ ...TIER4_SAVE, learned: ['knight.rimBash', 'knight.ironStance', 'knight.bastionWall'] });
    expect(p.learned('knight.bastionWall')).toBe(false);
    // Too few points: dropped from the end until the points balance.
    p.load({ ...TIER4_SAVE, storyPoints: 4 });
    expect(p.learned('knight.bastionWall')).toBe(false);
    expect(p.skillPoints).toBeGreaterThanOrEqual(0);
    expect(getSkill('knight.unbrokenOath')!.exclusiveGroup).toBe('capstone');
  });
});
