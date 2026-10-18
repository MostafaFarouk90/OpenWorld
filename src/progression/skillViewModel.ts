import type { ProgressionService } from '../hud/ports';
import { SKILLS, type SkillBranch, type SkillDef } from './skills';

export type SkillNodeState = 'learned' | 'learnable' | 'no-points' | 'blocked' | 'unavailable';

export interface SkillNode {
  skill: SkillDef;
  state: SkillNodeState;
}

export interface SkillViewModel {
  points: number;
  level: number;
  branches: { branch: SkillBranch; nodes: SkillNode[] }[];
}

const BRANCHES: readonly SkillBranch[] = ['bulwark', 'vanguard', 'standard'];

/** Pure description of the skill screen: every node of the Knight tree with what the player can do with it. */
export function skillViewModel(p: ProgressionService): SkillViewModel {
  return {
    points: p.skillPoints,
    level: p.level,
    branches: BRANCHES.map((branch) => ({
      branch,
      nodes: SKILLS.filter((s) => s.branch === branch)
        .sort((a, b) => a.tier - b.tier)
        .map((skill) => {
          if (p.learned(skill.id)) return { skill, state: 'learned' as const };
          if (!skill.available) return { skill, state: 'unavailable' as const };
          const check = p.canLearn(skill.id);
          if (check.ok) return { skill, state: 'learnable' as const };
          return { skill, state: check.reason === 'no-points' ? ('no-points' as const) : ('blocked' as const) };
        }),
    })),
  };
}
