// K11 PRs 1 and 2, brief's named test: K0's load rule re-run against the real tier 4 rows of all five classes. A learned tier 4 skill is never
// lost on load, with the Act 3 flags absent or loaded after progression.
import { describe, expect, it } from 'vitest';
import { Progression } from './Progression';
import { SKILLS, getSkill, registerClassSkills } from './skills';
import { fakeActor } from './testkit';
import { ASHBLADE_SKILLS } from '../classes/ashblade/skills';
import { WARDEN_SKILLS } from '../classes/warden/skills';
import { buildEmberwrightSkills } from '../classes/emberwright/skills';
import { buildPathfinderSkills } from '../classes/pathfinder/skills';

registerClassSkills('warden', [...WARDEN_SKILLS]);
registerClassSkills('ashblade', [...ASHBLADE_SKILLS]);
registerClassSkills('emberwright', buildEmberwrightSkills());
registerClassSkills('pathfinder', buildPathfinderSkills());

const T4 = {
  knight: ['knight.bastionWall', 'knight.executionersArc', 'knight.hearthfireWard'],
  warden: ['warden.skullsplitter', 'warden.earthroot', 'warden.frenziedHearth'],
  ashblade: ['ashblade.cinderMark', 'ashblade.decoyFootprints', 'ashblade.phoenixRoll'],
  emberwright: ['emberwright.cinderRain', 'emberwright.temperWeapon', 'emberwright.updraft'],
  pathfinder: ['pathfinder.tripleShot', 'pathfinder.caltropField', 'pathfinder.sureFoot'],
} as const;

/** Every skill of the class up to tier 4, in tier order (so `requires` holds as they load). */
function treeTo4(classId: string): string[] {
  return SKILLS.filter((s) => s.classId === classId && s.tier <= 4).sort((a, b) => a.tier - b.tier).map((s) => s.id);
}

function make(withStore: boolean, flags = new Map<string, boolean>()) {
  return new Progression({
    emit: () => {},
    logger: { warn: () => {} },
    actor: () => fakeActor(),
    ...(withStore ? { flags: { get: (k: string) => flags.get(k), set: (k: string, v: boolean) => void flags.set(k, v) } } : {}),
  });
}

describe('tier 4: learned skills survive a load without the Act 3 flags', () => {
  for (const [classId, ids] of Object.entries(T4)) {
    const learned = treeTo4(classId);
    const cost = learned.reduce((n, id) => n + getSkill(id)!.cost, 0);
    const actives = ids.filter((id) => getSkill(id)!.kind === 'active');
    const save = {
      xp: 0,
      storyPoints: cost,
      learned,
      bar: [...actives, null, null, null, null, null, null].slice(0, 6),
      classId: classId === 'knight' ? null : classId,
      respecUsed: false,
    };

    it(`${classId}: all three tier 4 skills and their bar slots load with the flags absent`, () => {
      const p = make(true);
      p.load(save);
      for (const id of ids) expect(p.learned(id), id).toBe(true);
      expect(p.bar()).toEqual(save.bar);
      expect(p.skillPoints).toBe(0);
    });

    it(`${classId}: the same when progression loads before the flag store exists`, () => {
      const p = make(false);
      p.load(save);
      expect(p.serialize().learned).toEqual(learned);
      expect(p.serialize().bar).toEqual(save.bar);
    });

    it(`${classId}: the point cap still holds (one point short drops a skill)`, () => {
      const p = make(true);
      p.load({ ...save, storyPoints: cost - 1 });
      expect(p.skillPoints).toBeGreaterThanOrEqual(0);
      expect(learned.filter((id) => p.learned(id)).length).toBeLessThan(learned.length);
    });

    it(`${classId}: the tier 4 actives carry a cooldown and an Ember cost`, () => {
      for (const id of actives) {
        expect(getSkill(id)!.cooldown, id).toBeGreaterThan(0);
        expect(getSkill(id)!.emberCost, id).toBeGreaterThan(0);
      }
    });
  }
});
