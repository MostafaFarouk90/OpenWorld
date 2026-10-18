import { describe, expect, it } from 'vitest';
import { SkipHold, createSkipWidget } from './SkipHold';

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

const base = { menuDown: false, menuPressed: false, beatActive: true, modalOpen: false, allowModal: false, dt: 0.1 };
const tk = (s: SkipHold, o: Partial<typeof base> = {}) => s.tick({ ...base, ...o });

/** Press then hold for `seconds` in 0.1 steps; returns how many ticks fired. */
function hold(s: SkipHold, seconds: number, o: Partial<typeof base> = {}): number {
  let fired = 0;
  const n = Math.round(seconds / 0.1);
  for (let i = 0; i < n; i++) if (tk(s, { menuDown: true, menuPressed: i === 0, ...o })) fired++;
  return fired;
}

describe('SkipHold', () => {
  it('does not fire at 1.4 s, fires once at 1.5 s', () => {
    const s = new SkipHold();
    expect(hold(s, 1.4)).toBe(0);
    expect(tk(s, { menuDown: true })).toBe(true);
    expect(tk(s, { menuDown: true })).toBe(false);
  });

  it('fires exactly once while held on, and again only after release and a new press', () => {
    const s = new SkipHold();
    expect(hold(s, 3)).toBe(1);
    tk(s);
    expect(hold(s, 1.5)).toBe(1);
  });

  it('release resets progress', () => {
    const s = new SkipHold();
    hold(s, 1);
    expect(s.progress).toBeCloseTo(1 / 1.5, 6);
    tk(s);
    expect(s.progress).toBe(0);
    expect(hold(s, 1.4)).toBe(0);
  });

  it('menuDown without a fresh press does not start a hold', () => {
    const s = new SkipHold();
    for (let i = 0; i < 30; i++) expect(tk(s, { menuDown: true })).toBe(false);
    expect(s.progress).toBe(0);
  });

  it('a pointer-lock drop starts a hold that counts through the 0.5 s grace with the key invisible', () => {
    const s = new SkipHold();
    tk(s);
    s.onPointerLockChange(false);
    for (let i = 0; i < 5; i++) tk(s);
    expect(s.progress).toBeGreaterThan(0.3);
    // Key becomes visible and stays down: completes.
    let fired = false;
    for (let i = 0; i < 10; i++) fired = tk(s, { menuDown: true }) || fired;
    expect(fired).toBe(true);
  });

  it('after the grace the hold needs menuDown', () => {
    const s = new SkipHold();
    tk(s);
    s.onPointerLockChange(false);
    for (let i = 0; i < 7; i++) expect(tk(s)).toBe(false);
    expect(s.progress).toBe(0);
    expect(hold(s, 0.5)).toBe(0);
  });

  it('pointer lock acquired, or dropped with no beat, starts nothing', () => {
    const s = new SkipHold();
    tk(s);
    s.onPointerLockChange(true);
    expect(s.progress).toBe(0);
    const idle = new SkipHold();
    tk(idle, { beatActive: false });
    idle.onPointerLockChange(false);
    tk(idle, { beatActive: false });
    expect(idle.hintVisible).toBe(false);
    expect(idle.progress).toBe(0);
  });

  it('a hold that starts under a modal that disallows skipping is ignored until release', () => {
    const s = new SkipHold();
    expect(hold(s, 3, { modalOpen: true })).toBe(0);
    // Modal closed but Esc still down: still ignored.
    expect(hold(s, 3)).toBe(0);
    tk(s);
    expect(hold(s, 1.5)).toBe(1);
  });

  it('allowModal lets a modal hold fire', () => {
    const s = new SkipHold();
    expect(hold(s, 1.5, { modalOpen: true, allowModal: true })).toBe(1);
  });

  it('a modal opening mid-hold cancels it', () => {
    const s = new SkipHold();
    hold(s, 1);
    expect(tk(s, { menuDown: true, modalOpen: true })).toBe(false);
    expect(s.progress).toBe(0);
    expect(hold(s, 2)).toBe(0);
  });

  it('beatActive false resets', () => {
    const s = new SkipHold();
    hold(s, 1);
    tk(s, { menuDown: true, beatActive: false });
    expect(s.progress).toBe(0);
    expect(hold(s, 1.4)).toBe(0);
  });

  it('hint shows for 3 s after a pointer-lock drop during a beat', () => {
    const s = new SkipHold();
    tk(s);
    expect(s.hintVisible).toBe(false);
    s.onPointerLockChange(false);
    expect(s.hintVisible).toBe(true);
    for (let i = 0; i < 29; i++) tk(s);
    expect(s.hintVisible).toBe(true);
    for (let i = 0; i < 2; i++) tk(s);
    expect(s.hintVisible).toBe(false);
  });

  it('custom hold length', () => {
    const s = new SkipHold(0.5);
    expect(hold(s, 0.5)).toBe(1);
  });
});

describe('createSkipWidget', () => {
  it('shows a bar and the hint text', () => {
    const { widget, update } = createSkipWidget(doc, t);
    expect(widget.id).toBe('tutorial.skip');
    const [hint, track] = (widget.element as any).children;
    expect(hint.textContent).toBe('T:tutorial.skip.hint');
    expect(hint.style.display).toBe('none');
    update(0.5, true);
    expect(track.children[0].style.width).toBe('50%');
    expect(hint.style.display).toBe('block');
    update(2, false);
    expect(track.children[0].style.width).toBe('100%');
    update(NaN, false);
    expect(track.style.display).toBe('none');
    widget.dispose!();
    expect((widget.element as any).removed).toBe(true);
  });
});
