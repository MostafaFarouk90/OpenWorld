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
    expect(root.children.map((c) => c.dataset.slot)).toEqual([...HUD_SLOTS]);
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
    const { hud, container } = setup(true);
    const w = widget('m');
    const close = hud.openModal(w)!;
    const root = container!.children[0];
    const modalEl = root.children[root.children.length - 1];
    expect(modalEl.style).toMatchObject({ pointerEvents: 'auto', position: 'absolute' });
    expect(modalEl.children).toEqual([w.element]);
    hud.setVisible(false);
    expect(root.children.filter((c) => c.style.display === 'none')).toHaveLength(HUD_SLOTS.length);
    expect(modalEl.style.display).toBe('flex');
    close();
    expect(root.children).toHaveLength(HUD_SLOTS.length);
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
