import { describe, expect, it, vi } from 'vitest';
import { CutsceneDirector } from './Cutscene';

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

function make(opts: { rig?: any; visible?: boolean; throwOn?: string } = {}) {
  const log: string[] = [];
  const mounted: any[] = [];
  let visible = opts.visible ?? true;
  const rig = opts.rig === undefined ? { yaw: 0, pitch: -0.3, lockTarget: () => null } : opts.rig;
  const warn = vi.fn();
  const maybeThrow = (n: string) => { if (opts.throwOn === n) throw new Error(n); };
  const d = new CutsceneDirector({
    emit: (n, p) => log.push(`${n}:${p.cutsceneId}`),
    pushContext: () => { log.push('push'); return () => { log.push('pop'); maybeThrow('pop'); }; },
    freeze: () => { log.push('freeze'); return () => { log.push('unfreeze'); }; },
    hud: {
      mount: (_s, w) => { mounted.push(w); log.push('mount'); return () => log.push('unmount'); },
      setVisible: (v) => { visible = v; log.push(`vis:${v}`); },
      get isVisible() { return visible; },
    },
    rig, doc, warn,
  });
  return { d, log, mounted, rig, warn, vis: () => visible };
}

describe('CutsceneDirector', () => {
  it('start pushes context, freezes, mounts the letterbox, hides the HUD, emits started', () => {
    const { d, log, mounted, rig } = make({ rig: { yaw: 0, pitch: 0, lockTarget: () => 1 } });
    expect(d.start('knighting')).toBe(true);
    expect(d.active).toBe('knighting');
    expect(log).toEqual(['push', 'freeze', 'mount', 'vis:false', 'cutscene.started:knighting']);
    expect(mounted[0].id).toBe('tutorial.letterbox');
    expect(mounted[0].order).toBe(800);
    expect(mounted[0].element.children).toHaveLength(2);
    expect(rig.lockTarget).toBeNull();
  });

  it('a second start while active is refused and emits nothing', () => {
    const { d, log } = make();
    d.start('a');
    const n = log.length;
    expect(d.start('b')).toBe(false);
    expect(d.active).toBe('a');
    expect(log).toHaveLength(n);
  });

  it('end reverses everything and restores visibility and lockTarget', () => {
    const lock = () => null;
    const { d, log, vis, rig } = make({ rig: { yaw: 0, pitch: 0, lockTarget: lock }, visible: false });
    d.start('a');
    log.length = 0;
    d.end();
    expect(log).toEqual(['vis:false', 'unmount', 'unfreeze', 'pop', 'cutscene.ended:a']);
    expect(vis()).toBe(false);
    expect(rig.lockTarget).toBe(lock);
    expect(d.active).toBeNull();
  });

  it('restores a visible HUD', () => {
    const { d, vis } = make({ visible: true });
    d.start('a');
    expect(vis()).toBe(false);
    d.end();
    expect(vis()).toBe(true);
  });

  it('end without start does nothing; end twice emits once', () => {
    const { d, log } = make();
    d.end();
    expect(log).toEqual([]);
    d.start('a');
    d.end();
    d.end();
    expect(log.filter((l) => l.startsWith('cutscene.ended'))).toHaveLength(1);
  });

  it('dispose mid-cutscene emits ended once; start works again afterwards', () => {
    const { d, log } = make();
    d.start('a');
    d.dispose();
    d.dispose();
    expect(log.filter((l) => l.startsWith('cutscene.ended'))).toHaveLength(1);
    expect(d.start('b')).toBe(true);
  });

  it('works with a null rig', () => {
    const { d, log } = make({ rig: null });
    expect(d.start('a', { yaw: 1, pitch: 0, seconds: 1 })).toBe(true);
    d.render(0.5);
    d.end();
    expect(log.at(-1)).toBe('cutscene.ended:a');
  });

  it('a throwing restore does not stop the others and is reported', () => {
    const { d, log, warn, vis } = make({ throwOn: 'pop' });
    d.start('a');
    d.end();
    expect(log).toContain('unfreeze');
    expect(vis()).toBe(true);
    expect(log.at(-1)).toBe('cutscene.ended:a');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('eases to the shot in the given time without overshooting', () => {
    const { d, rig } = make();
    d.start('a', { yaw: 1, pitch: 0.4, seconds: 1 });
    let prev = 0;
    for (let i = 0; i < 9; i++) {
      d.render(0.1);
      expect(rig.yaw).toBeLessThanOrEqual(1);
      expect(rig.yaw).toBeGreaterThanOrEqual(prev);
      prev = rig.yaw;
    }
    expect(rig.yaw).toBeLessThan(1);
    d.render(0.1);
    expect(rig.yaw).toBeCloseTo(1, 9);
    expect(rig.pitch).toBeCloseTo(0.4, 9);
  });

  it('a huge frame snaps without overshoot; render is inert when idle', () => {
    const { d, rig } = make();
    d.render(1);
    expect(rig.yaw).toBe(0);
    d.start('a', { yaw: 1, pitch: 0, seconds: 0.5 });
    d.render(10);
    expect(rig.yaw).toBeCloseTo(1, 9);
  });

  it('takes the short arc across the PI seam', () => {
    const { d, rig } = make({ rig: { yaw: 3, pitch: 0, lockTarget: null } });
    d.start('a', { yaw: -3, pitch: 0, seconds: 1 });
    d.render(0.5);
    expect(rig.yaw).toBeGreaterThan(3);
    d.render(0.5);
    const diff = Math.atan2(Math.sin(rig.yaw + 3), Math.cos(rig.yaw + 3));
    expect(Math.abs(diff)).toBeLessThan(1e-9);
  });

  it('setShot retargets mid-cutscene', () => {
    const { d, rig } = make();
    d.start('a');
    d.setShot({ yaw: -0.5, pitch: 0, seconds: 0.2 });
    d.render(0.2);
    expect(rig.yaw).toBeCloseTo(-0.5, 9);
  });
});
