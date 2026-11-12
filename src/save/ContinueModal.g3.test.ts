// G3 (New Game+): the boot modal's extra choices (a Second Hearth, the parked world) and their confirm step.
import { describe, expect, it, vi } from 'vitest';
import { createContinueModal } from './ContinueModal';
import { SAVE_STRINGS_EN } from './strings.en';

function fakeEl(tag = 'div'): any {
  const listeners = new Map<string, Set<(e: any) => void>>();
  const el: any = { tag, className: '', textContent: '', style: {}, children: [] as any[], parent: null, listeners };
  el.appendChild = (c: any) => {
    c.parent = el;
    el.children.push(c);
  };
  el.remove = () => {
    if (el.parent) el.parent.children = el.parent.children.filter((c: any) => c !== el);
    el.parent = null;
  };
  el.addEventListener = (t: string, f: any) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f); };
  el.removeEventListener = (t: string, f: any) => { listeners.get(t)?.delete(f); };
  el.fire = (t: string, e: any = {}) => { for (const f of [...(listeners.get(t) ?? [])]) f(e); };
  el.focus = vi.fn();
  return el;
}

const STR: Record<string, string> = { ...SAVE_STRINGS_EN, begin: 'Begin a Second Hearth', ret: 'Return', ask: 'Sure?' };

function make(extra: { id: string; labelKey: string; confirmKey?: string; onSelect(): void }[]) {
  const onContinue = vi.fn();
  const onNewGame = vi.fn();
  const w = createContinueModal({
    hasSave: true, storageUnavailable: false, saveProblem: null, onContinue, onNewGame, extra,
    t: (k) => STR[k] ?? k,
    doc: { createElement: (t: string) => fakeEl(t) } as any,
  });
  const el: any = w.element;
  const labels = () => el.children.filter((c: any) => c.tag === 'button').map((b: any) => b.textContent);
  const button = (label: string) => el.children.find((c: any) => c.tag === 'button' && c.textContent === label);
  return { w, el, labels, button, onContinue, onNewGame };
}

describe('ContinueModal extra choices (G3)', () => {
  it('lists them between Continue and New Game; one without a confirm runs at once', () => {
    const ret = vi.fn();
    const m = make([{ id: 'r', labelKey: 'ret', onSelect: ret }]);
    expect(m.labels()).toEqual(['Continue', 'Return', 'New Game']);
    m.button('Return').fire('click');
    expect(ret).toHaveBeenCalledOnce();
    m.button('Continue').fire('click');
    expect(m.onContinue).not.toHaveBeenCalled();
  });

  it('a confirm step: Cancel goes back to the choices, Confirm runs it once', () => {
    const begin = vi.fn();
    const m = make([{ id: 'b', labelKey: 'begin', confirmKey: 'ask', onSelect: begin }]);
    m.button('Begin a Second Hearth').fire('click');
    expect(begin).not.toHaveBeenCalled();
    expect(m.labels()).toEqual(['Confirm', 'Cancel']);
    expect(m.el.children.some((c: any) => c.tag === 'p' && c.textContent === 'Sure?')).toBe(true);
    m.button('Cancel').fire('click');
    expect(m.labels()).toEqual(['Continue', 'Begin a Second Hearth', 'New Game']);
    m.button('Begin a Second Hearth').fire('click');
    m.button('Confirm').fire('click');
    m.button('Confirm')?.fire('click');
    expect(begin).toHaveBeenCalledOnce();
  });

  it('keyboard: Enter on the focused confirm button confirms', () => {
    const begin = vi.fn();
    const m = make([{ id: 'b', labelKey: 'begin', confirmKey: 'ask', onSelect: begin }]);
    m.w.key('ArrowDown');
    m.w.key('Enter');
    expect(m.labels()).toEqual(['Confirm', 'Cancel']);
    m.w.key('Enter');
    expect(begin).toHaveBeenCalledOnce();
  });

  it('without extras the modal is as before', () => {
    const m = make([]);
    expect(m.labels()).toEqual(['Continue', 'New Game']);
  });
});
