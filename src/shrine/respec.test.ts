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

describe('RespecFlow dismissed dialog', () => {
  it('dialogClosed() frees the permit so the lectern works again', () => {
    const dialog: RespecDialog = { open: () => true };
    const t = make({ dialog });
    t.flow.interact();
    t.flow.dialogClosed();
    expect(t.permits.released).toBe(1);
    expect(t.flow.open).toBe(false);
    expect(t.flow.interact()).toBe('dialog');
    expect(t.permits.held).toBe(2);
  });
  it('dialogClosed() leaves the toast fallback alone', () => {
    const t = make();
    t.flow.interact();
    t.flow.dialogClosed();
    expect(t.flow.open).toBe(true);
  });
  it('a dialog that throws on open releases its permit and falls back', () => {
    const t = make({ dialog: { open: () => { throw new Error('x'); } } });
    expect(t.flow.interact()).toBe('armed');
    expect(t.permits.held).toBe(1);
    expect(t.permits.held - t.permits.released).toBe(1);
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

describe('RespecFlow class change (Phase B)', () => {
  function build(over: { chosen?: boolean; changeResult?: { ok: true } | { ok: false; reason: string }; modalOpens?: boolean; noClasses?: boolean } = {}) {
    const permits = { held: 0, released: 0 };
    const sources: string[] = [];
    const calls = { change: [] as string[], respec: 0 };
    const toasts: [string, unknown][] = [];
    let opts: Parameters<RespecDialog['open']>[0] | null = null;
    const dialog: RespecDialog = { open: (o) => ((opts = o), over.modalOpens ?? true) };
    const classes = {
      chosen: () => over.chosen ?? true,
      current: () => 'knight',
      changeQuote: (id: string) =>
        id === 'unknown' ? ({ ok: false, reason: 'unknown' } as const) : ({ ok: true, free: id === 'mage', gold: 125, canAfford: true } as const),
      change: (id: string) => {
        calls.change.push(id);
        return over.changeResult ?? { ok: true as const };
      },
    };
    const flow = new RespecFlow({
      progression: () => ({
        allowRespec: (s: string) => {
          sources.push(s);
          permits.held++;
          return () => void permits.released++;
        },
        respecQuote: () => ({ free: false, gold: 50, canAfford: true }),
        respec: () => (calls.respec++, { ok: true }),
      }),
      dialog: () => dialog,
      classes: over.noClasses ? undefined : () => classes,
      classIds: () => ['knight', 'warden', 'mage'],
      className: (id) => id.toUpperCase(),
      lit: () => true,
      inCombat: () => false,
      now: () => 0,
      distanceToLectern: () => 0,
      toast: (k, p) => void toasts.push([k, p]),
    });
    return { flow, permits, sources, calls, toasts, get opts() { return opts!; } };
  }

  it('offers no class options before a class is chosen', () => {
    const t = build({ chosen: false });
    t.flow.interact();
    expect(t.opts.options).toBeUndefined();
  });
  it('offers no class options when thread 12 has not merged', () => {
    const t = build({ noClasses: true });
    t.flow.interact();
    expect(t.opts.options).toBeUndefined();
  });
  it('lists the classes and quotes the highlighted one from classes.changeQuote', () => {
    const t = build();
    t.flow.interact();
    expect(t.opts.options).toEqual([
      { id: 'knight', label: 'KNIGHT' },
      { id: 'warden', label: 'WARDEN' },
      { id: 'mage', label: 'MAGE' },
    ]);
    expect(t.opts.quoteFor!('mage')).toEqual({ free: true, gold: 125, canAfford: true });
    expect(t.opts.quoteFor!('warden')).toEqual({ free: false, gold: 125, canAfford: true });
    expect(t.opts.quoteFor!('knight')).toEqual({ free: false, gold: 50, canAfford: true }); // the current class: a plain respec
    expect(t.opts.quoteFor!('unknown')).toEqual({ free: false, gold: 0, canAfford: false });
  });
  it('holds the lectern permit while open', () => {
    const t = build();
    t.flow.interact();
    expect(t.sources).toEqual(['lectern']);
    expect(t.permits.released).toBe(0);
  });
  it('confirming another class calls classes.change once, starts no respec of its own, and releases the permit', () => {
    const t = build();
    t.flow.interact();
    expect(t.opts.confirm('warden')).toEqual({ ok: true });
    expect(t.calls.change).toEqual(['warden']);
    expect(t.calls.respec).toBe(0);
    expect(t.permits.released).toBe(1);
    expect(t.toasts.at(-1)).toEqual(['shrine.class.done', { name: 'WARDEN' }]);
  });
  it('confirming the current class is a plain respec, and no id is too', () => {
    const t = build();
    t.flow.interact();
    t.opts.confirm('knight');
    expect(t.calls.respec).toBe(1);
    expect(t.calls.change).toEqual([]);
    const u = build();
    u.flow.interact();
    u.opts.confirm();
    expect(u.calls.respec).toBe(1);
  });
  it('a refused change reports the reason and still releases the permit', () => {
    const t = build({ changeResult: { ok: false, reason: 'no-gold' } });
    t.flow.interact();
    expect(t.opts.confirm('mage')).toEqual({ ok: false, reason: 'no-gold' });
    expect(t.toasts.at(-1)).toEqual(['shrine.respec.refused', { reason: 'no-gold' }]);
    expect(t.permits.released).toBe(1);
  });
  it('cancel changes nothing', () => {
    const t = build();
    t.flow.interact();
    t.opts.cancel();
    expect(t.calls.change).toEqual([]);
    expect(t.permits.released).toBe(1);
  });
  it('a confirm after cancel is closed and calls nothing', () => {
    const t = build();
    t.flow.interact();
    const { confirm, cancel } = t.opts;
    cancel();
    expect(confirm('warden')).toEqual({ ok: false, reason: 'closed' });
    expect(t.calls.change).toEqual([]);
  });
  it('when the modal will not open, the fallback is the plain respec toast, never a class change', () => {
    const t = build({ modalOpens: false });
    expect(t.flow.interact()).toBe('armed');
    expect(t.flow.interact()).toBe('done');
    expect(t.calls.change).toEqual([]);
    expect(t.calls.respec).toBe(1);
  });
});
