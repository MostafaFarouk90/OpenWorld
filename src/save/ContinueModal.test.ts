import { describe, expect, it, vi } from 'vitest';
import { createContinueModal } from './ContinueModal';
import { SAVE_STRINGS_EN } from './strings.en';

function fakeEl(tag = 'div'): any {
  const listeners = new Map<string, Set<(e: any) => void>>();
  const el: any = { tag, className: '', textContent: '', style: {}, children: [] as any[], removed: false, listeners };
  el.appendChild = (c: any) => el.children.push(c);
  el.remove = () => { el.removed = true; };
  el.addEventListener = (t: string, f: any) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f); };
  el.removeEventListener = (t: string, f: any) => { listeners.get(t)?.delete(f); };
  el.fire = (t: string, e: any = {}) => { for (const f of [...(listeners.get(t) ?? [])]) f(e); };
  el.focus = vi.fn();
  return el;
}

function make(over: Partial<Parameters<typeof createContinueModal>[0]> = {}) {
  const onContinue = vi.fn();
  const onNewGame = vi.fn();
  const w = createContinueModal({
    hasSave: true, storageUnavailable: false, saveProblem: null, onContinue, onNewGame,
    t: (k) => SAVE_STRINGS_EN[k] ?? k,
    doc: { createElement: (t: string) => fakeEl(t) } as any,
    ...over,
  });
  const el: any = w.element;
  const buttons = el.children.filter((c: any) => c.tag === 'button');
  const notices = el.children.filter((c: any) => c.tag === 'p');
  return { w, el, buttons, notices, onContinue, onNewGame };
}

describe('ContinueModal', () => {
  it('shows title and both buttons with a save', () => {
    const { w, el, buttons, notices } = make();
    expect(w.id).toBe('save.continue-modal');
    expect(el.children[0].textContent).toBe('Welcome back');
    expect(buttons.map((b: any) => b.textContent)).toEqual(['Continue', 'New Game']);
    expect(notices).toHaveLength(0);
  });

  it('hides Continue when there is no save', () => {
    const { buttons } = make({ hasSave: false });
    expect(buttons.map((b: any) => b.textContent)).toEqual(['New Game']);
  });

  it('shows notices for unavailable storage and save problems', () => {
    const a = make({ storageUnavailable: true, saveProblem: 'corrupt' });
    expect(a.notices.map((n: any) => n.textContent)).toEqual([
      SAVE_STRINGS_EN['save.unavailable.notice'], SAVE_STRINGS_EN['save.problem.corrupt'],
    ]);
    const b = make({ saveProblem: 'newer' });
    expect(b.notices.map((n: any) => n.textContent)).toEqual([SAVE_STRINGS_EN['save.problem.newer']]);
  });

  it('buttons call their handlers and a second activation is ignored', () => {
    const { buttons, onContinue, onNewGame } = make();
    buttons[0].fire('click');
    buttons[0].fire('click');
    buttons[1].fire('click');
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onNewGame).not.toHaveBeenCalled();
  });

  it('Enter activates Continue when present, else New Game', () => {
    const a = make();
    a.w.key('Enter');
    a.w.key('Enter');
    expect(a.onContinue).toHaveBeenCalledTimes(1);
    expect(a.onNewGame).not.toHaveBeenCalled();
    const b = make({ hasSave: false });
    b.el.fire('keydown', { code: 'Enter' });
    expect(b.onNewGame).toHaveBeenCalledTimes(1);
  });

  it('focusDefault focuses the first button; arrows move focus with wrap', () => {
    const { w, buttons } = make();
    w.focusDefault();
    expect(buttons[0].focus).toHaveBeenCalledTimes(1);
    w.key('ArrowDown');
    expect(buttons[1].focus).toHaveBeenCalledTimes(1);
    w.key('ArrowDown');
    expect(buttons[0].focus).toHaveBeenCalledTimes(2);
    w.key('ArrowUp');
    expect(buttons[1].focus).toHaveBeenCalledTimes(2);
  });

  it('dispose removes listeners', () => {
    const { w, el, buttons, onContinue } = make();
    w.dispose?.();
    expect(el.removed).toBe(true);
    expect(buttons[0].listeners.get('click').size).toBe(0);
    expect(el.listeners.get('keydown').size).toBe(0);
    buttons[0].fire('click');
    expect(onContinue).not.toHaveBeenCalled();
  });
});
