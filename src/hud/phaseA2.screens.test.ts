import { describe, expect, it } from 'vitest';
import { PATTERNS } from '../gear/rhythm';
import { createTemperingSession, type GearState, type ScreenHost } from '../gear/session';
import { STEP, metronome, testInventory } from '../gear/testkit';
import { pickAffix } from '../gear/affixes';
import { StubDocument, textOf, type ElementLike, type StubElement } from './dom';
import { PressureBar, BELLOWS_PUZZLE_ID, PRESSURE_URGENT_SECONDS } from './PressureBar';
import { RHYTHM_STEPS, createTemperingScreen } from './TemperingScreen';
import { GEAR_STRINGS_EN } from '../gear/strings.en';
import { HUD_STRINGS_EN, formatHud } from './strings.en';

const STR: Record<string, string> = { ...HUD_STRINGS_EN, ...GEAR_STRINGS_EN };
const t = (k: string, p?: Record<string, string | number>) => (STR[k] ? formatHud(STR[k]!, p) : k);

describe('PressureBar', () => {
  function make() {
    const s = { clock: null as { remaining: number; total: number } | null, ids: undefined as string[] | undefined };
    const clocks: Record<string, { remaining: number; total: number } | null> = {};
    const b = new PressureBar(new StubDocument(), { pressure: (id) => (id === BELLOWS_PUZZLE_ID ? s.clock : (clocks[id] ?? null)), t });
    return { b, s, clocks };
  }

  it('is hidden with no clock', () => {
    const { b } = make();
    b.update();
    expect(b.element.style.display).toBe('none');
    expect(b.visible).toBe(false);
  });

  it('shows the service clock, counts down only when the service does, and flashes under 10 s', () => {
    const { b, s } = make();
    s.clock = { remaining: 45, total: 45 };
    b.update();
    expect(b.element.style.display).toBe('block');
    expect(textOf(b.element)).toContain('45 s');
    expect(b.element.children[1]!.children[0]!.style.width).toBe('100%');
    for (let i = 0; i < 600; i++) b.update(); // frames alone move nothing
    expect(textOf(b.element)).toContain('45 s');
    s.clock = { remaining: 22.5, total: 45 };
    b.update();
    expect(textOf(b.element)).toContain('23 s');
    expect(b.element.children[1]!.children[0]!.style.width).toBe('50%');
    expect(b.element.className).not.toContain('urgent');
    s.clock = { remaining: PRESSURE_URGENT_SECONDS, total: 45 };
    b.update();
    expect(b.element.className).toContain('urgent');
  });

  it('hides on puzzle.failed and solved and shows again on the next run', () => {
    const { b, s } = make();
    s.clock = { remaining: 30, total: 45 };
    b.update();
    b.stop(BELLOWS_PUZZLE_ID); // failed: the event can arrive before the clock reports null
    b.update();
    expect(b.visible).toBe(false);
    s.clock = null;
    b.update();
    s.clock = { remaining: 45, total: 45 }; // a new run
    b.update();
    expect(b.visible).toBe(true);
  });

  it('hides on every non-pressure phase and returns on the pressure phase', () => {
    const { b, s } = make();
    s.clock = { remaining: 30, total: 45 };
    b.update();
    for (const phase of ['idle', 'routing', 'lighting', 'solved', 'failed']) {
      b.state(BELLOWS_PUZZLE_ID, 'pressure');
      b.update();
      expect(b.visible).toBe(true);
      b.state(BELLOWS_PUZZLE_ID, phase);
      b.update();
      expect(b.visible, phase).toBe(false);
    }
    b.state(BELLOWS_PUZZLE_ID, 'pressure');
    b.update();
    expect(b.visible).toBe(true);
  });

  it('ignores other puzzle ids (the Slagmaw valves, a fixture) in events and in the service', () => {
    const { b, s, clocks } = make();
    clocks['some-other'] = { remaining: 10, total: 45 };
    b.update();
    expect(b.visible).toBe(false);
    s.clock = { remaining: 30, total: 45 };
    b.update();
    b.state('some-other', 'idle');
    b.stop('some-other');
    b.update();
    expect(b.visible).toBe(true);
  });

  it('a load hides it until a new run starts', () => {
    const { b, s } = make();
    s.clock = { remaining: 30, total: 45 };
    b.update();
    b.reset();
    b.update();
    expect(b.visible).toBe(false); // hidden until the clock stops and a new run starts
    s.clock = null;
    b.update();
    s.clock = { remaining: 45, total: 45 };
    b.update();
    expect(b.visible).toBe(true);
  });

  it('survives a throwing service, a zero total, NaN remaining and negative remaining', () => {
    const b = new PressureBar(new StubDocument(), { pressure: () => { throw new Error('x'); }, t });
    expect(() => b.update()).not.toThrow();
    const c = { v: { remaining: 5, total: 0 } as { remaining: number; total: number } };
    const b2 = new PressureBar(new StubDocument(), { pressure: () => c.v, t });
    b2.update();
    expect(b2.visible).toBe(false);
    c.v = { remaining: NaN, total: 45 };
    b2.update();
    expect(b2.visible).toBe(false);
    c.v = { remaining: -3, total: 45 };
    b2.update();
    expect(textOf(b2.element)).toContain('0 s');
  });
});

describe('TemperingScreen over A10\'s session', () => {
  function make(items: Record<string, number> = { 'practice-sword': 1 }, gold = 100, m14 = 'completed') {
    const inv = testInventory(items, gold);
    const state: GearState = { anvilTiers: [], lessonRuns: 0 };
    const clock = { t: 0 };
    const session = createTemperingSession({
      inventory: inv,
      state,
      now: () => clock.t,
      makeClock: () => metronome(),
      anvilUsable: () => ['active', 'completed'].includes(m14),
      smithUsable: () => m14 === 'completed',
      lessonActive: () => m14 === 'active',
      emitTempered: () => {},
    });
    const listeners = new Set<(e: { key?: string; code?: string; repeat?: boolean }) => void>();
    const modal = { open: false, closed: 0 };
    const host: ScreenHost = {
      session,
      doc: new StubDocument(),
      openModal: () => {
        if (modal.open) return null;
        modal.open = true;
        return () => {
          modal.open = false;
          modal.closed++;
        };
      },
      t,
      keys: { addEventListener: (_k, fn) => void listeners.add(fn), removeEventListener: (_k, fn) => void listeners.delete(fn) },
    };
    const screen = createTemperingScreen(host)!;
    return { session, inv, clock, listeners, modal, host, screen, press: (key: string) => listeners.forEach((f) => f({ key })) };
  }

  /** Re-creates the screen with a host that captures the element. */
  function makeWithElement(items?: Record<string, number>, gold?: number, m14?: string) {
    const base = make(items, gold, m14);
    base.screen.dispose();
    let el: ElementLike | null = null;
    const host: ScreenHost = { ...base.host, openModal: (w) => { el = w.element; return base.host.openModal(w); } };
    base.session.close();
    base.session.open('anvil');
    const screen = createTemperingScreen(host)!;
    return { ...base, screen, el: () => el!, buttons: () => allButtons(el!) };
  }

  const allButtons = (root: ElementLike): ElementLike[] => {
    const out: ElementLike[] = [];
    const walk = (e: ElementLike): void => {
      if ((e as StubElement).tag === 'button') out.push(e);
      e.children.forEach(walk);
    };
    walk(root);
    return out;
  };
  const clickText = (b: ElementLike[], text: string): void => {
    const el = b.find((x) => (x.textContent ?? '').includes(text));
    expect(el, text).toBeTruthy();
    (el as StubElement).click();
  };

  it('lists the held pieces with tier and level, and shows the cost for the chosen one', () => {
    const w = makeWithElement({ 'practice-sword': 1, 'halvard-steel-blade': 1 });
    expect(textOf(w.el())).toContain('tier 1');
    expect(textOf(w.el())).toContain('tier 2');
    clickText(w.buttons(), 'tier 2');
    expect(textOf(w.el())).toContain('Next:');
  });

  it('a refused temper shows the reason and the Temper button is off', () => {
    const w = makeWithElement({ 'practice-sword': 1 }, 0);
    clickText(w.buttons(), 'tier 1');
    expect(textOf(w.el())).toContain('You cannot afford that.');
    expect(w.buttons().find((b) => b.textContent === 'Temper')!.className).toContain('off');
  });

  it('a run: 16 cells, key 1 strikes on the session clock, frame redraws change nothing', () => {
    const w = makeWithElement();
    clickText(w.buttons(), 'tier 1');
    clickText(w.buttons(), 'Temper');
    expect(w.session.state).toBe('rhythm');
    const strip = () => {
      const find = (e: ElementLike): ElementLike | null => (e.className === 'owg-tempering-strip' ? e : e.children.map(find).find(Boolean) ?? null);
      return find(w.el())!;
    };
    expect(strip().children).toHaveLength(RHYTHM_STEPS);
    const first = PATTERNS[1][0]!;
    w.clock.t = (4 + first) * STEP;
    w.press('1');
    const judged = () => w.session.view().run!.judged[0];
    expect(judged()).toBe('perfect');
    for (let i = 0; i < 500; i++) w.screen.update!(); // a fast or slow HUD never moves a judgement
    expect(judged()).toBe('perfect');
    expect(strip().children[first]!.className).toContain('owg-tempering-perfect');
    // Another key and a repeat do nothing.
    w.press('2');
    w.listeners.forEach((f) => f({ key: '1', repeat: true }));
    expect(w.session.view().run!.strays).toBe(0);
  });

  it('a late hit is good, not perfect, whatever the redraw rate', () => {
    const w = makeWithElement();
    clickText(w.buttons(), 'tier 1');
    clickText(w.buttons(), 'Temper');
    w.clock.t = (4 + PATTERNS[1][0]!) * STEP + 80;
    for (let i = 0; i < 5; i++) w.screen.update!();
    w.press('1');
    expect(w.session.view().run!.judged[0]).toBe('good');
  });

  it('a perfect bar over a different affix offers keep or replace, and Keep leaves the old one', () => {
    const w = makeWithElement();
    const other = pickAffix('practice-sword', 2) === 'ember' ? 'gleam' : 'ember';
    w.inv.setTemper('practice-sword', 1, other);
    clickText(w.buttons(), 'tier 1');
    clickText(w.buttons(), 'Temper');
    for (const st of PATTERNS[1]) {
      w.clock.t = (4 + st) * STEP;
      w.press('1');
    }
    w.clock.t = (4 + 16) * STEP;
    w.session.update(); // the gear plugin's fixed tick finishes the run
    w.screen.update!();
    expect(w.session.state).toBe('affix-reveal');
    expect(textOf(w.el())).toContain('Keep');
    expect(textOf(w.el())).toContain('Replace with');
    clickText(w.buttons(), 'Keep');
    expect(w.inv.gear('practice-sword').affix).toBe(other);
    expect(w.inv.gear('practice-sword').temper).toBe(2);
  });

  it('closing mid-run takes nothing and closes the modal; disposing removes the key listener', () => {
    const w = makeWithElement();
    clickText(w.buttons(), 'tier 1');
    clickText(w.buttons(), 'Temper');
    const gold = w.inv.gold;
    clickText(w.buttons(), 'Close');
    expect(w.session.state).toBe('idle');
    expect(w.inv.gold).toBe(gold);
    expect(w.inv.gear('practice-sword').temper).toBe(0);
    w.screen.dispose();
    expect(w.listeners.size).toBe(0);
    expect(w.modal.closed).toBeGreaterThan(0);
  });

  it('returns null and leaves no listener when another modal is open', () => {
    const w = make();
    w.screen.dispose();
    w.modal.open = true;
    const second = createTemperingScreen(w.host);
    expect(second).toBeNull();
    expect(w.listeners.size).toBe(0);
  });

  it('with the station locked the session refuses to open, so no screen draws', () => {
    const w = make({ 'practice-sword': 1 }, 100, 'inactive');
    expect(w.session.open('anvil')).toBe(false);
  });
});
