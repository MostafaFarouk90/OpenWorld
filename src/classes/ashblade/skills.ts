import type { SkillDef } from '../../progression/skills';
import { TIER_COST } from '../../progression/skills';
import { ASH_CLOUD, CLASS_ID, SKILL } from './tuning';

export type AshbladeBranch = 'duskedge' | 'smokecloak' | 'flicker';

type Row = [name: string, kind: 'active' | 'passive', live: boolean];

/**
 * Design 9.4. Smokecloak tiers 1 and 2 are swapped against the design table (Quiet Soles first, Ash Cloud second) so Rally
 * Cry stays the only tier-1 active in the game. Tiers 3 to 5 are listed so the tree draws its shape, not yet learnable.
 */
const TREE: Record<AshbladeBranch, Row[]> = {
  duskedge: [
    ['backSlit', 'passive', true],
    ['bleedingEmber', 'passive', true],
    ['twinFangs', 'passive', false],
    ['cinderMark', 'active', false],
    ['deathByAThousandSparks', 'active', false],
  ],
  smokecloak: [
    ['quietSoles', 'passive', true],
    ['ashCloud', 'active', true],
    ['sootCloak', 'passive', false],
    ['decoyFootprints', 'active', false],
    ['ghostOfTheHearth', 'active', false],
  ],
  flicker: [
    ['quickSlip', 'passive', true],
    ['sparkDodge', 'passive', true],
    ['wallSkitter', 'passive', false],
    ['phoenixRoll', 'passive', false],
    ['flickerStrike', 'active', false],
  ],
};

function build(): SkillDef[] {
  const out: SkillDef[] = [];
  for (const branch of Object.keys(TREE) as AshbladeBranch[]) {
    TREE[branch].forEach(([name, kind, live], i) => {
      const tier = (i + 1) as SkillDef['tier'];
      const id = `${CLASS_ID}.${name}`;
      const def: SkillDef = {
        id,
        classId: CLASS_ID,
        branch,
        tier,
        cost: TIER_COST[i],
        kind,
        nameKey: `skill.${id}.name`,
        descKey: `skill.${id}.desc`,
        available: live,
      };
      if (i > 0) def.requires = `${CLASS_ID}.${TREE[branch][i - 1][0]}`;
      if (tier === 5) {
        def.capstone = true;
        def.exclusiveGroup = 'capstone';
      }
      if (id === SKILL.ashCloud) {
        def.cooldown = ASH_CLOUD.cooldown;
        def.emberCost = ASH_CLOUD.emberCost;
      }
      out.push(def);
    });
  }
  return out;
}

export const ASHBLADE_SKILLS: readonly SkillDef[] = build();
export const ASHBLADE_BRANCHES: readonly AshbladeBranch[] = ['duskedge', 'smokecloak', 'flicker'];
