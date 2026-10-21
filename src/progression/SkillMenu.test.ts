import { describe, expect, it } from 'vitest';
import { StubDocument, StubElement, textOf } from '../hud/dom';
import { registerClassSkills, SKILLS, type SkillDef } from './skills';
import { Progression } from './Progression';
import { SkillMenu } from './SkillMenu';
import { skillViewModel } from './skillViewModel';
import { SKILL_STRINGS_EN } from './strings.en';
import { fakeActor } from './testkit';

const t = (k: string, p?: Record<string, string | number>): string => {
  const s = SKILL_STRINGS_EN[k] ?? `[[${k}]]`;
  return s.replace(/\{(\w+)\}/g, (_, n) => String(p?.[n] ?? `{${n}}`));
};

function setup(points = 1) {
  const actor = fakeActor();
  const prog = new Progression({ emit: () => {}, logger: { warn: () => {} }, actor: () => actor });
  if (points > 0) prog.grantSkillPoint(points, 'test');
  const learned: string[] = [];
  let refused = 0;
  const menu = new SkillMenu(new StubDocument(), {
    progression: prog, t, close: () => {}, onLearn: (id) => learned.push(id), onRefused: () => refused++,
  });
  const learnButtons = (): StubElement[] => {
    const out: StubElement[] = [];
    const walk = (e: any) => { if (e.tag === 'button' && /^Learn/.test(e.textContent ?? '')) out.push(e); e.children.forEach(walk); };
    walk(menu.element);
    return out;
  };
  return { prog, menu, learned, learnButtons, refused: () => refused };
}

describe('skillViewModel', () => {
  it('draws all three branches with five tiers; tiers 1 to 3 are drawn live, 4 and 5 locked', () => {
    const { prog } = setup(1);
    const vm = skillViewModel(prog);
    expect(vm.branches.map((b) => b.nodes.length)).toEqual([5, 5, 5]);
    expect(vm.branches.flatMap((b) => b.nodes).filter((n) => n.state === 'learnable')).toHaveLength(3);
    expect(vm.branches.flatMap((b) => b.nodes).filter((n) => n.state === 'blocked')).toHaveLength(6); // tiers 2 and 3 wait on the tier before
    expect(vm.branches.flatMap((b) => b.nodes).filter((n) => n.state === 'unavailable')).toHaveLength(6);
  });

  it('with no points tier 1 reads no-points, learned reads learned', () => {
    const { prog } = setup(0);
    expect(skillViewModel(prog).branches[0].nodes[0].state).toBe('no-points');
    prog.grantSkillPoint(1, 'x');
    prog.learn('knight.rimBash');
    expect(skillViewModel(prog).branches[0].nodes[0].state).toBe('learned');
  });
});

describe('SkillMenu', () => {
  it('learning spends the point, reports onLearn and re-renders', () => {
    const { prog, menu, learned, learnButtons } = setup(1);
    learnButtons()[6].click(); // standard tier 1: rally cry (the tier 2 and 3 buttons of the first two branches sit between)
    expect(prog.learned('knight.rallyCry')).toBe(true);
    expect(prog.bar()[0]).toBe('knight.rallyCry');
    expect(learned).toEqual(['knight.rallyCry']);
    expect(textOf(menu.element)).toContain('Skill points: 0');
  });

  it('a click with no points left is refused without changing anything', () => {
    const { prog, learnButtons, refused } = setup(1);
    const buttons = learnButtons();
    buttons[0].click();
    buttons[1].click();
    expect(prog.learned('knight.riposteEdge')).toBe(false);
    expect(refused()).toBe(1);
  });

  it('shows locked later tiers instead of a learn button', () => {
    const { menu } = setup(5);
    expect(textOf(menu.element)).toContain('Opens in Act 3');
  });
});

describe('class-aware skill menu', () => {
  const def = (cls: string, name: string, branch: string, tier: SkillDef['tier'] = 1): SkillDef => ({
    id: `${cls}.${name}`, classId: cls, branch, tier, cost: 1, kind: 'passive',
    nameKey: `skill.${cls}.${name}`, descKey: `skill.${cls}.${name}.d`, available: true,
  });
  const mk = (classId?: () => string | null | undefined, tt = t) => {
    const actor = fakeActor();
    const prog = new Progression({ emit: () => {}, logger: { warn: () => {} }, actor: () => actor });
    const menu = new SkillMenu(new StubDocument(), { progression: prog, t: tt, close: () => {}, classId });
    return { prog, menu };
  };
  const before = SKILLS.length;
  const cleanup = () => SKILLS.splice(before);

  it('Knight keeps bulwark, vanguard, standard in order', () => {
    const { prog } = mk();
    expect(skillViewModel(prog, 'knight').branches.map((b) => b.branch)).toEqual(['bulwark', 'vanguard', 'standard']);
    expect(skillViewModel(prog).branches).toHaveLength(3);
  });

  it('a registered class shows only its own branches, in registration order; switching re-reads', () => {
    try {
      expect(registerClassSkills('mage', [def('mage', 'a', 'frost'), def('mage', 'b', 'arcane'), def('mage', 'c', 'frost', 2)]).ok).toBe(true);
      let cls = 'mage';
      const { prog, menu } = mk(() => cls);
      expect(skillViewModel(prog, 'mage').branches.map((b) => b.branch)).toEqual(['frost', 'arcane']);
      expect(textOf(menu.element)).toContain('Frost');
      expect(textOf(menu.element)).not.toContain('Bulwark');
      cls = 'knight';
      menu.render();
      expect(textOf(menu.element)).toContain('Bulwark');
      expect(textOf(menu.element)).not.toContain('Frost');
    } finally { cleanup(); }
  });

  it('missing branch string falls back to a title-cased id; a present one wins', () => {
    try {
      registerClassSkills('rogue', [def('rogue', 'a', 'shadow-step')]);
      const { menu } = mk(() => 'rogue');
      expect(textOf(menu.element)).toContain('Shadow Step');
      const { menu: m2 } = mk(() => 'rogue', (k, p) => (k === 'hud.skills.branch.shadow-step' ? 'Umbra' : t(k, p)));
      expect(textOf(m2.element)).toContain('Umbra');
    } finally { cleanup(); }
  });

  it('empty or unknown class shows the empty message', () => {
    expect(textOf(mk(() => 'ghost').menu.element)).toContain('This class has no skills yet.');
    const { prog } = mk();
    expect(skillViewModel(prog, 'ghost').branches).toEqual([]);
  });

  it('absent classes service (undefined/null) falls back to the progression class, then the Knight', () => {
    const { prog, menu } = mk(() => undefined);
    expect(textOf(menu.element)).toContain('Bulwark');
    try {
      registerClassSkills('bard', [def('bard', 'a', 'song')]);
      prog.setClass('bard');
      expect(skillViewModel(prog).branches.map((b) => b.branch)).toEqual(['song']);
      expect(skillViewModel(prog, null).branches.map((b) => b.branch)).toEqual(['song']);
    } finally { cleanup(); }
  });
});
