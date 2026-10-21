import { describe, expect, it } from 'vitest';
import { getSkill, SKILLS } from './skills';

describe('skills data', () => {
  it('has 15 nodes with branch chains and costs', () => {
    expect(SKILLS).toHaveLength(15);
    for (const s of SKILLS) {
      expect(s.cost).toBe([1, 1, 2, 3, 5][s.tier - 1]);
      expect(s.nameKey).toBe(`skill.${s.id}.name`);
      expect(s.available).toBe(s.tier <= 3);
      if (s.tier > 1) {
        const prev = getSkill(s.requires!)!;
        expect(prev.branch).toBe(s.branch);
        expect(prev.tier).toBe(s.tier - 1);
      } else expect(s.requires).toBeUndefined();
    }
  });
  it('tier 1 kinds and rally cry numbers', () => {
    expect(getSkill('knight.rimBash')?.kind).toBe('passive');
    expect(getSkill('knight.riposteEdge')?.kind).toBe('passive');
    const rally = getSkill('knight.rallyCry')!;
    expect(rally.kind).toBe('active');
    expect(rally.cooldown).toBe(20);
    expect(rally.emberCost).toBe(10);
  });
  it('capstones share an exclusive group', () => {
    const caps = SKILLS.filter((s) => s.capstone);
    expect(caps).toHaveLength(3);
    expect(caps.every((c) => c.tier === 5 && c.exclusiveGroup === 'capstone')).toBe(true);
    expect(getSkill('nope')).toBeUndefined();
  });
});

describe('tier 2 (slice 2)', () => {
  it('Iron Stance, Flowing Cuts and Banner Plant are live and chained to tier 1', () => {
    for (const [id, req] of [['knight.ironStance', 'knight.rimBash'], ['knight.flowingCuts', 'knight.riposteEdge'], ['knight.bannerPlant', 'knight.rallyCry']] as const) {
      const s = getSkill(id)!;
      expect([s.available, s.tier, s.cost, s.requires, s.classId]).toEqual([true, 2, 1, req, 'knight']);
    }
    expect(getSkill('knight.ironStance')!.kind).toBe('passive');
    expect(getSkill('knight.flowingCuts')!.kind).toBe('passive');
  });
  it('tier 3 is live (Act 2); tiers 4 and 5 stay locked until Act 3', () => {
    expect(SKILLS.filter((s) => s.tier === 3).every((s) => s.available)).toBe(true);
    expect(SKILLS.filter((s) => s.tier >= 4).every((s) => !s.available)).toBe(true);
  });
  it('Banner Plant is an active that costs 20 Ember with a 45 s cooldown (on the SkillDef)', () => {
    const b = getSkill('knight.bannerPlant')!;
    expect([b.kind, b.emberCost, b.cooldown]).toEqual(['active', 20, 45]);
  });
});
