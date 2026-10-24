import { TIER_COST, masterBookGate, type SkillDef } from '../../progression/skills';
import { PF } from './tuning';

type Row = [name: string, kind: 'active' | 'passive'];

/** Design 9.5. Tiers 1 to 3 are live; tiers 4 and 5 are listed so the tree draws its full shape. */
const TREE: Record<string, Row[]> = {
  bolt: [
    ['steadyShot', 'passive'],
    ['piercingBolt', 'passive'],
    ['emberQuarrel', 'passive'],
    ['tripleShot', 'passive'],
    ['dragonbaneBolt', 'passive'],
  ],
  snare: [
    // Rally Cry is the only tier-1 active in the game (ruling), so the Tripwire is a passive: a dodge leaves the wire.
    ['tripwire', 'passive'],
    ['cinderTrap', 'active'],
    ['netLauncher', 'active'],
    ['caltropField', 'active'],
    ['huntersWeb', 'active'],
  ],
  trail: [
    ['trailblaze', 'passive'],
    ['falconEye', 'active'],
    ['lightStep', 'passive'],
    ['sureFoot', 'passive'],
    ['skyhawkStrike', 'active'],
  ],
};

export function buildPathfinderSkills(): SkillDef[] {
  const out: SkillDef[] = [];
  for (const [branch, rows] of Object.entries(TREE)) {
    rows.forEach(([name, kind], i) => {
      const tier = (i + 1) as SkillDef['tier'];
      const def: SkillDef = {
        id: `${PF.classId}.${name}`,
        classId: PF.classId,
        branch,
        tier,
        cost: TIER_COST[i],
        kind,
        nameKey: `skill.${PF.classId}.${name}.name`,
        descKey: `skill.${PF.classId}.${name}.desc`,
        availableWhen: tier <= 3 ? true : masterBookGate(PF.classId),
      };
      if (i > 0) def.requires = `${PF.classId}.${rows[i - 1][0]}`;
      if (tier === 5) {
        def.capstone = true;
        def.exclusiveGroup = 'capstone';
      }
      out.push(def);
    });
  }
  const trap = out.find((s) => s.id === PF.skillIds.cinderTrap)!;
  trap.cooldown = PF.cinderTrap.cooldown;
  trap.emberCost = PF.cinderTrap.ember;
  const eye = out.find((s) => s.id === PF.skillIds.falconEye)!;
  eye.cooldown = PF.falconEye.cooldown;
  eye.emberCost = PF.falconEye.ember;
  const net = out.find((s) => s.id === PF.skillIds.netLauncher)!;
  net.cooldown = PF.netLauncher.cooldown;
  net.emberCost = PF.netLauncher.ember;
  return out;
}
