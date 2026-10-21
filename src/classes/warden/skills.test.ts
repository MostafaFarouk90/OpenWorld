import { afterEach, describe, expect, it } from 'vitest';
import { SKILLS, TIER_COST, getSkill, registerClassSkills, resetClassSkills } from '../../progression/skills';
import { WARDEN_SKILLS } from './skills';
import { WARDEN_STRINGS_EN } from './strings.en';
import { SKILL_IDS } from './tuning';

afterEach(() => resetClassSkills());

describe('Warden skill data', () => {
  it('has three branches of five tiers with the design costs, in order', () => {
    expect(WARDEN_SKILLS).toHaveLength(15);
    for (const branch of ['hewer', 'stonehide', 'howlcaller']) {
      const rows = WARDEN_SKILLS.filter((s) => s.branch === branch);
      expect(rows.map((r) => r.tier)).toEqual([1, 2, 3, 4, 5]);
      expect(rows.map((r) => r.cost)).toEqual([...TIER_COST]);
      rows.forEach((r, i) => expect(r.requires).toBe(i === 0 ? undefined : rows[i - 1].id));
    }
  });

  it('tiers 1 to 3 are available, 4 and 5 are not; tier 5 rows are exclusive capstones', () => {
    for (const s of WARDEN_SKILLS) {
      expect(s.available).toBe(s.tier <= 3);
      expect(s.capstone === true).toBe(s.tier === 5);
      expect(s.exclusiveGroup === 'capstone').toBe(s.tier === 5);
    }
  });

  it('all ids are warden.*, and the six implemented skills exist with the right kinds', () => {
    expect(WARDEN_SKILLS.every((s) => s.id.startsWith('warden.') && s.classId === 'warden')).toBe(true);
    const kinds = (id: string) => WARDEN_SKILLS.find((s) => s.id === id)?.kind;
    expect(kinds(SKILL_IDS.cleavingSwing)).toBe('passive');
    expect(kinds(SKILL_IDS.deepWound)).toBe('passive');
    expect(kinds(SKILL_IDS.thickSkin)).toBe('passive');
    expect(kinds(SKILL_IDS.boulderShoulder)).toBe('active');
    expect(kinds(SKILL_IDS.warHowl)).toBe('passive');
    expect(kinds(SKILL_IDS.emberRage)).toBe('passive');
  });

  it('Rally Cry stays the only tier 1 active: no Warden tier 1 skill is active', () => {
    expect(WARDEN_SKILLS.filter((s) => s.tier === 1 && s.kind === 'active')).toEqual([]);
  });

  it('only the three live actives have a cooldown and an Ember cost', () => {
    const live = WARDEN_SKILLS.filter((s) => s.available && (s.cooldown || s.emberCost));
    expect(live.map((s) => s.id).sort()).toEqual([SKILL_IDS.bloodChant, SKILL_IDS.boulderShoulder, SKILL_IDS.whirlingHew].sort());
    const b = getSkillIn(SKILL_IDS.boulderShoulder);
    expect(b.cooldown).toBe(10);
    expect(b.emberCost).toBe(10);
  });

  it('every skill has a name and description string', () => {
    for (const s of WARDEN_SKILLS) {
      expect(WARDEN_STRINGS_EN[s.nameKey], s.nameKey).toBeTruthy();
      expect(WARDEN_STRINGS_EN[s.descKey], s.descKey).toBeTruthy();
    }
  });
});

function getSkillIn(id: string) {
  const s = WARDEN_SKILLS.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
}

describe('registering the Warden tree', () => {
  it('registers, resolves by id, refuses a second registration and dispose frees it', () => {
    const r = registerClassSkills('warden', WARDEN_SKILLS);
    expect(r.ok).toBe(true);
    expect(getSkill(SKILL_IDS.thickSkin)?.classId).toBe('warden');
    expect(registerClassSkills('warden', WARDEN_SKILLS)).toEqual({ ok: false, reason: 'duplicate-class' });
    if (r.ok) r.dispose();
    expect(SKILLS.some((s) => s.classId === 'warden')).toBe(false);
    expect(registerClassSkills('warden', WARDEN_SKILLS).ok).toBe(true);
  });

  it('leaves the Knight tree untouched', () => {
    const before = SKILLS.filter((s) => s.classId === 'knight').length;
    registerClassSkills('warden', WARDEN_SKILLS);
    expect(SKILLS.filter((s) => s.classId === 'knight')).toHaveLength(before);
    expect(getSkill('knight.rallyCry')).toBeDefined();
  });
});
