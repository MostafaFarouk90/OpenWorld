import { describe, expect, it, vi } from 'vitest';
import { createReplayMenu } from './ReplayMenu';

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

function make(drills = [{ id: 'a', labelKey: 'tutorial.drill.a' }, { id: 'b', labelKey: 'tutorial.drill.b' }]) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const w = createReplayMenu({ doc, t, drills, onPick, onClose });
  const buttons = (w.element as any).children.filter((c: any) => c.tag === 'button');
  return { w, buttons, onPick, onClose };
}

describe('ReplayMenu', () => {
  it('has one button per drill plus Close', () => {
    const { w, buttons } = make();
    expect(w.id).toBe('tutorial.replay');
    expect(buttons.map((b: any) => b.textContent)).toEqual([
      'T:tutorial.drill.a', 'T:tutorial.drill.b', 'T:tutorial.replay.close',
    ]);
  });

  it('picking a drill passes its id; Close calls onClose', () => {
    const { buttons, onPick, onClose } = make();
    buttons[1].fire('click');
    expect(onPick).toHaveBeenCalledWith('b');
    buttons[2].fire('click');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('with no drills only Close remains', () => {
    const { buttons } = make([]);
    expect(buttons).toHaveLength(1);
  });

  it('dispose detaches handlers and the element', () => {
    const { w, buttons, onClose } = make();
    w.dispose!();
    buttons[2].fire('click');
    expect(onClose).not.toHaveBeenCalled();
    expect((w.element as any).removed).toBe(true);
  });
});
