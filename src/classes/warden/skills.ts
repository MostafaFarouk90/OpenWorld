import { TIER_COST, masterBookGate, type SkillDef } from '../../progression/skills';
import { BLOOD_CHANT, BOULDER, WARDEN_CLASS_ID, WHIRLING_HEW } from './tuning';

type Branch = 'hewer' | 'stonehide' | 'howlcaller';
type Row = [name: string, kind: 'active' | 'passive'];

/** Design 9.2. Tiers 1 to 3 are live; 4 and 5 are listed so the tree draws its full shape. */
const TREE: Record<Branch, Row[]> = {
  hewer: [
    ['cleavingSwing', 'passive'],
    ['deepWound', 'passive'],
    ['whirlingHew', 'active'],
    ['skullsplitter', 'active'],
    ['wyrmbreaker', 'active'],
  ],
  stonehide: [
    ['thickSkin', 'passive'],
    ['boulderShoulder', 'active'],
    ['gritTeeth', 'passive'],
    ['earthroot', 'active'],
    ['mountainUnmoved', 'active'],
  ],
  howlcaller: [
    // Rally Cry is the only tier-1 active in the game, so War Howl is a trigger passive (see the plan, section 6).
    ['warHowl', 'passive'],
    ['emberRage', 'passive'],
    ['bloodChant', 'active'],
    ['frenziedHearth', 'passive'],
    ['voiceOfTheMountain', 'active'],
  ],
};

const ACTIVE_COSTS: Record<string, { cooldown: number; emberCost: number }> = {
  [`${WARDEN_CLASS_ID}.boulderShoulder`]: BOULDER,
  [`${WARDEN_CLASS_ID}.whirlingHew`]: WHIRLING_HEW,
  [`${WARDEN_CLASS_ID}.bloodChant`]: BLOOD_CHANT,
};

function build(): SkillDef[] {
  const out: SkillDef[] = [];
  for (const branch of ['hewer', 'stonehide', 'howlcaller'] as const) {
    TREE[branch].forEach(([name, kind], i) => {
      const tier = (i + 1) as SkillDef['tier'];
      const def: SkillDef = {
        id: `${WARDEN_CLASS_ID}.${name}`,
        classId: WARDEN_CLASS_ID,
        branch,
        tier,
        cost: TIER_COST[i],
        kind,
        nameKey: `skill.${WARDEN_CLASS_ID}.${name}.name`,
        descKey: `skill.${WARDEN_CLASS_ID}.${name}.desc`,
        availableWhen: tier <= 3 ? true : masterBookGate(WARDEN_CLASS_ID),
      };
      if (i > 0) def.requires = `${WARDEN_CLASS_ID}.${TREE[branch][i - 1][0]}`;
      if (tier === 5) {
        def.capstone = true;
        def.exclusiveGroup = 'capstone';
      }
      const active = ACTIVE_COSTS[def.id];
      if (active) {
        def.cooldown = active.cooldown;
        def.emberCost = active.emberCost;
      }
      out.push(def);
    });
  }
  return out;
}

export const WARDEN_SKILLS: readonly SkillDef[] = build();
