/** Knight skill data (design 9.1). Tiers 1 and 2 are live; tiers 3 to 5 are listed so the tree draws its full shape. */

export type SkillBranch = 'bulwark' | 'vanguard' | 'standard';

export const DEFAULT_CLASS_ID = 'knight';

export interface SkillDef {
  id: string;
  /** Owning class; ids are `<classId>.<name>`. */
  classId: string;
  /** The Knight's branches are `SkillBranch`; other classes bring their own ids. */
  branch: string;
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
        classId: DEFAULT_CLASS_ID,
        branch,
        tier,
        cost: TIER_COST[i],
        kind,
        nameKey: `skill.${id}.name`,
        descKey: `skill.${id}.desc`,
        available: tier <= 3,
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
  // Banner Plant: 20 Ember and a 45 s cooldown (the lifetime, 20 s, is in spells/tuning.ts BANNER).
  const banner = out.find((s) => s.id === 'knight.bannerPlant');
  if (banner) {
    banner.cooldown = 45;
    banner.emberCost = 20;
  }
  // Tier 3 actives (Act 2, A11): Oathward 30 s and 15 Ember; Charge of the Halvard 12 s and 15 Ember.
  const oath = out.find((s) => s.id === 'knight.oathward');
  if (oath) {
    oath.cooldown = 30;
    oath.emberCost = 15;
  }
  const charge = out.find((s) => s.id === 'knight.chargeOfTheHalvard');
  if (charge) {
    charge.cooldown = 12;
    charge.emberCost = 15;
  }
  return out;
}

const KNIGHT_SKILLS: readonly SkillDef[] = build();
/** Every registered skill, Knight first. The array is live: `registerClassSkills` appends to it. */
export const SKILLS: SkillDef[] = [...KNIGHT_SKILLS];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export type RegisterSkillsResult = { ok: true; count: number; dispose(): void } | { ok: false; reason: string };

/**
 * Adds a class's skills (threads 13 to 16). All or nothing: ids must start with `<classId>.` and be unique, tiers 1 to 5
 * with the costs of `TIER_COST`, and `requires` must name an earlier skill of the same class in the same call or a
 * registered one. A re-registration of the same class is refused.
 */
export function registerClassSkills(classId: string, defs: readonly SkillDef[]): RegisterSkillsResult {
  if (typeof classId !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(classId)) return { ok: false, reason: 'bad-class' };
  if (SKILLS.some((s) => s.classId === classId)) return { ok: false, reason: 'duplicate-class' };
  const seen = new Set<string>();
  for (const d of defs) {
    if (d.classId !== classId) return { ok: false, reason: `class-mismatch:${d.id}` };
    if (!d.id.startsWith(`${classId}.`) || d.id.length <= classId.length + 1) return { ok: false, reason: `bad-id:${d.id}` };
    if (seen.has(d.id) || BY_ID.has(d.id)) return { ok: false, reason: `duplicate-id:${d.id}` };
    if (![1, 2, 3, 4, 5].includes(d.tier) || d.cost !== TIER_COST[d.tier - 1]) return { ok: false, reason: `bad-tier-or-cost:${d.id}` };
    if (d.requires && !seen.has(d.requires) && !BY_ID.has(d.requires)) return { ok: false, reason: `bad-requires:${d.id}` };
    seen.add(d.id);
  }
  for (const d of defs) {
    SKILLS.push(d);
    BY_ID.set(d.id, d);
  }
  return {
    ok: true,
    count: defs.length,
    dispose: () => {
      for (const d of defs) {
        const at = SKILLS.indexOf(d);
        if (at >= 0) SKILLS.splice(at, 1);
        if (BY_ID.get(d.id) === d) BY_ID.delete(d.id);
      }
    },
  };
}

/** Test seam: forgets every class but the Knight. */
export function resetClassSkills(): void {
  SKILLS.length = 0;
  SKILLS.push(...KNIGHT_SKILLS);
  BY_ID.clear();
  for (const s of SKILLS) BY_ID.set(s.id, s);
}

export function getSkill(id: string): SkillDef | undefined {
  return BY_ID.get(id);
}
