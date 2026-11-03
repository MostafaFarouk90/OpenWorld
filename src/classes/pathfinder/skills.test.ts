import { afterEach, describe, expect, it } from 'vitest';
import { SKILLS, TIER_COST, getSkill, registerClassSkills, resetClassSkills } from '../../progression/skills';
import { buildPathfinderSkills } from './skills';
import { PATHFINDER_STRINGS_EN } from './strings.en';
import { PF } from './tuning';

afterEach(() => resetClassSkills());

describe('Pathfinder skills', () => {
  it('registers fifteen skills in three branches and a second registration is the duplicate-class refusal the plugin tolerates', () => {
    const r = registerClassSkills(PF.classId, buildPathfinderSkills());
    expect(r).toMatchObject({ ok: true, count: 15 });
    expect(SKILLS.filter((s) => s.classId === PF.classId).map((s) => s.branch)).toEqual(
      expect.arrayContaining(['bolt', 'snare', 'trail']),
    );
    expect(registerClassSkills(PF.classId, buildPathfinderSkills())).toEqual({ ok: false, reason: 'duplicate-class' });
  });

  it('only tiers 1 to 3 can be learned; each tier costs TIER_COST and requires the one below', () => {
    const defs = buildPathfinderSkills();
    for (const d of defs) {
      expect(d.availableWhen === true).toBe(d.tier <= 3);
      expect(d.cost).toBe(TIER_COST[d.tier - 1]);
      if (d.tier > 1) expect(defs.find((s) => s.id === d.requires)).toMatchObject({ branch: d.branch, tier: d.tier - 1 });
      else expect(d.requires).toBeUndefined();
    }
    expect(defs.filter((d) => d.capstone).map((d) => d.exclusiveGroup)).toEqual(['capstone', 'capstone', 'capstone']);
  });

  it('Rally Cry stays the only tier-1 active: Tripwire is a passive, the tier-2 actives carry cooldown and Ember', () => {
    const defs = buildPathfinderSkills();
    expect(defs.filter((d) => d.tier === 1 && d.kind === 'active')).toEqual([]);
    const trap = defs.find((d) => d.id === PF.skillIds.cinderTrap)!;
    const eye = defs.find((d) => d.id === PF.skillIds.falconEye)!;
    expect(trap).toMatchObject({ kind: 'active', tier: 2, cooldown: 20, emberCost: 15 });
    expect(eye).toMatchObject({ kind: 'active', tier: 2, cooldown: 30, emberCost: 15 });
    expect(defs.find((d) => d.id === PF.skillIds.netLauncher)).toMatchObject({ kind: 'active', tier: 3, cooldown: 16, emberCost: 15 });
    // Tier 4 (K11 PR 2): Caltrop Field is the only tier-4 active with a cost here; Triple Shot and Sure Foot are passives.
    expect(defs.find((d) => d.id === PF.skillIds.caltropField)).toMatchObject({ kind: 'active', tier: 4, cooldown: 18, emberCost: 15 });
    for (const id of [PF.skillIds.tripleShot, PF.skillIds.sureFoot]) expect(defs.find((d) => d.id === id)).toMatchObject({ kind: 'passive', tier: 4 });
  });

  it('keeps the node rule: one flat percentage bump on Bolt (Steady Shot) and one on Trail (Trailblaze), none on Snare', () => {
    // Falcon Eye has no numeric damage bonus: its description names poise, not a percentage of damage.
    expect(PATHFINDER_STRINGS_EN['skill.pathfinder.falconEye.desc']).not.toMatch(/\+\d+%/);
    expect(PATHFINDER_STRINGS_EN['skill.pathfinder.steadyShot.desc']).toMatch(/\+25%/);
    expect(PATHFINDER_STRINGS_EN['skill.pathfinder.trailblaze.desc']).toMatch(/10%/);
  });

  it('every skill has name and description strings, and every id the code uses exists', () => {
    for (const d of buildPathfinderSkills()) {
      expect(PATHFINDER_STRINGS_EN[d.nameKey], d.nameKey).toBeTruthy();
      expect(PATHFINDER_STRINGS_EN[d.descKey], d.descKey).toBeTruthy();
    }
    registerClassSkills(PF.classId, buildPathfinderSkills());
    for (const id of Object.values(PF.skillIds)) expect(getSkill(id), id).toBeDefined();
    for (const b of ['bolt', 'snare', 'trail']) expect(PATHFINDER_STRINGS_EN[`hud.skills.branch.${b}`]).toBeTruthy();
  });

  it('resetClassSkills forgets the class, so a respec away and a restart start clean', () => {
    registerClassSkills(PF.classId, buildPathfinderSkills());
    resetClassSkills();
    expect(getSkill(PF.skillIds.steadyShot)).toBeUndefined();
  });
});
