/** Knight skill data (design 9.1). Tiers 1 and 2 are live; tiers 3 to 5 are listed so the tree draws its full shape. */
import { flagConditionHolds, type FlagCondition, type FlagReader } from '../core/flagCondition';

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
  /**
   * v0.7 (item 10): when the skill can be LEARNED. `true` or `false` are the shorthands every shipped tier 1 to 3 skill
   * uses; tiers 4 and 5 learn once `story.gate.a3` and the class master's book `trainer.<classId>.masterBook` are set
   * (`masterBookGate`). The condition gates learning only: `Progression.load` never reads it, so a learned skill always
   * loads.
   */
  availableWhen: FlagCondition | boolean;
  /** Seconds. */
  cooldown?: number;
  emberCost?: number;
  capstone?: true;
  exclusiveGroup?: 'capstone';
}

/** The class master's book flag (K11's `grantMasterBook(classId)` writes it; design 9, Q2). */
export const masterBookFlag = (classId: string): string => `trainer.${classId}.masterBook`;

/** v0.7: tiers 4 and 5 are learned once Act 3 has begun and the class master's book has been given (Q2). */
export function masterBookGate(classId: string): FlagCondition {
  return { all: ['story.gate.a3', masterBookFlag(classId)] };
}

/** Whether a skill can be learned for this state (its `availableWhen`). A missing reader reads every flag as unset. */
export function skillLearnable(skill: Pick<SkillDef, 'availableWhen'>, state?: FlagReader | null): boolean {
  const w = skill.availableWhen;
  if (typeof w === 'boolean') return w;
  return flagConditionHolds(w, state ?? NO_FLAGS);
}

const NO_FLAGS: FlagReader = { getFlag: () => undefined };

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
    ['heartshardSmite', 'passive'],
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
        availableWhen: tier <= 3 ? true : masterBookGate(DEFAULT_CLASS_ID),
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
  // Tier 4 actives (Act 3, K11): Bastion Wall 20 s and 20 Ember; Executioner's Arc 10 s and 20 Ember.
  const bastion = out.find((s) => s.id === 'knight.bastionWall');
  if (bastion) {
    bastion.cooldown = 20;
    bastion.emberCost = 20;
  }
  const arc = out.find((s) => s.id === 'knight.executionersArc');
  if (arc) {
    arc.cooldown = 10;
    arc.emberCost = 20;
  }
  // Tier 5 capstones (Act 3, K11 PR 3): Unbroken Oath 60 s and 30 Ember; Banner of the Sunforge 60 s and 30 Ember.
  // Heartshard Smite is a passive (open point A): it triggers on the Surge and has no cooldown or cost of its own.
  const unbroken = out.find((s) => s.id === 'knight.unbrokenOath');
  if (unbroken) {
    unbroken.cooldown = 60;
    unbroken.emberCost = 30;
  }
  const sunforge = out.find((s) => s.id === 'knight.bannerOfTheSunforge');
  if (sunforge) {
    sunforge.cooldown = 60;
    sunforge.emberCost = 30;
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
