import { describe, expect, it, vi } from 'vitest';
import type { ClassId, ClassResult, ClassesService } from '../actors/classes';
import { StubDocument, textOf, type ElementLike, type StubElement } from '../hud/dom';
import type { RespecModalRequest, RespecModalService } from '../hud/RespecModal';
import type { ProgressionService } from '../hud/ports';
import { TrainerDesk } from './TrainerDesk';
import { trainerLines } from './TrainerMenu';
import type { ChangeQuote, ClassKit, DrillOutcome, DrillState } from './types';

interface FakeClasses extends ClassesService {
  s: { chosen: boolean; current: ClassId; quote: ChangeQuote; drill: DrillState | null; outcome: DrillOutcome | null; result: ClassResult; startOk: boolean };
}

function fakeClasses(over: Partial<FakeClasses['s']> = {}): FakeClasses {
  const s: FakeClasses['s'] = {
    chosen: false,
    current: 'knight',
    quote: { ok: true, free: true, gold: 0, canAfford: true },
    drill: null,
    outcome: null,
    result: { ok: true },
    startOk: true,
    ...over,
  };
  const c = {
    s,
    current: () => s.current,
    chosen: () => s.chosen,
    choose: vi.fn(() => s.result),
    change: vi.fn(() => s.result),
    available: () => true,
    kit: (id: ClassId) => ({ nameKey: `kit.${id}` }) as unknown as ClassKit,
    registerKit: vi.fn(),
    changeQuote: vi.fn(() => s.quote),
    drill: () => s.drill,
    startDrill: vi.fn(() => s.startOk),
    skipDrill: vi.fn(() => true),
    drillOutcome: () => s.outcome,
  };
  return c as unknown as FakeClasses;
}

function make(classOver: Partial<FakeClasses['s']> = {}, opts: { modal?: 'none' | 'refuse' | 'ok' | 'blocked' } = {}) {
  const classes = fakeClasses(classOver);
  const permits = { held: 0, total: 0 };
  const quote = { free: false, gold: 75, canAfford: true };
  const respec = vi.fn(() => ({ ok: true, refunded: 1, cost: 75 }) as { ok: boolean; reason?: string });
  const progression = {
    allowRespec: vi.fn(() => {
      permits.held++;
      permits.total++;
      let live = true;
      return () => {
        if (live) permits.held--;
        live = false;
      };
    }),
    respecQuote: vi.fn(() => quote),
    respec,
  } as unknown as ProgressionService;
  let widget: { id: string; element: ElementLike; dispose?(): void } | null = null;
  let blocked = opts.modal === 'blocked';
  const closes = vi.fn();
  const openModal = vi.fn((w: { id: string; element: ElementLike; dispose?(): void }) => {
    if (blocked) return null;
    widget = w;
    return () => {
      closes();
      if (widget === w) widget = null;
    };
  });
  let request: RespecModalRequest | null = null;
  const respecModal: RespecModalService = { open: vi.fn((r) => { if (opts.modal === 'refuse') return false; request = r; return true; }) };
  const toast = vi.fn();
  const desk = new TrainerDesk({
    classes,
    progression: () => progression,
    respecModal: () => (opts.modal === 'none' ? undefined : respecModal),
    openModal,
    doc: () => new StubDocument(),
    t: (k, p) => (p ? `${k}${JSON.stringify(p)}` : k),
    toast,
  });
  const buttons = (): StubElement[] => {
    const out: StubElement[] = [];
    const walk = (e: ElementLike): void => {
      if ((e as StubElement).tag === 'button') out.push(e as StubElement);
      e.children.forEach(walk);
    };
    if (widget) walk(widget.element);
    return out;
  };
  const press = (option: string): void => {
    const b = buttons().find((x) => x.className.includes(`owg-trainer-${option}`));
    if (!b) throw new Error(`no ${option} button`);
    b.click();
  };
  return {
    desk, classes, permits, progression, openModal, closes, toast, respecModal, respec, buttons, press,
    widget: () => widget,
    request: () => request,
    unblock: () => { blocked = false; },
  };
}

describe('TrainerDesk permit', () => {
  it('open takes a permit and close releases it', () => {
    const t = make();
    expect(t.desk.open('warden', 'classes.trainer.stane')).toBe(true);
    expect(t.desk.openFor).toBe('warden');
    expect(t.permits.held).toBe(1);
    expect(t.desk.holdsPermit).toBe(true);
    expect(t.desk.open('ashblade', 'x')).toBe(false);
    expect(t.permits.held).toBe(1);
    t.desk.close();
    expect(t.permits.held).toBe(0);
    expect(t.closes).toHaveBeenCalledTimes(1);
    expect(t.desk.openFor).toBeNull();
    expect(t.desk.holdsPermit).toBe(false);
  });

  it('a modal that cannot open leaves no permit', () => {
    const t = make({}, { modal: 'blocked' });
    expect(t.desk.open('warden', 'x')).toBe(false);
    expect(t.permits.held).toBe(0);
    expect(t.desk.openFor).toBeNull();
  });

  it("the modal's dispose from outside releases the permit", () => {
    const t = make();
    t.desk.open('warden', 'x');
    t.widget()!.dispose!();
    expect(t.permits.held).toBe(0);
    expect(t.desk.openFor).toBeNull();
    expect(t.closes).not.toHaveBeenCalled();
    t.desk.close();
    expect(t.permits.held).toBe(0);
  });

  it('closeAll releases the menu permit and a pending reset permit', () => {
    const t = make({ chosen: true, current: 'warden' });
    t.desk.open('warden', 'x');
    t.press('reset');
    expect(t.permits.held).toBe(1);
    expect(t.desk.holdsPermit).toBe(true);
    t.desk.open('warden', 'x');
    expect(t.permits.held).toBe(2);
    t.desk.closeAll();
    expect(t.permits.held).toBe(0);
    expect(t.desk.holdsPermit).toBe(false);
  });
});

describe('TrainerDesk picks', () => {
  it('choose closes the menu on success', () => {
    const t = make();
    t.desk.open('warden', 'x');
    t.press('choose');
    expect(t.classes.choose).toHaveBeenCalledWith('warden');
    expect(t.desk.openFor).toBeNull();
    expect(t.permits.held).toBe(0);
    expect(t.toast).not.toHaveBeenCalled();
  });

  it('a refused choose toasts the refusal key and keeps the menu (re-rendered, permit held)', () => {
    const t = make({ result: { ok: false, reason: 'no-permit' } });
    t.desk.open('warden', 'x');
    t.press('choose');
    expect(t.toast).toHaveBeenCalledWith('classes.refused.no-permit');
    expect(t.desk.openFor).toBe('warden');
    expect(t.openModal).toHaveBeenCalledTimes(2);
    expect(t.permits.held).toBe(1);
    expect(t.permits.total).toBe(1);
  });

  it('closing after a refusal releases the permit', () => {
    const t = make({ result: { ok: false, reason: 'combat' } });
    t.desk.open('warden', 'x');
    t.press('choose');
    expect(t.toast).toHaveBeenCalledWith('classes.refused.combat');
    t.desk.close();
    expect(t.permits.held).toBe(0);
  });

  it('change closes on success; drill, skip and close buttons', () => {
    const t = make({ chosen: true, current: 'knight' });
    t.desk.open('warden', 'x');
    t.press('change');
    expect(t.classes.change).toHaveBeenCalledWith('warden');
    expect(t.desk.openFor).toBeNull();

    const d = make({ chosen: true, current: 'warden', startOk: false });
    d.desk.open('warden', 'x');
    d.press('drill');
    expect(d.classes.startDrill).toHaveBeenCalled();
    expect(d.toast).toHaveBeenCalledWith('classes.refused.drill');
    expect(d.desk.openFor).toBeNull();

    const s = make({ chosen: true, current: 'warden', drill: { classId: 'warden', step: 0, steps: 2, textKey: 'k', progress: 0, required: 1 } });
    s.desk.open('warden', 'x');
    s.press('skip');
    expect(s.classes.skipDrill).toHaveBeenCalled();
    expect(s.desk.openFor).toBeNull();

    const c = make();
    c.desk.open('warden', 'x');
    c.press('close');
    expect(c.desk.openFor).toBeNull();
    expect(c.permits.held).toBe(0);
  });
});

describe('TrainerDesk reset', () => {
  it('closes the menu, opens the respec modal with the quote and a separate permit released on confirm', () => {
    const t = make({ chosen: true, current: 'warden' });
    t.desk.open('warden', 'x');
    t.press('reset');
    expect(t.desk.openFor).toBeNull();
    expect(t.permits.held).toBe(1);
    expect(t.respecModal.open).toHaveBeenCalledTimes(1);
    expect(t.request()!.quote).toEqual({ free: false, gold: 75, canAfford: true });
    t.request()!.confirm();
    expect(t.respec).toHaveBeenCalled();
    expect(t.permits.held).toBe(0);
    expect(t.desk.holdsPermit).toBe(false);
    expect(t.toast).not.toHaveBeenCalled();
  });

  it('releases the permit on cancel', () => {
    const t = make({ chosen: true, current: 'warden' });
    t.desk.open('warden', 'x');
    t.press('reset');
    t.request()!.cancel();
    expect(t.permits.held).toBe(0);
    expect(t.respec).not.toHaveBeenCalled();
  });

  it('a failed respec on confirm toasts its reason and still releases', () => {
    const t = make({ chosen: true, current: 'warden' });
    t.respec.mockReturnValueOnce({ ok: false, reason: 'no-gold' });
    t.desk.open('warden', 'x');
    t.press('reset');
    t.request()!.confirm();
    expect(t.toast).toHaveBeenCalledWith('classes.reset.no-gold');
    expect(t.permits.held).toBe(0);
  });

  it('a missing respec modal toasts and holds no permit', () => {
    const t = make({ chosen: true, current: 'warden' }, { modal: 'none' });
    t.desk.open('warden', 'x');
    t.press('reset');
    expect(t.toast).toHaveBeenCalledWith('classes.reset.unavailable');
    expect(t.permits.held).toBe(0);
    expect(t.desk.holdsPermit).toBe(false);
  });

  it('a respec modal that refuses to open toasts and releases', () => {
    const t = make({ chosen: true, current: 'warden' }, { modal: 'refuse' });
    t.desk.open('warden', 'x');
    t.press('reset');
    expect(t.toast).toHaveBeenCalledWith('classes.reset.unavailable');
    expect(t.permits.held).toBe(0);
  });
});

describe('trainerLines', () => {
  const opts = (c: ClassesService, id: ClassId) => trainerLines(c, id).map((l) => l.option);

  it('offers choose before a class is chosen', () => {
    const c = fakeClasses();
    expect(trainerLines(c, 'warden')).toEqual([
      { option: 'choose', textKey: 'classes.menu.choose', params: { classKey: 'kit.warden' } },
      { option: 'close', textKey: 'classes.menu.close' },
    ]);
  });

  it('offers change with the quote for another class, disabled when unaffordable', () => {
    const free = fakeClasses({ chosen: true });
    expect(trainerLines(free, 'warden')[0]).toEqual({ option: 'change', textKey: 'classes.menu.changeFree', params: { classKey: 'kit.warden', gold: 0 }, disabled: false });
    const paid = fakeClasses({ chosen: true, quote: { ok: true, free: false, gold: 75, canAfford: false } });
    expect(trainerLines(paid, 'warden')[0]).toEqual({ option: 'change', textKey: 'classes.menu.changeCost', params: { classKey: 'kit.warden', gold: 75 }, disabled: true });
    const refused = fakeClasses({ chosen: true, quote: { ok: false, reason: 'combat' } });
    expect(opts(refused, 'warden')).toEqual(['change', 'close']);
    expect(trainerLines(refused, 'warden')[0]).toEqual({ option: 'change', textKey: 'classes.refused.combat', disabled: true });
  });

  it('for the current class offers drill or replay, skip while running, and reset', () => {
    expect(opts(fakeClasses({ chosen: true, current: 'warden' }), 'warden')).toEqual(['drill', 'reset', 'close']);
    expect(trainerLines(fakeClasses({ chosen: true, current: 'warden' }), 'warden')[0].textKey).toBe('classes.menu.drill');
    const replay = fakeClasses({ chosen: true, current: 'warden', outcome: 'done' });
    expect(trainerLines(replay, 'warden')[0]).toMatchObject({ option: 'drill', textKey: 'classes.menu.replay' });
    const running = fakeClasses({ chosen: true, current: 'warden', drill: { classId: 'warden', step: 0, steps: 1, textKey: 'k', progress: 0, required: 1 } });
    expect(opts(running, 'warden')).toEqual(['skip', 'reset', 'close']);
  });

  it('the menu draws a button per line with the class name resolved and unaffordable changes disabled', () => {
    const t = make({ chosen: true, quote: { ok: true, free: false, gold: 75, canAfford: false } });
    t.desk.open('warden', 'classes.trainer.stane');
    const change = t.buttons().find((b) => b.className.includes('change'))!;
    expect((change as unknown as { disabled: boolean }).disabled).toBe(true);
    expect(textOf(t.widget()!.element)).toContain('classes.trainer.stane');
    expect(change.textContent).toContain('"class":"kit.warden"');
  });
});
