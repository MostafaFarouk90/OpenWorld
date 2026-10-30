import { TIER_COST, masterBookGate, registerClassSkills, type RegisterSkillsResult, type SkillDef } from '../../progression/skills';
import { ANVIL_DROP, CLASS_ID, FIRE_WALL, FLAME_LASH, IRON_FAMILIAR, SMOKE_SCREEN, WARM_BREATH } from './tuning';

export const EMBERWRIGHT_BRANCHES = ['pyre', 'anvilcraft', 'bellowsbreath'] as const;
export type EmberwrightBranch = (typeof EMBERWRIGHT_BRANCHES)[number];

type Row = [name: string, kind: 'active' | 'passive'];

/** Design 9.3. Tiers 1 to 3 are live; 4 and 5 are listed so the tree draws its full shape. Tier 1 is all passive: Rally Cry is the only tier-1 active. */
const TREE: Record<EmberwrightBranch, Row[]> = {
  pyre: [['emberBolt', 'passive'], ['flameLash', 'active'], ['fireWall', 'active'], ['cinderRain', 'active'], ['sunfireNova', 'active']],
  anvilcraft: [['forgeSpark', 'passive'], ['anvilDrop', 'active'], ['ironFamiliar', 'active'], ['temperWeapon', 'active'], ['colossusOfSlag', 'active']],
  bellowsbreath: [['gustStep', 'passive'], ['warmBreath', 'active'], ['smokeScreen', 'active'], ['updraft', 'active'], ['breathOfTheKeepers', 'active']],
};

export const skillId = (name: string): string => `${CLASS_ID}.${name}`;
export const SKILL = {
  emberBolt: skillId('emberBolt'),
  flameLash: skillId('flameLash'),
  fireWall: skillId('fireWall'),
  forgeSpark: skillId('forgeSpark'),
  anvilDrop: skillId('anvilDrop'),
  ironFamiliar: skillId('ironFamiliar'),
  gustStep: skillId('gustStep'),
  warmBreath: skillId('warmBreath'),
  smokeScreen: skillId('smokeScreen'),
} as const;

const NUMBERS: Record<string, { emberCost: number; cooldown: number }> = {
  flameLash: { emberCost: FLAME_LASH.ember, cooldown: FLAME_LASH.cooldown },
  anvilDrop: { emberCost: ANVIL_DROP.ember, cooldown: ANVIL_DROP.cooldown },
  warmBreath: { emberCost: WARM_BREATH.ember, cooldown: WARM_BREATH.cooldown },
  fireWall: { emberCost: FIRE_WALL.ember, cooldown: FIRE_WALL.cooldown },
  ironFamiliar: { emberCost: IRON_FAMILIAR.ember, cooldown: IRON_FAMILIAR.cooldown },
  smokeScreen: { emberCost: SMOKE_SCREEN.ember, cooldown: SMOKE_SCREEN.cooldown },
};

export function buildEmberwrightSkills(): SkillDef[] {
  const out: SkillDef[] = [];
  for (const branch of EMBERWRIGHT_BRANCHES) {
    TREE[branch].forEach(([name, kind], i) => {
      const tier = (i + 1) as SkillDef['tier'];
      const def: SkillDef = {
        id: skillId(name),
        classId: CLASS_ID,
        branch,
        tier,
        cost: TIER_COST[i],
        kind,
        nameKey: `skill.${skillId(name)}.name`,
        descKey: `skill.${skillId(name)}.desc`,
        availableWhen: tier <= 3 ? true : masterBookGate(CLASS_ID),
      };
      if (i > 0) def.requires = skillId(TREE[branch][i - 1][0]);
      if (tier === 5) {
        def.capstone = true;
        def.exclusiveGroup = 'capstone';
      }
      const n = NUMBERS[name];
      if (n) Object.assign(def, n);
      out.push(def);
    });
  }
  return out;
}

/** Disposed with the plugin; a class already registered (a restart that skipped dispose) counts as success. */
export function registerEmberwrightSkills(): RegisterSkillsResult {
  const r = registerClassSkills(CLASS_ID, buildEmberwrightSkills());
  return !r.ok && r.reason === 'duplicate-class' ? { ok: true, count: 0, dispose: () => undefined } : r;
}
