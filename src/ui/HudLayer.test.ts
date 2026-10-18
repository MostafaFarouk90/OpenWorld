import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEvents } from '../core/events';
import { InputContexts } from '../input/InputContexts';
import { HUD_SLOTS, HudLayer } from './HudLayer';
import type { HudWidget } from './HudLayer';

class FakeEl {
  children: FakeEl[] = [];
  parentNode: FakeEl | null = null;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  constructor(public tag = 'div') {}
  appendChild(c: FakeEl): FakeEl {
    c.remove();
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  removeChild(c: FakeEl): FakeEl {
    this.children = this.children.filter((x) => x !== c);
    c.parentNode = null;
    return c;
  }
  remove(): void {
    this.parentNode?.removeChild(this);
  }
}
const fakeDoc = { createElement: (t: string) => new FakeEl(t) as unknown as HTMLElement };
const el = (name = 'w') => Object.assign(new FakeEl(), { name }) as unknown as HTMLElement & FakeEl;
const widget = (id: string, extra: Partial<HudWidget> = {}): HudWidget => ({ id, element: el(id), ...extra });

function setup(withDom: boolean) {
  const contexts = new InputContexts();
  const events = new GameEvents();
  const modalEvents: unknown[] = [];
  events.on('ui.modal', (p) => modalEvents.push(p));
  const container = withDom ? (new FakeEl() as unknown as HTMLElement & FakeEl) : null;
  const exitPointerLock = vi.fn();
  const hud = new HudLayer(container, contexts, events, { doc: fakeDoc, exitPointerLock });
  const slotEl = (slot: string): FakeEl => {
    const root = container!.children[0];
    return root.children.find((c) => c.dataset.slot === slot)!;
  };
  return { contexts, events, modalEvents, container, exitPointerLock, hud, slotEl };
}

afterEach(() => vi.restoreAllMocks());

describe.each([['headless', false], ['with DOM', true]] as const)('HudLayer %s', (_n, dom) => {
  it('mounts and orders by order then mount order', () => {
    const { hud } = setup(dom);
    hud.mount('bottom-center', widget('c', { order: 10 }));
    hud.mount('bottom-center', widget('a'));
    hud.mount('bottom-center', widget('b', { order: 0 }));
    hud.mount('bottom-center', widget('d', { order: 10 }));
    expect(hud.mounted('bottom-center')).toEqual(['a', 'b', 'c', 'd']);
    expect(hud.mounted('top-left')).toEqual([]);
  });

  it('throws on duplicate id (even across slots) and unknown slot', () => {
    const { hud } = setup(dom);
    hud.mount('top-left', widget('x'));
    expect(() => hud.mount('top-right', widget('x'))).toThrow(/already mounted/);
    expect(() => hud.mount('nowhere' as never, widget('y'))).toThrow(/unknown slot/);
    expect(hud.mounted('top-right')).toEqual([]);
  });

  it('unmount disposes once, is idempotent, and frees the id', () => {
    const { hud } = setup(dom);
    const dispose = vi.fn();
    const off = hud.mount('toast', widget('t', { dispose }));
    off();
    off();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(hud.mounted('toast')).toEqual([]);
    expect(() => hud.mount('toast', widget('t'))).not.toThrow();
  });

  it('a throwing dispose is isolated', () => {
    const { hud } = setup(dom);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const off = hud.mount('toast', widget('t', { dispose: () => { throw new Error('x'); } }));
    expect(() => off()).not.toThrow();
    expect(err).toHaveBeenCalled();
  });

  it('modal: opens, pushes menu, exits pointer lock, emits, refuses a second', () => {
    const { hud, contexts, exitPointerLock, modalEvents } = setup(dom);
    const close = hud.openModal(widget('inv'))!;
    expect(close).toBeTypeOf('function');
    expect(hud.modalOpen).toBe('inv');
    expect(contexts.top()).toBe('menu');
    expect(contexts.owners()).toEqual(['modal:inv']);
    expect(exitPointerLock).toHaveBeenCalledTimes(1);
    expect(modalEvents).toEqual([{ id: 'inv', open: true }]);
    expect(hud.openModal(widget('map'))).toBeNull();
    expect(hud.modalOpen).toBe('inv');
  });

  it('modal close pops, disposes once, emits, is idempotent and allows a new modal', () => {
    const { hud, contexts, modalEvents } = setup(dom);
    const dispose = vi.fn();
    const close = hud.openModal(widget('inv', { dispose }))!;
    close();
    close();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(hud.modalOpen).toBeNull();
    expect(contexts.top()).toBe('gameplay');
    expect(modalEvents).toEqual([{ id: 'inv', open: true }, { id: 'inv', open: false }]);
    const close2 = hud.openModal(widget('map'))!;
    expect(close2).not.toBeNull();
    close(); // stale closer must not close the new modal
    expect(hud.modalOpen).toBe('map');
  });

  it('modal id may not collide with a mounted widget', () => {
    const { hud } = setup(dom);
    hud.mount('top-left', widget('same'));
    // a modal with the same id is allowed to open, but mounting the same id while it is open throws
    const close = hud.openModal(widget('m'))!;
    expect(() => hud.mount('top-left', widget('m'))).toThrow();
    close();
  });

  it('update calls every widget and the modal, isolating throws', () => {
    const { hud } = setup(dom);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = vi.fn();
    const b = vi.fn();
    const m = vi.fn();
    hud.mount('top-left', widget('bad', { update: () => { throw new Error('boom'); } }));
    hud.mount('top-right', widget('a', { update: a }));
    hud.mount('center', widget('b', { update: b }));
    hud.openModal(widget('mod', { update: m }));
    hud.update(0.5);
    expect(a).toHaveBeenCalledWith(0.5);
    expect(b).toHaveBeenCalledWith(0.5);
    expect(m).toHaveBeenCalledWith(0.5);
    expect(err).toHaveBeenCalledTimes(1);
  });

  it('dispose unmounts everything and closes the modal', () => {
    const { hud, contexts, modalEvents } = setup(dom);
    const d1 = vi.fn();
    const d2 = vi.fn();
    hud.mount('top-left', widget('a', { dispose: d1 }));
    hud.openModal(widget('m', { dispose: d2 }));
    hud.dispose();
    expect(d1).toHaveBeenCalledTimes(1);
    expect(d2).toHaveBeenCalledTimes(1);
    expect(hud.mounted('top-left')).toEqual([]);
    expect(hud.modalOpen).toBeNull();
    expect(contexts.top()).toBe('gameplay');
    expect(modalEvents.at(-1)).toEqual({ id: 'm', open: false });
    expect(() => hud.dispose()).not.toThrow();
  });

  it('setVisible does not throw and is reported', () => {
    const { hud } = setup(dom);
    hud.setVisible(false);
    expect(hud.isVisible).toBe(false);
    hud.setVisible(true);
    expect(hud.isVisible).toBe(true);
  });
});

describe('HudLayer DOM', () => {
  it('creates the slot divs once, positioned and click-through', () => {
    const { container, slotEl } = setup(true);
    expect(container!.children).toHaveLength(1);
    const root = container!.children[0];
    expect(root.children.map((c) => c.dataset.slot)).toEqual(['overlay', ...HUD_SLOTS.filter((x) => x !== 'overlay')]);
    expect(slotEl('bottom-center').style).toMatchObject({ position: 'absolute', display: 'flex', flexDirection: 'column', pointerEvents: 'none' });
    expect(root.style.pointerEvents).toBe('none');
  });

  it('places elements in slot order, including a late low-order widget', () => {
    const { hud, slotEl } = setup(true);
    const a = widget('a', { order: 10 });
    const b = widget('b');
    const c = widget('c', { order: 5 });
    hud.mount('top-left', a);
    hud.mount('top-left', b);
    hud.mount('top-left', c);
    expect(slotEl('top-left').children).toEqual([b.element, c.element, a.element]);
  });

  it('removes the element on unmount', () => {
    const { hud, slotEl } = setup(true);
    const w = widget('a');
    const off = hud.mount('top-left', w);
    expect(slotEl('top-left').children).toEqual([w.element]);
    off();
    expect(slotEl('top-left').children).toEqual([]);
  });

  it('modal sits in a full-screen container with pointer events, removed on close', () => {
    const { hud, container, slotEl } = setup(true);
    const w = widget('m');
    const close = hud.openModal(w)!;
    const root = container!.children[0];
    const modalEl = root.children[root.children.length - 1];
    expect(modalEl.style).toMatchObject({ pointerEvents: 'auto', position: 'absolute' });
    expect(modalEl.children).toEqual([w.element]);
    hud.setVisible(false);
    expect(root.children.filter((c) => c.style.display === 'none')).toHaveLength(HUD_SLOTS.length - 1);
    expect(modalEl.style.display).toBe('flex');
    close();
    expect(root.children).toHaveLength(HUD_SLOTS.length);
    expect(slotEl('overlay').style.display).not.toBe('none');
  });

  it('dispose removes the root from the container', () => {
    const { hud, container } = setup(true);
    hud.dispose();
    expect(container!.children).toHaveLength(0);
  });
});

describe('HudLayer headless', () => {
  it('has no DOM access at all', () => {
    const createElement = vi.fn();
    const hud = new HudLayer(null, new InputContexts(), new GameEvents(), { doc: { createElement } as never, exitPointerLock: () => {} });
    hud.mount('top-left', widget('a'));
    hud.openModal(widget('m'))!();
    hud.setVisible(false);
    hud.dispose();
    expect(createElement).not.toHaveBeenCalled();
  });

  it('default exitPointerLock is safe in Node', () => {
    const hud = new HudLayer(null, new InputContexts(), new GameEvents());
    expect(() => hud.openModal(widget('m'))).not.toThrow();
  });
});

describe('HudLayer overlay, fade and modal context', () => {
  it('overlay slot is first (below all others), full viewport, click-through, and is mountable', () => {
    const { container, hud, slotEl } = setup(true);
    const root = container!.children[0];
    expect(root.children[0].dataset.slot).toBe('overlay');
    expect(slotEl('overlay').style).toMatchObject({ inset: '0', position: 'absolute', pointerEvents: 'none' });
    const w = widget('ov');
    hud.mount('overlay', w);
    expect(hud.mounted('overlay')).toEqual(['ov']);
    expect(slotEl('overlay').children).toContain(w.element);
  });

  it('headless fade records the clamped target and resolves immediately', async () => {
    const { hud } = setup(false);
    expect(hud.fadeOpacity).toBe(0);
    await hud.fade(0.5, 10);
    expect(hud.fadeOpacity).toBe(0.5);
    await hud.fade(5, 1);
    expect(hud.fadeOpacity).toBe(1);
    await hud.fade(-3, 0);
    expect(hud.fadeOpacity).toBe(0);
    await hud.fade(Number.NaN, 1);
    expect(hud.fadeOpacity).toBe(0);
  });

  it('zero seconds sets the DOM opacity at once', async () => {
    const { hud, slotEl } = setup(true);
    await hud.fade(1, 0);
    expect(hud.fadeOpacity).toBe(1);
    expect(slotEl('overlay').children[0].style).toMatchObject({ opacity: '1', pointerEvents: 'none', background: '#000' });
  });

  it('animates with requestAnimationFrame, and a new fade cancels the old (its promise resolves)', async () => {
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const cbs: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cbs.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { hud, slotEl } = setup(true);
    let first = false;
    void hud.fade(1, 1).then(() => (first = true));
    t = 500;
    cbs.shift()!();
    expect(hud.fadeOpacity).toBeCloseTo(0.5);
    expect(slotEl('overlay').children[0].style.opacity).toBe('0.5');
    let second = false;
    void hud.fade(0, 1).then(() => (second = true));
    await Promise.resolve();
    expect(first).toBe(true);
    expect(second).toBe(false);
    t = 1500;
    cbs.pop()!();
    await Promise.resolve();
    expect(hud.fadeOpacity).toBe(0);
    expect(second).toBe(true);
    vi.unstubAllGlobals();
  });

  it('falls back to setTimeout steps without requestAnimationFrame', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', undefined);
    const { hud } = setup(true);
    let done = false;
    void hud.fade(1, 0.1).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(50);
    expect(hud.fadeOpacity).toBeGreaterThan(0);
    expect(hud.fadeOpacity).toBeLessThan(1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(hud.fadeOpacity).toBe(1);
    expect(done).toBe(true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('dispose resolves a running fade', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', undefined);
    const { hud } = setup(true);
    let done = false;
    void hud.fade(1, 5).then(() => (done = true));
    hud.dispose();
    await Promise.resolve();
    expect(done).toBe(true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('openModal defaults to the menu context; dialogue pushes dialogue and still exits pointer lock', () => {
    const a = setup(false);
    const closeA = a.hud.openModal(widget('m'))!;
    expect(a.contexts.top()).toBe('menu');
    closeA();
    const b = setup(false);
    const close = b.hud.openModal(widget('d'), { context: 'dialogue' })!;
    expect(b.contexts.top()).toBe('dialogue');
    expect(b.exitPointerLock).toHaveBeenCalledTimes(1);
    expect(b.hud.modalOpen).toBe('d');
    expect(b.modalEvents).toEqual([{ id: 'd', open: true }]);
    expect(b.hud.openModal(widget('x'), { context: 'dialogue' })).toBeNull();
    close();
    expect(b.contexts.top()).toBe('gameplay');
    expect(b.modalEvents[1]).toEqual({ id: 'd', open: false });
  });
});
