import { afterEach, describe, expect, it } from 'vitest';
import { makeProgression } from '../../progression/testkit';
import { getSkill, registerClassSkills, resetClassSkills, SKILLS, TIER_COST } from '../../progression/skills';
import { ASHBLADE_BRANCHES, ASHBLADE_SKILLS } from './skills';
import { ASH_CLOUD, SKILL } from './tuning';

afterEach(() => resetClassSkills());

describe('Ashblade skill data', () => {
  it('has three branches of five tiers with the design costs', () => {
    expect(ASHBLADE_SKILLS).toHaveLength(15);
    for (const branch of ASHBLADE_BRANCHES) {
      const rows = ASHBLADE_SKILLS.filter((s) => s.branch === branch);
      expect(rows.map((s) => s.tier)).toEqual([1, 2, 3, 4, 5]);
      expect(rows.map((s) => s.cost)).toEqual([...TIER_COST]);
      rows.slice(1).forEach((s, i) => expect(s.requires).toBe(rows[i].id));
    }
  });

  it('puts Quiet Soles at tier 1 and the Ash Cloud active at tier 2 so Rally Cry stays the only tier-1 active', () => {
    const quiet = ASHBLADE_SKILLS.find((s) => s.id === SKILL.quietSoles)!;
    const cloud = ASHBLADE_SKILLS.find((s) => s.id === SKILL.ashCloud)!;
    expect([quiet.branch, quiet.tier, quiet.kind]).toEqual(['smokecloak', 1, 'passive']);
    expect([cloud.branch, cloud.tier, cloud.kind]).toEqual(['smokecloak', 2, 'active']);
    expect(cloud.requires).toBe(SKILL.quietSoles);
    expect(cloud.emberCost).toBe(ASH_CLOUD.emberCost);
    expect(cloud.cooldown).toBe(ASH_CLOUD.cooldown);
    const tier1Actives = ASHBLADE_SKILLS.filter((s) => s.tier === 1 && s.kind === 'active');
    expect(tier1Actives).toEqual([]);
  });

  it('is learnable at tiers 1 and 2 only, with exclusive capstones', () => {
    for (const s of ASHBLADE_SKILLS) expect(s.available).toBe(s.tier <= 2);
    const caps = ASHBLADE_SKILLS.filter((s) => s.tier === 5);
    expect(caps).toHaveLength(3);
    for (const c of caps) expect([c.capstone, c.exclusiveGroup]).toEqual([true, 'capstone']);
  });

  it('registers into the shared tree once, and a repeat is refused without changing it', () => {
    const before = SKILLS.length;
    const reg = registerClassSkills('ashblade', ASHBLADE_SKILLS);
    expect(reg).toMatchObject({ ok: true, count: 15 });
    expect(SKILLS.length).toBe(before + 15);
    expect(getSkill(SKILL.backSlit)?.classId).toBe('ashblade');
    expect(registerClassSkills('ashblade', ASHBLADE_SKILLS)).toEqual({ ok: false, reason: 'duplicate-class' });
    expect(SKILLS.length).toBe(before + 15);
    if (reg.ok) reg.dispose();
    expect(SKILLS.length).toBe(before);
    expect(getSkill(SKILL.backSlit)).toBeUndefined();
  });
});

describe('Ashblade tier gating through Progression', () => {
  const ready = (points: number) => {
    registerClassSkills('ashblade', ASHBLADE_SKILLS);
    const { p } = makeProgression();
    p.setClass('ashblade');
    p.grantSkillPoint(points, 'test');
    return p;
  };

  it('refuses a tier 2 skill before its tier 1 and a tier 3 skill always', () => {
    const p = ready(6);
    expect(p.learn(SKILL.ashCloud)).toEqual({ ok: false, reason: 'missing-prereq' });
    expect(p.learn('ashblade.sootCloak')).toEqual({ ok: false, reason: 'unavailable' });
    expect(p.learn(SKILL.quietSoles)).toEqual({ ok: true });
    expect(p.learn(SKILL.ashCloud)).toEqual({ ok: true });
  });

  it('refuses without points and from another class', () => {
    const p = ready(0);
    expect(p.learn(SKILL.backSlit)).toEqual({ ok: false, reason: 'no-points' });
    p.setClass('warden');
    p.grantSkillPoint(3, 'test');
    expect(p.learn(SKILL.backSlit)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('puts the learned Ash Cloud on the bar and drops it on a respec away and back', () => {
    const p = ready(4);
    p.learn(SKILL.quietSoles);
    p.learn(SKILL.ashCloud);
    expect(p.bar()).toContain(SKILL.ashCloud);
    const release = p.allowRespec('test');
    expect(p.respec().ok).toBe(true);
    release();
    expect(p.learned(SKILL.quietSoles)).toBe(false);
    expect(p.bar()).not.toContain(SKILL.ashCloud);
    expect(p.skillPoints).toBe(4);
    expect(p.learn(SKILL.quietSoles)).toEqual({ ok: true });
  });
});
