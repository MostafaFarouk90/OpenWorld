import { describe, expect, it } from 'vitest';
import { CompanionPortrait } from './CompanionPortrait';
import { StubDocument, textOf } from './dom';
import { PartyScreen, type PartyScreenOption } from './PartyScreen';
import { StructureBar, STRUCTURE_BAR_LINGER_SECONDS } from './StructureBar';
import { HUD_STRINGS_EN, formatHud } from './strings.en';

const t = (k: string, p?: Record<string, string | number>) => (HUD_STRINGS_EN[k] ? formatHud(HUD_STRINGS_EN[k]!, p) : `[[${k}]]`);

describe('CompanionPortrait with a party', () => {
  function make() {
    const s = {
      active: ['hrolf'] as string[],
      actors: { A_h: { health: 50, maxHealth: 100 }, A_a: { health: 20, maxHealth: 40 } } as Record<string, { health: number; maxHealth: number }>,
      info: { hrolf: { role: 'tank', rank: 2 }, aelfreda: { role: 'healer', rank: 1 } } as Record<string, { role?: string; rank?: number }>,
    };
    const p = new CompanionPortrait(new StubDocument(), {
      active: () => s.active,
      actorId: (id) => (id === 'hrolf' ? 'A_h' : id === 'aelfreda' ? 'A_a' : null),
      actor: (a) => s.actors[a],
      info: (id) => s.info[id],
      t,
    });
    return { p, s };
  }

  it('follows active(): a swap drops the benched companion without a left event', () => {
    const { p, s } = make();
    expect(textOf(p.element)).toContain('Hrolf');
    s.active = ['aelfreda'];
    p.reload(true);
    expect(p.count).toBe(1);
    expect(textOf(p.element)).toContain('Aelfreda');
    expect(textOf(p.element)).not.toContain('Hrolf');
  });

  it('two portraits with role and bond rank', () => {
    const { p, s } = make();
    s.active = ['hrolf', 'aelfreda'];
    p.reload(true);
    expect(p.count).toBe(2);
    const txt = textOf(p.element);
    expect(txt).toContain('Tank');
    expect(txt).toContain('Bond 2');
    expect(txt).toContain('Healer');
  });

  it('an aura pip survives a party refresh but not a load', () => {
    const { p, s } = make();
    p.aura('hrolf', true);
    s.active = ['hrolf', 'aelfreda'];
    p.reload(true);
    expect(p.element.children[0]!.children[0]!.children[1]!.className).toContain('aura-on');
    p.reload();
    expect(p.element.children[0]!.children[0]!.children[1]!.className).not.toContain('aura-on');
  });

  it('downed greys the row, stood restores it; unknown ids and missing info are safe', () => {
    const { p, s } = make();
    p.downed('hrolf', true);
    expect(textOf(p.element)).toContain('Down');
    expect(p.element.children[0]!.className).toContain('owg-companion-down');
    p.downed('hrolf', false);
    expect(p.element.children[0]!.className).not.toContain('down');
    expect(() => p.downed('nobody', true)).not.toThrow();
    delete s.info.hrolf;
    expect(() => p.reload(true)).not.toThrow();
    expect(textOf(p.element)).not.toContain('Tank');
  });

  it('a re-seated companion keeps the kneel state from the source', () => {
    const down = new Set(['hrolf']);
    const p = new CompanionPortrait(new StubDocument(), { active: () => ['hrolf'], actorId: () => 'A_h', actor: () => ({ health: 5, maxHealth: 10 }), isDowned: (id) => down.has(id), t });
    expect(textOf(p.element)).toContain('Down');
    down.clear();
    p.reload();
    expect(textOf(p.element)).not.toContain('Down');
  });

  it('Act 1 with Tobb only and no info shows just name and bar', () => {
    const p = new CompanionPortrait(new StubDocument(), { active: () => ['tobb'], actorId: () => 'a', actor: () => ({ health: 1, maxHealth: 2 }), t: (k) => (k === 'hud.companion.tobb' ? 'Tobb' : `[[${k}]]`) });
    expect(textOf(p.element)).toBe('Tobb');
  });
});

describe('StructureBar', () => {
  function make() {
    const actors: Record<string, { health: number; maxHealth: number }> = {
      'cinderford.barricade': { health: 400, maxHealth: 400 },
      'cinderford-raid.cart.1.1': { health: 600, maxHealth: 600 },
      'cinderford-raid.cart.2.1': { health: 600, maxHealth: 600 },
    };
    const kinds: Record<string, string> = { 'cinderford.barricade': 'barricade' };
    const b = new StructureBar(new StubDocument(), {
      actor: (id) => actors[id],
      structure: (id) => (actors[id] ? { kind: kinds[id] ?? 'cart', maxHealth: actors[id]!.maxHealth } : undefined),
      t,
    });
    return { b, actors };
  }
  const widths = (b: StructureBar) => b.element.children.map((r) => r.children[1]!.children[0]!.style.width);

  it('is hidden until a structure is announced', () => {
    const { b } = make();
    expect(b.element.style.display).toBe('none');
    b.damaged('cinderford.barricade', 400);
    expect(b.element.style.display).toBe('block');
    expect(b.count).toBe(1);
  });

  it('tracks structure.damaged from the actor, with max health from the actor not the first event', () => {
    const { b, actors } = make();
    b.waveStarted();
    b.damaged('cinderford.barricade', 400);
    b.damaged('cinderford-raid.cart.1.1', 600);
    actors['cinderford.barricade']!.health = 100;
    b.damaged('cinderford.barricade', 100);
    expect(widths(b)).toEqual(['25%', '100%']);
    expect(textOf(b.element)).toContain('Barricade');
    expect(textOf(b.element)).toContain('Brazier cart');
  });

  it('a restore without a damage event shows on the next update', () => {
    const { b, actors } = make();
    b.waveStarted();
    b.damaged('cinderford.barricade', 400);
    actors['cinderford.barricade']!.health = 0;
    b.update(0.1);
    expect(widths(b)).toEqual(['0%']);
    actors['cinderford.barricade']!.health = 400;
    b.update(0.1);
    expect(widths(b)).toEqual(['100%']);
  });

  it('destroyed removes a row; carts vanish on wave.started, waves.failed and wave.cleared', () => {
    const { b } = make();
    b.waveStarted();
    b.damaged('cinderford.barricade', 400);
    b.damaged('cinderford-raid.cart.1.1', 600);
    b.destroyed('cinderford-raid.cart.1.1');
    expect(b.count).toBe(1);
    b.damaged('cinderford-raid.cart.1.1', 600);
    b.reset();
    expect(b.count).toBe(1);
    b.damaged('cinderford-raid.cart.2.1', 600);
    b.waveStarted();
    expect(b.count).toBe(1);
    b.damaged('cinderford-raid.cart.2.1', 600);
    b.waveCleared();
    expect(b.count).toBe(1);
  });

  it('caps at four rows and orders the barricade first', () => {
    const actors: Record<string, { health: number; maxHealth: number }> = {};
    for (const id of ['b', 'x.cart.1.1', 'x.cart.1.2', 'x.cart.1.3', 'x.cart.1.4']) actors[id] = { health: 5, maxHealth: 5 };
    const b = new StructureBar(new StubDocument(), { actor: (id) => actors[id], t });
    for (const id of ['x.cart.1.1', 'x.cart.1.2', 'x.cart.1.3', 'x.cart.1.4', 'b']) b.damaged(id, 5);
    expect(b.count).toBe(4);
  });

  it('ignores an unknown structure with no max health, and bad health values', () => {
    const { b } = make();
    b.damaged('mystery', 10);
    expect(b.count).toBe(0);
    b.damaged('cinderford.barricade', NaN);
    expect(b.count).toBe(1);
    expect(() => b.update(NaN)).not.toThrow();
  });

  it('health above max clamps to a full bar', () => {
    const { b, actors } = make();
    b.damaged('cinderford.barricade', 400);
    actors['cinderford.barricade']!.health = 900;
    b.update(0);
    expect(widths(b)).toEqual(['100%']);
  });

  it('lingers after the wave and then hides; advances only on update(dt)', () => {
    const { b } = make();
    b.waveStarted();
    b.damaged('cinderford.barricade', 400);
    b.update(100);
    expect(b.element.style.display).toBe('block'); // a wave is running: stays
    b.waveCleared();
    b.update(STRUCTURE_BAR_LINGER_SECONDS - 1);
    expect(b.element.style.display).toBe('block');
    b.update(2);
    expect(b.element.style.display).toBe('none');
    b.damaged('cinderford.barricade', 300);
    expect(b.element.style.display).toBe('block');
  });

  it('a stop (no event) clears the bars when the poll sees no run', () => {
    const run = { on: true };
    const b = new StructureBar(new StubDocument(), { structure: () => ({ kind: 'barricade', maxHealth: 400 }), running: () => run.on, t });
    b.waveStarted();
    b.damaged('cinderford.barricade', 400);
    b.update(0.1);
    expect(b.count).toBe(1);
    run.on = false;
    b.update(0.1);
    expect(b.count).toBe(0);
    expect(b.element.style.display).toBe('none');
  });

  it('a load keeps what the resumed wave announced, in either listener order, and clears when no run exists', () => {
    const run = { on: true };
    const b = new StructureBar(new StubDocument(), { structure: () => ({ kind: 'barricade', maxHealth: 400 }), running: () => run.on, t });
    b.damaged('cinderford.barricade', 250); // director first
    b.loaded();
    b.update(0.1);
    expect(b.count).toBe(1);
    const c = new StructureBar(new StubDocument(), { structure: () => ({ kind: 'barricade', maxHealth: 400 }), running: () => run.on, t });
    c.loaded(); // hud first
    c.damaged('cinderford.barricade', 250);
    c.update(0.1);
    expect(c.count).toBe(1);
    run.on = false;
    c.update(0.1);
    expect(c.count).toBe(0);
  });

  it('a throwing running() poll is ignored', () => {
    const b = new StructureBar(new StubDocument(), { structure: () => ({ kind: 'cart', maxHealth: 600 }), running: () => { throw new Error('x'); }, t });
    b.damaged('x.cart.1.1', 600);
    expect(() => b.update(1)).not.toThrow();
    expect(b.count).toBe(1);
  });

  it('a load with the waves service reset clears everything', () => {
    const { b } = make();
    b.waveStarted();
    b.damaged('cinderford.barricade', 400);
    b.reset(true);
    expect(b.count).toBe(0);
    expect(b.element.style.display).toBe('none');
  });
});

describe('PartyScreen', () => {
  function make(over: { max?: number; can?: boolean; opts?: PartyScreenOption[]; change?: (ids: readonly string[]) => boolean } = {}) {
    const s = {
      can: over.can ?? true,
      max: over.max ?? 2,
      opts: over.opts ?? ([
        { id: 'hrolf', nameKey: 'companion.hrolf.name', role: 'tank', rank: 2, active: true },
        { id: 'aelfreda', nameKey: 'companion.aelfreda.name', role: 'healer', rank: 1, active: false },
      ] as PartyScreenOption[]),
      calls: [] as string[][],
      closed: 0,
    };
    const screen = new PartyScreen(new StubDocument(), {
      canChange: () => s.can,
      options: () => s.opts,
      maxActive: () => s.max,
      change: (ids) => {
        s.calls.push([...ids]);
        return over.change ? over.change(ids) : true;
      },
      close: () => { s.closed++; },
      t,
    });
    return { screen, s };
  }

  it('one joined companion (Act 1 Tobb only): one row, locked second seat note', () => {
    const { screen } = make({ max: 1, can: false, opts: [{ id: 'tobb', nameKey: 'hud.companion.tobb', role: 'support', rank: 1, active: true }] });
    expect(textOf(screen.element)).toContain('Tobb');
    expect(textOf(screen.element)).toContain('A second seat opens after The Houses Stand.');
  });

  it('no companion: an empty list does not throw', () => {
    const { screen } = make({ opts: [] });
    expect(screen.selectedIds).toEqual([]);
    expect(() => screen.apply()).not.toThrow();
  });

  it('read-only outside the window: toggles and apply refuse with a message', () => {
    const { screen, s } = make({ can: false });
    screen.toggle('aelfreda');
    expect(screen.selectedIds).toEqual(['hrolf']);
    screen.apply();
    expect(s.calls).toEqual([]);
    expect(textOf(screen.element)).toContain('only change at a waystone rest');
    expect(screen.canChange).toBe(false);
  });

  it('two seats: bring the second companion and set the party', () => {
    const { screen, s } = make();
    screen.toggle('aelfreda');
    expect(screen.selectedIds.sort()).toEqual(['aelfreda', 'hrolf']);
    screen.apply();
    expect(s.calls).toEqual([['hrolf', 'aelfreda']]);
    expect(textOf(screen.element)).toContain('The party is set.');
  });

  it('one seat: choosing another companion swaps, and the last member cannot be removed', () => {
    const { screen } = make({ max: 1 });
    screen.toggle('aelfreda');
    expect(screen.selectedIds).toEqual(['aelfreda']);
    screen.toggle('aelfreda');
    expect(screen.selectedIds).toEqual(['aelfreda']);
  });

  it('removing the last member says so; a stale success message clears when the window expires', () => {
    const { screen, s } = make();
    screen.toggle('hrolf');
    expect(textOf(screen.element)).toContain('Someone has to travel with you.');
    screen.toggle('aelfreda');
    screen.apply();
    expect(textOf(screen.element)).toContain('The party is set.');
    s.can = false;
    screen.update();
    expect(textOf(screen.element)).not.toContain('The party is set.');
    expect(textOf(screen.element)).toContain('Rest at a waystone');
  });

  it('a full party with more companions than seats refuses with a message', () => {
    const opts: PartyScreenOption[] = ['a', 'b', 'c'].map((id, i) => ({ id, nameKey: `n.${id}`, role: 'support', rank: 1, active: i < 2 }));
    const { screen } = make({ opts });
    screen.toggle('c');
    expect(screen.selectedIds).toEqual(['a', 'b']);
    expect(textOf(screen.element)).toContain('Every seat is taken');
  });

  it('a refused change resyncs from the service and says so', () => {
    const { screen, s } = make({ change: () => false });
    screen.toggle('aelfreda');
    screen.apply();
    expect(textOf(screen.element)).toContain('could not be done');
    expect(screen.selectedIds).toEqual(['hrolf']);
    expect(s.calls).toHaveLength(1);
  });

  it('the window expiring while open turns the controls off and resyncs', () => {
    const { screen, s } = make();
    screen.toggle('aelfreda');
    s.can = false;
    screen.update();
    expect(screen.canChange).toBe(false);
    expect(screen.selectedIds).toEqual(['hrolf']);
    screen.apply();
    expect(s.calls).toEqual([]);
  });

  it('a downed companion shows Down; a companion leaving drops its selection', () => {
    const s = { downed: new Set(['hrolf']) };
    const opts: PartyScreenOption[] = [{ id: 'hrolf', nameKey: 'companion.hrolf.name', role: 'tank', rank: 2, active: true }];
    const screen = new PartyScreen(new StubDocument(), { canChange: () => true, options: () => opts, maxActive: () => 2, change: () => true, downed: () => s.downed, close: () => {}, t });
    expect(textOf(screen.element)).toContain('Down');
    opts.length = 0;
    screen.update();
    expect(screen.selectedIds).toEqual([]);
  });

  it('survives throwing services and closes through close()', () => {
    const screen = new PartyScreen(new StubDocument(), {
      canChange: () => { throw new Error('x'); },
      options: () => { throw new Error('x'); },
      maxActive: () => { throw new Error('x'); },
      change: () => { throw new Error('x'); },
      close: () => {},
      t,
    });
    expect(() => { screen.update(); screen.apply(); screen.toggle('q'); }).not.toThrow();
  });
});
