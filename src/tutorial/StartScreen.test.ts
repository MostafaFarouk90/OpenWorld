import { describe, expect, it, vi } from 'vitest';
import { createStartScreen } from './StartScreen';

function fakeEl(tag = "div"): any {
  const listeners = new Map<string, Set<(e: any) => void>>();
  const el: any = { tag, className: "", textContent: "", style: {}, children: [] as any[], removed: false, listeners };
  el.appendChild = (c: any) => el.children.push(c);
  el.remove = () => { el.removed = true; };
  el.addEventListener = (t: string, f: any) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f); };
  el.removeEventListener = (t: string, f: any) => { listeners.get(t)?.delete(f); };
  el.fire = (t: string, e: any = {}) => { for (const f of [...(listeners.get(t) ?? [])]) f(e); };
  return el;
}
const doc: any = { createElement: (t: string) => fakeEl(t) };
const t = (k: string) => `T:${k}`;

function make(over: Partial<Parameters<typeof createStartScreen>[0]> = {}) {
  const onChoose = vi.fn();
  const onHints = vi.fn();
  const w = createStartScreen({ doc, t, canSkipToKettlewick: true, hintsAlways: false, onChoose, onHints, ...over });
  const el: any = w.element;
  const buttons = el.children.filter((c: any) => c.tag === 'button');
  const box = el.children.find((c: any) => c.tag === 'label').children[0];
  return { w, el, buttons, box, onChoose, onHints };
}

describe('StartScreen', () => {
  it('has title, three buttons and a hints checkbox', () => {
    const { w, el, buttons, box } = make();
    expect(w.id).toBe('tutorial.start');
    expect(el.children[0].textContent).toBe('T:tutorial.start.title');
    expect(buttons.map((b: any) => b.textContent)).toEqual([
      'T:tutorial.start.begin', 'T:tutorial.start.veteran', 'T:tutorial.start.kettlewick',
    ]);
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);
  });

  it('omits Kettlewick when unavailable; checkbox reflects hintsAlways', () => {
    const { buttons, box } = make({ canSkipToKettlewick: false, hintsAlways: true });
    expect(buttons).toHaveLength(2);
    expect(box.checked).toBe(true);
  });

  it('each button maps to its mode', () => {
    for (const [i, mode] of ['full', 'veteran', 'kettlewick'].entries()) {
      const { buttons, onChoose } = make();
      buttons[i].fire('click');
      expect(onChoose).toHaveBeenCalledWith(mode);
    }
  });

  it('only the first choice counts', () => {
    const { buttons, onChoose } = make();
    buttons[0].fire('click');
    buttons[0].fire('click');
    buttons[1].fire('click');
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('checkbox change calls onHints with the new value, without choosing', () => {
    const { box, onHints, onChoose } = make();
    box.checked = true;
    box.fire('change');
    box.checked = false;
    box.fire('change');
    expect(onHints.mock.calls).toEqual([[true], [false]]);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('dispose removes listeners and the element', () => {
    const { w, buttons, onChoose } = make();
    w.dispose!();
    buttons[0].fire('click');
    expect(onChoose).not.toHaveBeenCalled();
    expect((w.element as any).removed).toBe(true);
  });
});
