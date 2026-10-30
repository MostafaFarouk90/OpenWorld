import { describe, expect, it } from 'vitest';
import { TRAVERSAL_STRINGS_EN } from '../../traversal/strings.en';
import type { BoardRefusal } from '../../traversal/ferry/FerryRides';
import { StubDocument, StubElement, textOf, type ElementLike } from '../dom';
import { FERRY_MENU_ID, createFerryMenu, refusalKey, type FerryMenuFerry, type MenuKeyEvent } from './FerryMenu';
import { ACT3_HUD_STRINGS_EN } from './strings.en';

const TEXT: Record<string, string> = { ...TRAVERSAL_STRINGS_EN, ...ACT3_HUD_STRINGS_EN };
const t = (k: string, p?: Record<string, string | number>) => (TEXT[k] ?? `?${k}`).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n]));
const STOPS: Record<string, string[]> = { reedgate: ['mere'], mere: ['reedgate', 'greywatch', 'mireweather'], greywatch: ['mere'], mireweather: ['mere'] };

function setup(opts: { refusals?: Record<string, BoardRefusal | null>; rideResult?: BoardRefusal | null; modalFree?: boolean; keys?: boolean } = {}) {
  const log: string[] = [];
  let modal: { element: ElementLike; dispose?(): void } | null = null;
  let modalFree = opts.modalFree ?? true;
  const refusals = { ...(opts.refusals ?? {}) };
  const state = { riding: false, rideResult: opts.rideResult ?? null };
  const ferry: FerryMenuFerry = {
    destinations: (s) => STOPS[s] ?? [],
    // The menu's own modal reads as `busy` to the real ferry, so the fake does the same while a modal is on top.
    refusal: (f, to) => refusals[`${f}>${to}`] ?? refusals[to] ?? (modal ? 'busy' : null),
    ride: (f, to) => {
      log.push(`ride ${f}>${to}${modal ? ' (modal still open)' : ''}`);
      if (state.rideResult) return state.rideResult;
      state.riding = true;
      return null;
    },
    get riding() {
      return state.riding;
    },
  };
  const listeners = new Set<(e: MenuKeyEvent) => void>();
  const keys = opts.keys === false ? null : {
    addEventListener: (_: 'keydown', l: (e: MenuKeyEvent) => void) => void listeners.add(l),
    removeEventListener: (_: 'keydown', l: (e: MenuKeyEvent) => void) => void listeners.delete(l),
  };
  let present: typeof ferry | undefined = ferry;
  const menu = createFerryMenu({
    doc: new StubDocument(),
    t,
    keys,
    ferry: () => present,
    stopName: (id) => t(`ferry.stop.${id}`),
    openModal: (w) => {
      if (!modalFree || modal) return null;
      expect(w.id).toBe(FERRY_MENU_ID);
      modal = w;
      return () => {
        const m = modal;
        modal = null;
        m?.dispose?.();
      };
    },
  });
  const buttons = (): StubElement[] => {
    const out: StubElement[] = [];
    const walk = (e: ElementLike): void => {
      if ((e as StubElement).tag === 'button') out.push(e as StubElement);
      e.children.forEach(walk);
    };
    if (modal) walk(modal.element);
    return out;
  };
  const press = (code: string) => [...listeners].forEach((l) => l({ code }));
  return {
    menu, log, state, refusals, listeners, ferry,
    get open() { return modal !== null; },
    get text() { return modal ? textOf(modal.element) : ''; },
    buttons,
    button: (label: string) => buttons().find((b) => b.textContent === label)!,
    press,
    disposeFromOutside: () => {
      const w = modal;
      modal = null;
      w?.dispose?.();
    },
    setModalFree: (v: boolean) => (modalFree = v),
    removeFerry: () => (present = undefined),
  };
}

describe('ferry stop menu', () => {
  it('lists both legs from the Mere with the stop names, and Cancel', () => {
    const m = setup();
    expect(m.menu.open('mere')).toBe(true);
    expect(m.open).toBe(true);
    expect(m.menu.active).toBe(true);
    expect(m.text).toContain("Ferry from Hathren's Mere");
    for (const d of ['Reedgate', 'the Greywatch posts', 'Mireweather Hut']) expect(m.text).toContain(`Ride to ${d}`);
    expect(m.button('Stay ashore')).toBeDefined();
  });

  it('opens at a one-route stop too (Cancel is the anti-strand path)', () => {
    const m = setup();
    expect(m.menu.open('reedgate')).toBe(true);
    expect(m.text).toContain("Ride to Hathren's Mere");
  });

  it('Cancel only closes: nothing boards and the keys are released', () => {
    const m = setup();
    m.menu.open('mere');
    expect(m.listeners.size).toBe(1);
    m.button('Stay ashore').click();
    expect(m.open).toBe(false);
    expect(m.menu.active).toBe(false);
    expect(m.state.riding).toBe(false);
    expect(m.log).toEqual([]);
    expect(m.listeners.size).toBe(0);
    // And it can be opened again.
    expect(m.menu.open('mere')).toBe(true);
  });

  it('Esc is Cancel', () => {
    const m = setup();
    m.menu.open('mere');
    m.press('Escape');
    expect(m.open).toBe(false);
    expect(m.state.riding).toBe(false);
    expect(m.log).toEqual([]);
  });

  it('choosing a leg rides that leg through ferry.ride (never the default), closes the menu first, then the menu is gone', () => {
    const m = setup();
    m.menu.open('mere');
    m.button('Ride to Mireweather Hut').click();
    expect(m.log).toEqual(['ride mere>mireweather']); // not "(modal still open)": the real ferry reads that as busy
    expect(m.open).toBe(false);
    expect(m.menu.active).toBe(false);
    expect(m.state.riding).toBe(true);
    expect(m.listeners.size).toBe(0);
  });

  it('no menu while riding or with no ferry service, no legs, or another modal on top', () => {
    const riding = setup();
    riding.state.riding = true;
    expect(riding.menu.open('mere')).toBe(false);
    expect(riding.open).toBe(false);
    const noFerry = setup();
    noFerry.removeFerry();
    expect(noFerry.menu.open('mere')).toBe(false);
    const noLegs = setup();
    expect(noLegs.menu.open('nowhere')).toBe(false);
    const busyModal = setup({ modalFree: false });
    expect(busyModal.menu.open('mere')).toBe(false);
    expect(busyModal.menu.active).toBe(false);
    expect(busyModal.listeners.size).toBe(0);
  });

  it('a second open while the menu is up is refused', () => {
    const m = setup();
    expect(m.menu.open('mere')).toBe(true);
    expect(m.menu.open('mere')).toBe(false);
    expect(m.menu.open('reedgate')).toBe(false);
  });

  describe('refused legs', () => {
    const REASONS: Array<[BoardRefusal, string]> = [
      ['noToken', 'Dudda keeps the ferry for those who carry his token.'],
      ['notRunning', 'The ferry is moored. Dudda will not run it without his horn.'],
      ['combat', 'Not while foes are near.'],
      ['hauling', 'Dudda will not take a sled or a load on the punt.'],
      ['noRoute', 'No ferry runs from here.'],
    ];
    for (const [reason, line] of REASONS) {
      it(`${reason}: a disabled button and its reason string, and choosing it does not ride`, () => {
        const m = setup({ refusals: { greywatch: reason } });
        m.menu.open('mere');
        const btn = m.button('Ride to the Greywatch posts');
        expect((btn as unknown as { disabled: boolean }).disabled).toBe(true);
        expect(m.text).toContain(line);
        btn.click();
        // The enabled legs still work.
        expect(m.log).toEqual([]);
        m.press('ArrowDown');
        m.press('Enter'); // greywatch is the second leg: one Down lands on it
        expect(m.log).toEqual([]);
        expect(m.open).toBe(true);
      });
    }

    it("busy from the ferry is the menu's own modal and is not shown; a ride that comes back busy re-opens the menu with the line", () => {
      const m = setup({ rideResult: 'busy' });
      m.menu.open('mere');
      expect(m.text).not.toContain('Not just now.');
      expect(m.button('Ride to Reedgate')).toBeDefined();
      m.button('Ride to Reedgate').click();
      expect(m.log).toEqual(['ride mere>reedgate']);
      expect(m.open).toBe(true);
      expect(m.text).toContain('Not just now.');
      expect(m.state.riding).toBe(false);
    });

    it('a refusal that arises after the menu opened keeps it open with the reason and does not ride', () => {
      const m = setup();
      m.menu.open('mere');
      m.refusals.reedgate = 'combat'; // a hostile came into range
      m.button('Ride to Reedgate').click();
      expect(m.log).toEqual([]);
      expect(m.open).toBe(true);
      expect(m.text).toContain('Not while foes are near.');
    });

    it('a ride refused at the moment of boarding reopens the menu with the reason', () => {
      const m = setup({ rideResult: 'combat' });
      m.menu.open('mere');
      m.button('Ride to Reedgate').click();
      expect(m.log).toEqual(['ride mere>reedgate']);
      expect(m.open).toBe(true);
      expect(m.text).toContain('Not while foes are near.');
      expect(m.menu.active).toBe(true);
      m.press('Escape');
      expect(m.open).toBe(false);
    });
  });

  it('every one of the six BoardRefusal values has its own string, and an unknown value falls back to the generic line', () => {
    const all: BoardRefusal[] = ['noToken', 'notRunning', 'combat', 'hauling', 'busy', 'noRoute'];
    const lines = all.map((r) => t(refusalKey(r)));
    expect(new Set(lines).size).toBe(6);
    for (const l of lines) expect(l.startsWith('?')).toBe(false);
    expect(t(refusalKey('somethingNew'))).toBe('The ferry cannot take you now.');
    expect(refusalKey(undefined)).toBe('act3.ferry.refused.generic');
    expect(refusalKey('toString')).toBe('act3.ferry.refused.generic');
  });

  it('keyboard: arrows move the highlight, Enter chooses, Tab wraps', () => {
    const m = setup();
    m.menu.open('mere');
    m.press('ArrowDown');
    m.press('Enter');
    expect(m.log).toEqual(['ride mere>greywatch']);
    const n = setup();
    n.menu.open('mere');
    n.press('ArrowUp'); // wraps to the last leg
    n.press('Enter');
    expect(n.log).toEqual(['ride mere>mireweather']);
    const k = setup();
    k.menu.open('mere');
    k.press('Tab');
    k.press('Tab');
    k.press('Tab'); // wraps to the first
    k.press('Enter');
    expect(k.log).toEqual(['ride mere>reedgate']);
  });

  it('a Numpad code falls back to the produced key; unrelated keys do nothing', () => {
    const m = setup();
    m.menu.open('mere');
    [...m.listeners].forEach((l) => l({ code: 'Numpad2', key: 'ArrowDown' }));
    m.press('KeyQ');
    expect(m.open).toBe(true);
    [...m.listeners].forEach((l) => l({ code: 'NumpadEnter' }));
    expect(m.log).toEqual(['ride mere>greywatch']);
  });

  it('closed from outside (the HUD tears the modal down): the keys are released and it can open again', () => {
    const m = setup();
    m.menu.open('mere');
    expect(m.listeners.size).toBe(1);
    m.disposeFromOutside();
    expect(m.listeners.size).toBe(0);
    expect(m.menu.active).toBe(false);
    expect(m.menu.open('mere')).toBe(true);
  });

  it('works without a key source (headless)', () => {
    const m = setup({ keys: false });
    expect(m.menu.open('mere')).toBe(true);
    m.button('Ride to Reedgate').click();
    expect(m.log).toEqual(['ride mere>reedgate']);
  });
});
