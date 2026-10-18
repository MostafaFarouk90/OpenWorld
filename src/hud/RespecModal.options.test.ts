import { describe, expect, it, vi } from 'vitest';
import { StubDocument, StubElement, type ElementLike } from './dom';
import { createRespecModal, type RespecKeyEvent, type RespecOption, type RespecQuote } from './RespecModal';

const OPTS: RespecOption[] = [
  { id: 'knight', label: 'Knight' },
  { id: 'ranger', label: 'Ranger' },
  { id: 'mage', label: 'Mage' },
];
const FREE: RespecQuote = { free: true, canAfford: true };

function setup() {
  const listeners = new Set<(e: RespecKeyEvent) => void>();
  const keys = {
    addEventListener: (_t: 'keydown', l: (e: RespecKeyEvent) => void) => void listeners.add(l),
    removeEventListener: (_t: 'keydown', l: (e: RespecKeyEvent) => void) => void listeners.delete(l),
  };
  let el: ElementLike | null = null;
  const svc = createRespecModal({
    doc: new StubDocument(),
    t: (k) => k,
    keys,
    openModal: (w) => {
      el = w.element;
      return () => w.dispose?.();
    },
  });
  const all = (pred: (e: ElementLike) => boolean): StubElement[] => {
    const out: StubElement[] = [];
    const walk = (e: ElementLike): void => {
      if (pred(e)) out.push(e as StubElement);
      e.children.forEach(walk);
    };
    walk(el!);
    return out;
  };
  const radios = () => all((e) => e.getAttribute('role') === 'radio');
  const checked = () => radios().map((r) => r.getAttribute('aria-checked'));
  const key = (k: string) => [...listeners].forEach((l) => l({ key: k, code: k }));
  const confirmBtn = () => all((e) => e.className.includes('owg-respec-confirm'))[0]! as StubElement & { disabled: boolean };
  const cancelBtn = () => all((e) => e.className.includes('owg-respec-cancel'))[0]!;
  const open = (options?: RespecOption[], quote: RespecQuote = FREE) => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    const ok = svc.open({ quote, options, confirm, cancel });
    return { ok, confirm, cancel };
  };
  return { open, radios, checked, key, confirmBtn, cancelBtn, all, listeners };
}

describe('respecModal options', () => {
  it('absent options: no radio group and confirm() gets no argument', () => {
    const s = setup();
    const r = s.open(undefined);
    expect(s.radios()).toHaveLength(0);
    s.confirmBtn().click();
    expect(r.confirm).toHaveBeenCalledWith();
  });

  it('empty array behaves as absent', () => {
    const s = setup();
    const r = s.open([]);
    expect(s.radios()).toHaveLength(0);
    s.confirmBtn().click();
    expect(r.confirm).toHaveBeenCalledWith();
  });

  it('all-invalid entries behave as absent', () => {
    const s = setup();
    const r = s.open([{ id: '', label: 'x' }, { id: 'a', label: '' }, null as never]);
    expect(r.ok).toBe(true);
    expect(s.radios()).toHaveLength(0);
    s.confirmBtn().click();
    expect(r.confirm).toHaveBeenCalledWith();
  });

  it('renders an ARIA radiogroup with the first option selected; Confirm sends its id', () => {
    const s = setup();
    const r = s.open(OPTS);
    expect(s.all((e) => e.getAttribute('role') === 'radiogroup')).toHaveLength(1);
    expect(s.radios().map((x) => x.textContent)).toEqual(['Knight', 'Ranger', 'Mage']);
    expect(s.checked()).toEqual(['true', 'false', 'false']);
    s.confirmBtn().click();
    expect(r.confirm).toHaveBeenCalledWith('knight');
    expect(r.confirm).toHaveBeenCalledTimes(1);
  });

  it('drops entries with empty id or label, keeps the rest', () => {
    const s = setup();
    const r = s.open([{ id: '', label: 'a' }, { id: 'x', label: '' }, { id: 'ok', label: 'Okay' }]);
    expect(s.radios().map((x) => x.textContent)).toEqual(['Okay']);
    s.confirmBtn().click();
    expect(r.confirm).toHaveBeenCalledWith('ok');
  });

  it('duplicate ids reject the open and leave nothing listening, with a console warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = setup();
    const r = s.open([{ id: 'a', label: 'A' }, { id: 'a', label: 'Again' }]);
    expect(r.ok).toBe(false);
    expect(s.listeners.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('duplicate option id "a"'));
    expect(s.open(OPTS).ok).toBe(true); // not stuck
    warn.mockRestore();
  });

  it('arrow keys work when code is a Numpad code and key carries the arrow', () => {
    const s = setup();
    s.open(OPTS);
    const press = (e: RespecKeyEvent) => [...s.listeners].forEach((l) => l(e));
    press({ code: 'Numpad2', key: 'ArrowDown' });
    expect(s.checked()).toEqual(['false', 'true', 'false']);
    press({ code: 'Numpad8', key: 'ArrowUp' });
    expect(s.checked()).toEqual(['true', 'false', 'false']);
    press({ code: 'Numpad2', key: '2' }); // NumLock on: a digit, not an arrow
    expect(s.checked()).toEqual(['true', 'false', 'false']);
  });

  it('arrow keys move the selection and wrap both ways', () => {
    const s = setup();
    const r = s.open(OPTS);
    s.key('ArrowUp');
    expect(s.checked()).toEqual(['false', 'false', 'true']);
    s.key('ArrowDown');
    expect(s.checked()).toEqual(['true', 'false', 'false']);
    s.key('ArrowRight');
    s.key('ArrowRight');
    expect(s.checked()).toEqual(['false', 'false', 'true']);
    s.key('ArrowRight');
    expect(s.checked()).toEqual(['true', 'false', 'false']);
    s.key('ArrowLeft');
    expect(s.checked()).toEqual(['false', 'false', 'true']);
    s.key('KeyZ');
    expect(s.checked()).toEqual(['false', 'false', 'true']);
    s.confirmBtn().click();
    expect(r.confirm).toHaveBeenCalledWith('mage');
  });

  it('clicking a radio selects it', () => {
    const s = setup();
    const r = s.open(OPTS);
    s.radios()[1]!.click();
    expect(s.checked()).toEqual(['false', 'true', 'false']);
    s.confirmBtn().click();
    expect(r.confirm).toHaveBeenCalledWith('ranger');
  });

  it('arrow keys without options do nothing and do not throw', () => {
    const s = setup();
    const r = s.open();
    expect(() => s.key('ArrowDown')).not.toThrow();
    s.confirmBtn().click();
    expect(r.confirm).toHaveBeenCalledWith();
  });

  it('Confirm is disabled when unaffordable whatever is selected', () => {
    const s = setup();
    const r = s.open(OPTS, { free: false, gold: 500, canAfford: false });
    expect(s.confirmBtn().disabled).toBe(true);
    s.key('ArrowDown');
    s.confirmBtn().click();
    expect(s.confirmBtn().disabled).toBe(true);
    expect(r.confirm).not.toHaveBeenCalled();
  });

  it('cancel and Esc never confirm', () => {
    const a = setup();
    const r1 = a.open(OPTS);
    a.key('ArrowDown');
    a.cancelBtn().click();
    expect(r1.cancel).toHaveBeenCalledTimes(1);
    expect(r1.confirm).not.toHaveBeenCalled();

    const b = setup();
    const r2 = b.open(OPTS);
    b.key('Escape');
    expect(r2.cancel).toHaveBeenCalledTimes(1);
    expect(r2.confirm).not.toHaveBeenCalled();
  });

  it('double confirm calls confirm once', () => {
    const s = setup();
    const r = s.open(OPTS);
    s.confirmBtn().click();
    s.confirmBtn().click();
    expect(r.confirm).toHaveBeenCalledTimes(1);
  });
});
