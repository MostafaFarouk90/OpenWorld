/** Knight skill data (design 9.1). Tier 1 is live; tiers 2 to 5 are listed so the tree draws its full shape. */

export type SkillBranch = 'bulwark' | 'vanguard' | 'standard';

export interface SkillDef {
  id: string;
  branch: SkillBranch;
  tier: 1 | 2 | 3 | 4 | 5;
  /** Skill points. */
  cost: number;
  requires?: string;
  kind: 'active' | 'passive';
  nameKey: string;
  descKey: string;
  available: boolean;
  /** Seconds. */
  cooldown?: number;
  emberCost?: number;
  capstone?: true;
  exclusiveGroup?: 'capstone';
}

export const TIER_COST: readonly number[] = [1, 1, 2, 3, 5];

type Row = [name: string, kind: 'active' | 'passive'];

const TREE: Record<SkillBranch, Row[]> = {
  bulwark: [
    ['rimBash', 'passive'],
    ['ironStance', 'passive'],
    ['oathward', 'active'],
    ['bastionWall', 'active'],
    ['unbrokenOath', 'active'],
  ],
  vanguard: [
    ['riposteEdge', 'passive'],
    ['flowingCuts', 'passive'],
    ['chargeOfTheHalvard', 'active'],
    ['executionersArc', 'active'],
    ['heartshardSmite', 'active'],
  ],
  standard: [
    ['rallyCry', 'active'],
    ['bannerPlant', 'active'],
    ['squiresResolve', 'passive'],
    ['hearthfireWard', 'passive'],
    ['bannerOfTheSunforge', 'active'],
  ],
};

function build(): SkillDef[] {
  const out: SkillDef[] = [];
  for (const branch of ['bulwark', 'vanguard', 'standard'] as const) {
    TREE[branch].forEach(([name, kind], i) => {
      const tier = (i + 1) as SkillDef['tier'];
      const id = `knight.${name}`;
      const def: SkillDef = {
        id,
        branch,
        tier,
        cost: TIER_COST[i],
        kind,
        nameKey: `skill.${id}.name`,
        descKey: `skill.${id}.desc`,
        available: tier === 1,
      };
      if (i > 0) def.requires = `knight.${TREE[branch][i - 1][0]}`;
      if (tier === 5) {
        def.capstone = true;
        def.exclusiveGroup = 'capstone';
      }
      out.push(def);
    });
  }
  const rally = out.find((s) => s.id === 'knight.rallyCry');
  if (rally) {
    rally.cooldown = 20;
    rally.emberCost = 10;
  }
  return out;
}

export const SKILLS: readonly SkillDef[] = build();

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(id: string): SkillDef | undefined {
  return BY_ID.get(id);
}
