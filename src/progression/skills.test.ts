import { describe, expect, it } from 'vitest';
import { getSkill, SKILLS } from './skills';

describe('skills data', () => {
  it('has 15 nodes with branch chains and costs', () => {
    expect(SKILLS).toHaveLength(15);
    for (const s of SKILLS) {
      expect(s.cost).toBe([1, 1, 2, 3, 5][s.tier - 1]);
      expect(s.nameKey).toBe(`skill.${s.id}.name`);
      expect(s.available).toBe(s.tier === 1);
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
