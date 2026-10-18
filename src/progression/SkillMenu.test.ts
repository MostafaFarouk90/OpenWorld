import { describe, expect, it } from 'vitest';
import { StubDocument, StubElement, textOf } from '../hud/dom';
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
  it('draws all three branches with five tiers; only tier 1 is learnable', () => {
    const { prog } = setup(1);
    const vm = skillViewModel(prog);
    expect(vm.branches.map((b) => b.nodes.length)).toEqual([5, 5, 5]);
    expect(vm.branches.flatMap((b) => b.nodes).filter((n) => n.state === 'learnable')).toHaveLength(3);
    expect(vm.branches.flatMap((b) => b.nodes).filter((n) => n.state === 'unavailable')).toHaveLength(12);
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
    learnButtons()[2].click(); // standard: rally cry
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
    expect(textOf(menu.element)).toContain('Not available yet');
  });
});
