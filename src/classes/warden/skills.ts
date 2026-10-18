import { TIER_COST, type SkillDef } from '../../progression/skills';
import { BOULDER, WARDEN_CLASS_ID } from './tuning';

type Branch = 'hewer' | 'stonehide' | 'howlcaller';
type Row = [name: string, kind: 'active' | 'passive'];

/** Design 9.2. Tiers 1 and 2 are live; 3 to 5 are listed so the tree draws its full shape. */
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
        available: tier <= 2,
      };
      if (i > 0) def.requires = `${WARDEN_CLASS_ID}.${TREE[branch][i - 1][0]}`;
      if (tier === 5) {
        def.capstone = true;
        def.exclusiveGroup = 'capstone';
      }
      if (def.id === `${WARDEN_CLASS_ID}.boulderShoulder`) {
        def.cooldown = BOULDER.cooldown;
        def.emberCost = BOULDER.emberCost;
      }
      out.push(def);
    });
  }
  return out;
}

export const WARDEN_SKILLS: readonly SkillDef[] = build();
