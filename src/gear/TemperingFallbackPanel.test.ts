import { describe, expect, it, vi } from 'vitest';
import { StubDocument, StubElement, type ElementLike } from '../hud/dom';
import { GEAR_STRINGS_EN } from './strings.en';
import { createTemperingSession, type ScreenHost } from './session';
import { createFallbackPanel } from './TemperingFallbackPanel';
import { PATTERNS } from './rhythm';
import { STEP, metronome, testInventory } from './testkit';

function rig(modalOpens = true) {
  const inv = testInventory({ 'practice-sword': 1 }, 100);
  const clock = { t: 0 };
  const session = createTemperingSession({
    inventory: inv,
    state: { anvilTiers: [], lessonRuns: 0 },
    now: () => clock.t,
    makeClock: () => metronome(),
    anvilUsable: () => true,
    smithUsable: () => true,
    lessonActive: () => false,
    emitTempered: () => {},
  });
  let root: ElementLike | null = null;
  const closer = vi.fn();
  const listeners = new Set<(e: { key?: string; repeat?: boolean }) => void>();
  const host: ScreenHost = {
    session,
    doc: new StubDocument(),
    openModal: (w) => {
      root = w.element;
      return modalOpens ? closer : null;
    },
    t: (k, p) => (GEAR_STRINGS_EN[k] ?? k).replace(/\{(\w+)\}/g, (_m, n) => String(p?.[n])),
    keys: { addEventListener: (_t, f) => listeners.add(f), removeEventListener: (_t, f) => listeners.delete(f) },
  };
  const buttons = (): StubElement[] => {
    const out: StubElement[] = [];
    const walk = (e: StubElement) => {
      if (e.tag === 'button') out.push(e);
      e.children.forEach((c) => walk(c as StubElement));
    };
    walk(root as unknown as StubElement);
    return out;
  };
  const press = (key: string, repeat = false) => listeners.forEach((f) => f({ key, repeat }));
  return { session, host, buttons, press, listeners, closer, clock, inv };
}

describe('TemperingFallbackPanel', () => {
  it('returns null and leaves no listener when another modal is open', () => {
    const t = rig(false);
    t.session.open('anvil');
    expect(createFallbackPanel(t.host)).toBeNull();
    expect(t.listeners.size).toBe(0);
  });

  it('drives a tempering with buttons and key 1', () => {
    const t = rig();
    t.session.open('anvil');
    const screen = createFallbackPanel(t.host)!;
    const labels = () => t.buttons().map((b) => b.textContent);
    expect(labels().some((l) => l?.includes('Practice'))).toBe(false);
    t.buttons()[0].click(); // the sword
    expect(t.session.view().selected).toBe('practice-sword');
    t.buttons().find((b) => b.textContent === 'Temper')!.click();
    expect(t.session.state).toBe('rhythm');
    for (const s of PATTERNS[1]) {
      t.clock.t = (4 + s) * STEP;
      t.press('1');
    }
    t.press('1', true); // auto-repeat is ignored
    t.press('2');
    expect(t.session.view().run?.judged).toEqual(['perfect', 'perfect', 'perfect', 'perfect']);
    t.clock.t = 20 * STEP;
    screen.update!();
    t.session.update();
    expect(t.session.state).toBe('affix-reveal');
    t.buttons().find((b) => b.textContent === 'Continue')!.click();
    t.buttons().find((b) => b.textContent === 'Continue')!.click();
    expect(t.session.state).toBe('picking');
    t.buttons().find((b) => b.textContent === 'Close')!.click();
    expect(t.session.state).toBe('idle');
    screen.dispose();
    expect(t.listeners.size).toBe(0);
    expect(t.closer).toHaveBeenCalled();
  });

  it('shows the Strike button during the run', () => {
    const t = rig();
    t.session.open('anvil');
    const screen = createFallbackPanel(t.host)!;
    t.session.select('practice-sword');
    t.session.start();
    t.clock.t = 4 * STEP;
    t.buttons().find((b) => b.textContent === 'Strike')!.click();
    expect(t.session.view().run?.judged[0]).toBe('perfect');
    screen.dispose();
  });
});
