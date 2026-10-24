import type { ProgressionService } from '../hud/ports';
import { DEFAULT_CLASS_ID, SKILLS, type SkillDef } from './skills';

export type SkillNodeState = 'learned' | 'learnable' | 'no-points' | 'blocked' | 'unavailable';

export interface SkillNode {
  skill: SkillDef;
  state: SkillNodeState;
  /** v0.7: an unavailable tier 4 or 5 node's text key ("Act 3", then "see your master"). */
  textKey?: string;
}

export interface SkillViewModel {
  points: number;
  level: number;
  branches: { branch: string; nodes: SkillNode[] }[];
}

/** Branch ids of a class in registration (first-seen) order. */
export function branchesOf(classId: string): string[] {
  const out: string[] = [];
  for (const s of SKILLS) if (s.classId === classId && !out.includes(s.branch)) out.push(s.branch);
  return out;
}

/** Pure description of the skill screen: every node of the class's tree with what the player can do with it. */
export function skillViewModel(p: ProgressionService, classId?: string | null): SkillViewModel {
  const cls = classId ?? p.classId ?? DEFAULT_CLASS_ID;
  return {
    points: p.skillPoints,
    level: p.level,
    branches: branchesOf(cls).map((branch) => ({
      branch,
      nodes: SKILLS.filter((s) => s.classId === cls && s.branch === branch)
        .sort((a, b) => a.tier - b.tier)
        .map((skill) => {
          if (p.learned(skill.id)) return { skill, state: 'learned' as const };
          const check = p.canLearn(skill.id);
          if (check.ok) return { skill, state: 'learnable' as const };
          if (check.reason === 'unavailable') return { skill, state: 'unavailable' as const };
          if (check.reason === 'master') return { skill, state: 'unavailable' as const, ...(check.textKey ? { textKey: check.textKey } : {}) };
          return { skill, state: check.reason === 'no-points' ? ('no-points' as const) : ('blocked' as const) };
        }),
    })),
  };
}
