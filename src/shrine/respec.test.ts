import { describe, expect, it, vi } from 'vitest';
import { RespecFlow, type RespecDialog, type RespecProgression, type RespecResult } from './respec';

function make(over: { dialog?: RespecDialog | undefined; progression?: Partial<RespecProgression> | undefined; lit?: boolean; combat?: boolean; noProgression?: boolean } = {}) {
  const permits = { held: 0, released: 0 };
  const respecImpl = vi.fn((): RespecResult => ({ ok: true }));
  const progression: Partial<RespecProgression> | undefined = over.noProgression
    ? undefined
    : (over.progression ?? {
        allowRespec: vi.fn(() => {
          permits.held++;
          return () => void permits.released++;
        }),
        respecQuote: vi.fn(() => ({ free: true, gold: 0, canAfford: true })),
        respec: respecImpl,
      });
  const s = { now: 0, dist: 0, lit: over.lit ?? true, combat: over.combat ?? false };
  const toasts: string[] = [];
  const flow = new RespecFlow({
    progression: () => progression,
    dialog: () => over.dialog,
    lit: () => s.lit,
    inCombat: () => s.combat,
    now: () => s.now,
    distanceToLectern: () => s.dist,
    toast: (k) => void toasts.push(k),
  });
  return { flow, s, permits, toasts, respecImpl };
}

describe('RespecFlow with the dialog', () => {
  function dialogFor() {
    let opts: Parameters<RespecDialog['open']>[0] | null = null;
    const dialog: RespecDialog = { open: vi.fn((o) => ((opts = o), true)) };
    return { dialog, get opts() { return opts!; } };
  }
  it('holds the permit while the dialog is open and hands it the quote', () => {
    const d = dialogFor();
    const t = make({ dialog: d.dialog });
    expect(t.flow.interact()).toBe('dialog');
    expect(t.permits.held).toBe(1);
    expect(t.permits.released).toBe(0);
    expect(d.opts.quote).toEqual({ free: true, gold: 0, canAfford: true });
    expect(t.toasts).toEqual([]);
  });
  it('confirm calls progression.respec once and releases the permit', () => {
    const d = dialogFor();
    const t = make({ dialog: d.dialog });
    t.flow.interact();
    expect(d.opts.confirm()).toEqual({ ok: true });
    expect(t.respecImpl).toHaveBeenCalledTimes(1);
    expect(t.permits.released).toBe(1);
    expect(t.flow.open).toBe(false);
  });
  it('cancel releases the permit and respecs nothing', () => {
    const d = dialogFor();
    const t = make({ dialog: d.dialog });
    t.flow.interact();
    d.opts.cancel();
    expect(t.permits.released).toBe(1);
    expect(t.respecImpl).not.toHaveBeenCalled();
  });
  it('a refused respec reports the reason and still releases the permit', () => {
    const d = dialogFor();
    const t = make({
      dialog: d.dialog,
      progression: { allowRespec: () => () => void 0, respecQuote: () => ({ free: true, gold: 0, canAfford: true }), respec: () => ({ ok: false, reason: 'combat' }) },
    });
    t.flow.interact();
    expect(d.opts.confirm()).toEqual({ ok: false, reason: 'combat' });
    expect(t.toasts).toContain('shrine.respec.refused');
    expect(t.flow.open).toBe(false);
  });
  it('a confirm after cancel does nothing', () => {
    const d = dialogFor();
    const t = make({ dialog: d.dialog });
    t.flow.interact();
    const { confirm, cancel } = d.opts;
    cancel();
    expect(confirm()).toEqual({ ok: false, reason: 'closed' });
    expect(t.respecImpl).not.toHaveBeenCalled();
  });
  it('a dialog that declines to open falls back to the toast and keeps one permit', () => {
    const t = make({ dialog: { open: () => false } });
    expect(t.flow.interact()).toBe('armed');
    expect(t.toasts).toEqual(['shrine.respec.confirmFree']);
    expect(t.permits.held).toBe(1);
  });
  it('a stray interact while the dialog is open neither confirms nor takes a second permit', () => {
    const d = dialogFor();
    const t = make({ dialog: d.dialog });
    t.flow.interact();
    expect(t.flow.interact()).toBe('dialog');
    expect(t.respecImpl).not.toHaveBeenCalled();
    expect(t.permits.held).toBe(1);
    expect(t.permits.released).toBe(0);
  });
  it('update() never closes an open dialog', () => {
    const d = dialogFor();
    const t = make({ dialog: d.dialog });
    t.flow.interact();
    t.s.now = 999;
    t.s.dist = 99;
    t.flow.update();
    expect(t.flow.open).toBe(true);
  });
});

describe('RespecFlow fallback (no dialog service)', () => {
  it('needs a second press within 4 s', () => {
    const t = make();
    expect(t.flow.interact()).toBe('armed');
    t.s.now = 3.9;
    expect(t.flow.interact()).toBe('done');
    expect(t.respecImpl).toHaveBeenCalledTimes(1);
    expect(t.permits.released).toBe(1);
  });
  it('a press after 4 s only re-arms', () => {
    const t = make();
    t.flow.interact();
    t.s.now = 4.5;
    expect(t.flow.interact()).toBe('armed');
    expect(t.respecImpl).not.toHaveBeenCalled();
  });
  it('lapses on the timer and drops the permit', () => {
    const t = make();
    t.flow.interact();
    t.s.now = 4.1;
    t.flow.update();
    expect(t.flow.open).toBe(false);
    expect(t.permits.released).toBe(1);
  });
  it('cancels when the player walks away', () => {
    const t = make();
    t.flow.interact();
    t.s.dist = 5;
    t.flow.update();
    expect(t.flow.open).toBe(false);
    expect(t.respecImpl).not.toHaveBeenCalled();
  });
  it('reports a progression refusal', () => {
    const t = make({
      progression: {
        allowRespec: () => () => {},
        respecQuote: () => ({ free: true, gold: 0, canAfford: true }),
        respec: () => ({ ok: false, reason: 'nothing' }),
      },
    });
    t.flow.interact();
    expect(t.flow.interact()).toBe('failed');
    expect(t.toasts).toContain('shrine.respec.refused');
  });
  it('shows the gold cost when it is not free', () => {
    const t = make({
      progression: { allowRespec: () => () => {}, respecQuote: () => ({ free: false, gold: 125, canAfford: true }), respec: () => ({ ok: true }) },
    });
    t.flow.interact();
    expect(t.toasts).toEqual(['shrine.respec.confirmCost']);
  });
});

describe('RespecFlow refusals', () => {
  it('does nothing at an unlit shrine', () => {
    const t = make({ lit: false });
    expect(t.flow.interact()).toBe('refused');
    expect(t.permits.held).toBe(0);
    expect(t.toasts).toEqual([]);
  });
  it('is refused in combat without taking a permit', () => {
    const t = make({ combat: true });
    expect(t.flow.interact()).toBe('refused');
    expect(t.permits.held).toBe(0);
    expect(t.toasts).toEqual(['shrine.respec.combat']);
  });
  it('says so when progression has no respec API yet', () => {
    expect(make({ noProgression: true }).flow.interact()).toBe('refused');
    const t = make({ progression: { respec: () => ({ ok: true }) } });
    expect(t.flow.interact()).toBe('refused');
    expect(t.toasts).toEqual(['shrine.respec.unavailable']);
  });
  it('close() is safe to call twice', () => {
    const t = make();
    t.flow.interact();
    t.flow.close();
    t.flow.close();
    expect(t.permits.released).toBe(1);
  });
});
