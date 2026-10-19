import { describe, expect, it } from 'vitest';
import { BOSS_FADE_SECONDS, BossBar, phaseTickOffsets, type BossView } from './BossBar';
import { StubDocument, textOf } from './dom';

const view = (over: Partial<BossView> = {}): BossView => ({
  bossId: 'prior',
  nameKey: 'boss.prior',
  health: 50,
  maxHealth: 100,
  phase: 1,
  phases: 3,
  breaks: 1,
  breaksPerPhase: 3,
  shield: false,
  releaseOpen: false,
  outcome: null,
  ...over,
});

function make(initial: BossView[] = [], withState = true) {
  const states = new Map(initial.map((b) => [b.bossId, b]));
  const bar = new BossBar(new StubDocument(), {
    active: () => [...states.keys()],
    state: withState ? (id) => states.get(id) ?? null : undefined,
    t: (k) => k,
  });
  return { bar, states };
}
const display = (bar: BossBar) => bar.element.style.display;

describe('phaseTickOffsets', () => {
  it('has phases-1 evenly spaced ticks', () => {
    expect(phaseTickOffsets(1)).toEqual([]);
    expect(phaseTickOffsets(2)).toEqual([50]);
    expect(phaseTickOffsets(4)).toEqual([75, 50, 25]);
    expect(phaseTickOffsets(NaN)).toEqual([]);
  });
});

describe('BossBar', () => {
  it('is hidden with no boss', () => {
    const { bar } = make();
    expect(display(bar)).toBe('none');
  });

  it('initialises from active(): name, health, ticks, pips', () => {
    const { bar } = make([view()]);
    expect(display(bar)).toBe('flex');
    expect(textOf(bar.element)).toContain('boss.prior');
    expect(bar.element.children[1]!.children[0]!.style.width).toBe('50%');
    const ticks = bar.element.children[1]!.children.slice(1);
    expect(ticks.map((t) => t.style.left)).toEqual(['66.67%', '33.33%']);
    const pips = bar.element.children[2]!.children;
    expect(pips).toHaveLength(3);
    expect(pips.filter((p) => p.className.includes('pip-on'))).toHaveLength(1);
  });

  it('skips a registered boss that already has an outcome', () => {
    const { bar } = make([view({ outcome: 'defeated' })]);
    expect(display(bar)).toBe('none');
  });

  it('shield and release glow follow state', () => {
    const { bar, states } = make([view({ shield: true })]);
    expect(bar.element.className).toContain('shielded');
    expect(textOf(bar.element)).toContain('hud.boss.shield');
    states.set('prior', view({ shield: false, releaseOpen: true }));
    bar.update();
    expect(bar.element.className).not.toContain('shielded');
    expect(bar.element.className).toContain('release');
    expect(textOf(bar.element)).toContain('hud.boss.release');
  });

  it('phase change redraws ticks and pips from state', () => {
    const { bar, states } = make([view()]);
    states.set('prior', view({ phases: 2, breaks: 3, phase: 2 }));
    bar.touched('prior');
    bar.update();
    expect(bar.element.children[1]!.children.slice(1)).toHaveLength(1);
    expect(bar.element.children[2]!.children.filter((p) => p.className.includes('pip-on'))).toHaveLength(3);
  });

  it('fades out 1.5 s after defeat and then hides', () => {
    const { bar, states } = make([view()]);
    states.set('prior', view({ outcome: 'defeated' }));
    bar.finished('prior');
    bar.update(0.75);
    expect(display(bar)).toBe('flex');
    expect(Number(bar.element.style.opacity)).toBeCloseTo(0.5, 1);
    bar.update(BOSS_FADE_SECONDS);
    expect(display(bar)).toBe('none');
  });

  it('boss.ended while hidden does not throw', () => {
    const { bar } = make();
    expect(() => {
      bar.finished('ghost');
      bar.update(2);
    }).not.toThrow();
    expect(display(bar)).toBe('none');
  });

  it('ended with the state already gone keeps the last snapshot while fading', () => {
    const { bar, states } = make([view()]);
    states.delete('prior');
    bar.finished('prior');
    bar.update(0.5);
    expect(display(bar)).toBe('flex');
    expect(textOf(bar.element)).toContain('boss.prior');
    bar.update(2);
    expect(display(bar)).toBe('none');
  });

  it('two bosses: shows the latest started, falls back to the remaining one', () => {
    const { bar, states } = make([view({ bossId: 'a', nameKey: 'boss.a' })]);
    states.set('b', view({ bossId: 'b', nameKey: 'boss.b' }));
    bar.started('b');
    bar.update();
    expect(bar.shown).toBe('b');
    states.delete('b');
    bar.finished('b');
    bar.update(0.1);
    expect(bar.shown).toBe('a'); // the unfinished one wins at once
    expect(textOf(bar.element)).toContain('boss.a');
  });

  it('a boss that starts again during its fade comes back at full opacity', () => {
    const { bar, states } = make([view()]);
    bar.finished('prior');
    states.set('prior', view());
    bar.started('prior');
    bar.update(0.1);
    expect(bar.element.style.opacity).toBe('1');
  });

  it('out-of-order: phase before started registers the boss', () => {
    const { bar, states } = make();
    states.set('prior', view());
    bar.touched('prior');
    bar.update();
    expect(display(bar)).toBe('flex');
    bar.started('prior');
    bar.update();
    expect(bar.shown).toBe('prior');
  });

  it('event for a boss the registry does not know is ignored', () => {
    const { bar } = make();
    bar.touched('nobody');
    bar.update();
    expect(display(bar)).toBe('none');
  });

  it('missing state service: nothing shown, nothing throws', () => {
    const { bar } = make([view()], false);
    bar.started('prior');
    bar.finished('prior');
    expect(() => bar.update(3)).not.toThrow();
    expect(display(bar)).toBe('none');
  });

  it('a throwing source is tolerated', () => {
    const bar = new BossBar(new StubDocument(), {
      active: () => {
        throw new Error('x');
      },
      state: () => {
        throw new Error('y');
      },
    });
    bar.started('x');
    expect(() => bar.update()).not.toThrow();
  });

  it('garbage numbers do not break the bar', () => {
    const { bar } = make([view({ health: NaN, maxHealth: 0, breaks: NaN, breaksPerPhase: Infinity, phases: NaN })]);
    expect(bar.element.children[1]!.children[0]!.style.width).toBe('0%');
  });
});

describe('BossBar visibility callback', () => {
  it('reports shown and hidden transitions once each, and survives a throwing listener', () => {
    const calls: boolean[] = [];
    let live: BossView | null = view();
    const bar = new BossBar(new StubDocument(), {
      active: () => (live ? ['prior'] : []),
      state: () => live,
      onVisible: (v) => {
        calls.push(v);
        throw new Error('listener');
      },
    });
    bar.update();
    bar.update();
    expect(calls).toEqual([true]);
    live = null;
    bar.finished('prior');
    bar.update(BOSS_FADE_SECONDS + 1);
    expect(calls[calls.length - 1]).toBe(false);
    bar.dispose();
  });
});
