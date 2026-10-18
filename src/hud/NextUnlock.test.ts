import { describe, expect, it } from 'vitest';
import { StubDocument } from './dom';
import type { NextUnlock as Info } from './ports';
import { NextUnlock } from './NextUnlock';

function make(n: Info, points = 0) {
  const state = { n, points };
  const w = new NextUnlock(new StubDocument(), { nextUnlock: () => state.n, skillPoints: () => state.points, skillName: (id) => `Skill ${id}` });
  return { state, w, text: w.element.children[0]!, badge: w.element.children[1]! };
}

describe('NextUnlock', () => {
  it('shows the level line', () => {
    const { text, badge, w } = make({ kind: 'level', remaining: 30, level: 5 });
    expect(text.textContent).toBe('30 XP to level 5');
    expect(badge.style.display).toBe('none');
    expect(w.element.style.display).toBe('block');
  });
  it('shows a skill within reach', () => {
    const { text } = make({ kind: 'skill', remaining: 12.2, skillId: 'knight.rallyCry' });
    expect(text.textContent).toBe('13 XP to unlock Skill knight.rallyCry');
  });
  it('is hidden at the cap with no points', () => {
    const { w, text } = make({ kind: 'none' });
    expect(w.element.style.display).toBe('none');
    expect(text.style.display).toBe('none');
  });
  it('shows a gold badge when points > 0, even at the cap', () => {
    const { w, badge, state } = make({ kind: 'none' }, 1);
    expect(w.element.style.display).toBe('block');
    expect(badge.textContent).toBe('1 skill point to spend');
    state.points = 3;
    w.update();
    expect(badge.textContent).toBe('3 skill points to spend');
    state.points = NaN;
    w.update();
    expect(badge.style.display).toBe('none');
  });
  it('bad remaining values clamp to 0', () => {
    expect(make({ kind: 'level', remaining: NaN, level: 2 }).text.textContent).toBe('0 XP to level 2');
    expect(make({ kind: 'level', remaining: -5, level: 2 }).text.textContent).toBe('0 XP to level 2');
  });
  it('dispose removes the element', () => {
    const { w } = make({ kind: 'none' });
    const root = new StubDocument().createElement('div');
    root.append(w.element);
    w.dispose();
    expect(root.children).toHaveLength(0);
  });
});

describe('NextUnlock with a point to spend', () => {
  it('reads "spend your point", not "0 XP to unlock"', () => {
    const n = new NextUnlock(new StubDocument(), {
      nextUnlock: () => ({ kind: 'skill', remaining: 0, skillId: 'knight.rimBash' }),
      skillPoints: () => 1,
      skillName: () => 'Shield Rim Bash',
    });
    expect(n.label()).toBe('Spend your skill point: Shield Rim Bash');
  });
});
