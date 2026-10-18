import { describe, expect, it, vi } from 'vitest';
import { StubDocument, StubElement, textOf, type ElementLike } from './dom';
import { createRespecModal, type RespecQuote } from './RespecModal';

function setup(opts: { modalBusy?: boolean } = {}) {
  const listeners = new Set<(e: { code?: string }) => void>();
  const keys = {
    addEventListener: (_t: 'keydown', l: (e: { code?: string }) => void) => void listeners.add(l),
    removeEventListener: (_t: 'keydown', l: (e: { code?: string }) => void) => void listeners.delete(l),
  };
  const state = { el: null as ElementLike | null, closed: 0, opened: 0 };
  const svc = createRespecModal({
    doc: new StubDocument(),
    t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k),
    keys,
    openModal: (w) => {
      if (opts.modalBusy) return null;
      state.opened++;
      state.el = w.element;
      return () => {
        state.closed++;
        w.dispose?.();
      };
    },
  });
  const btn = (cls: string) => {
    const find = (e: ElementLike): ElementLike | null => (e.className.includes(cls) ? e : (e.children.map(find).find(Boolean) ?? null));
    return find(state.el!) as StubElement & { disabled: boolean };
  };
  const esc = () => [...listeners].forEach((l) => l({ code: 'Escape' }));
  const make = (quote: RespecQuote) => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    const ok = svc.open({ quote, confirm, cancel });
    return { confirm, cancel, ok };
  };
  return { svc, state, btn, esc, make, listeners };
}

describe('respecModal', () => {
  it('free quote: says first respec is free, confirm enabled, calls confirm once and closes', () => {
    const s = setup();
    const { confirm, cancel, ok } = s.make({ free: true, gold: 0, canAfford: true });
    expect(ok).toBe(true);
    expect(textOf(s.state.el!)).toContain('hud.respec.free');
    expect(s.btn('confirm').disabled).toBe(false);
    s.btn('confirm').click();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(s.state.closed).toBe(1);
    expect(s.listeners.size).toBe(0);
  });

  it('paid quote shows the gold cost', () => {
    const s = setup();
    s.make({ free: false, gold: 120, canAfford: true });
    expect(textOf(s.state.el!)).toContain('"gold":120');
  });

  it('cannot afford: confirm disabled and does nothing even if forced', () => {
    const s = setup();
    const { confirm } = s.make({ free: false, gold: 500, canAfford: false });
    expect(s.btn('confirm').disabled).toBe(true);
    expect(textOf(s.state.el!)).toContain('cannotAfford');
    s.btn('confirm').click();
    expect(confirm).not.toHaveBeenCalled();
    expect(s.state.closed).toBe(0);
  });

  it('double confirm calls the callback once', () => {
    const s = setup();
    const { confirm } = s.make({ free: true, gold: 0, canAfford: true });
    const b = s.btn('confirm');
    b.click();
    b.click();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(s.state.closed).toBe(1);
  });

  it('cancel button and Esc call cancel once', () => {
    const a = setup();
    const r1 = a.make({ free: true, gold: 0, canAfford: true });
    a.btn('cancel').click();
    a.btn('cancel').click();
    expect(r1.cancel).toHaveBeenCalledTimes(1);
    expect(a.state.closed).toBe(1);

    const b = setup();
    const r2 = b.make({ free: true, gold: 0, canAfford: true });
    b.esc();
    b.esc();
    expect(r2.cancel).toHaveBeenCalledTimes(1);
    expect(r2.confirm).not.toHaveBeenCalled();
    expect(b.listeners.size).toBe(0);
  });

  it('refuses a second open while showing, and reopens after closing', () => {
    const s = setup();
    s.make({ free: true, gold: 0, canAfford: true });
    expect(s.make({ free: true, gold: 0, canAfford: true }).ok).toBe(false);
    s.esc();
    expect(s.make({ free: true, gold: 0, canAfford: true }).ok).toBe(true);
  });

  it('returns false when another modal is open (openModal null)', () => {
    const s = setup({ modalBusy: true });
    const { ok, confirm, cancel } = s.make({ free: true, gold: 0, canAfford: true });
    expect(ok).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(s.listeners.size).toBe(0);
  });

  it('bad requests return false; a throwing callback does not leave the dialog stuck', () => {
    const s = setup();
    expect(s.svc.open({} as never)).toBe(false);
    const confirm = vi.fn(() => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    s.svc.open({ quote: { free: true, gold: 0, canAfford: true }, confirm, cancel: vi.fn() });
    expect(() => s.btn('confirm').click()).not.toThrow();
    expect(s.make({ free: true, gold: 0, canAfford: true }).ok).toBe(true);
  });
});
