import { describe, expect, it } from 'vitest';
import { CompanionPortrait } from './CompanionPortrait';
import { StubDocument, textOf } from './dom';

function make(active: string[] = [], actors: Record<string, { health: number; maxHealth: number }> = {}) {
  const ids = { active, map: { tobb: 'a1' } as Record<string, string | null> };
  const p = new CompanionPortrait(new StubDocument(), {
    active: () => ids.active,
    actorId: (id) => ids.map[id] ?? null,
    actor: (a) => actors[a],
    t: (k) => (k === 'hud.companion.tobb' ? 'Tobb' : `[[${k}]]`),
  });
  return { p, ids, actors };
}

describe('CompanionPortrait', () => {
  it('is hidden with no companion', () => {
    const { p } = make();
    expect(p.element.style.display).toBe('none');
    expect(p.count).toBe(0);
  });

  it('reads active() at setup: name and health bar', () => {
    const { p } = make(['tobb'], { a1: { health: 30, maxHealth: 60 } });
    expect(p.count).toBe(1);
    expect(textOf(p.element)).toContain('Tobb');
    expect(p.element.children[0]!.children[1]!.children[0]!.style.width).toBe('50%');
  });

  it('join and left events', () => {
    const { p } = make([], { a2: { health: 10, maxHealth: 10 } });
    p.joined('tobb', 'a2');
    expect(p.count).toBe(1);
    p.joined('tobb', 'a2');
    expect(p.count).toBe(1);
    p.left('tobb');
    expect(p.count).toBe(0);
    expect(p.element.style.display).toBe('none');
    expect(() => p.left('tobb')).not.toThrow();
  });

  it('aura toggles the pip', () => {
    const { p } = make(['tobb'], { a1: { health: 1, maxHealth: 1 } });
    const pip = () => p.element.children[0]!.children[0]!.children[1]!;
    expect(pip().className).not.toContain('aura-on');
    p.aura('tobb', true);
    expect(pip().className).toContain('aura-on');
    p.aura('tobb', false);
    expect(pip().className).not.toContain('aura-on');
    expect(() => p.aura('nobody', true)).not.toThrow();
  });

  it('reload after a load joins or removes without events', () => {
    const { p, ids } = make([]);
    ids.active = ['tobb'];
    p.reload();
    expect(p.count).toBe(1);
    ids.active = [];
    p.reload();
    expect(p.count).toBe(0);
  });

  it('unknown actor: shown with an empty bar, no crash; unknown id gets a title-cased name', () => {
    const { p } = make();
    p.joined('hrolf', 'ghost');
    p.update();
    expect(textOf(p.element)).toContain('Hrolf');
    expect(p.element.children[0]!.children[1]!.children[0]!.style.width).toBe('0%');
  });

  it('no companions service at all', () => {
    const p = new CompanionPortrait(new StubDocument(), {});
    expect(() => {
      p.reload();
      p.update();
    }).not.toThrow();
    expect(p.count).toBe(0);
  });
});
