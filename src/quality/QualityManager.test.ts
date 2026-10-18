import { describe, expect, it, vi } from 'vitest';
import { QualityManager } from './QualityManager';
import { QUALITY_STORAGE_KEY } from '../vfx/tuning';
import type { GraphicsService } from '../vfx/ports';

function mem(init?: string) {
  const m = new Map<string, string>();
  if (init !== undefined) m.set(QUALITY_STORAGE_KEY, init);
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
function gfx() {
  return {
    renderScale: 1,
    shadows: 'full',
    viewDistanceOffset: 0,
    postPass: null,
    setRenderScale: vi.fn(),
    setShadows: vi.fn(),
    setViewDistanceOffset: vi.fn(),
    setPostPass: vi.fn(),
  } satisfies GraphicsService;
}

describe('QualityManager', () => {
  it('reads a stored choice', () => {
    const s = mem(JSON.stringify({ step: 'high', userChosen: true }));
    const q = new QualityManager({ storage: s });
    expect(q.step).toBe('high');
    expect(q.userChosen).toBe(true);
  });
  it('falls back to medium on corrupt, bad, missing or absent storage', () => {
    expect(new QualityManager({ storage: mem('{nope') }).step).toBe('medium');
    expect(new QualityManager({ storage: mem(JSON.stringify({ step: 'ultra' })) }).step).toBe('medium');
    expect(new QualityManager({ storage: mem() }).step).toBe('medium');
    expect(new QualityManager({ storage: null }).step).toBe('medium');
    expect(new QualityManager({}).step).toBe('medium');
  });
  it('survives storage that throws', () => {
    const bad = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('y');
      },
    };
    const q = new QualityManager({ storage: bad });
    expect(q.step).toBe('medium');
    expect(q.set('low', 'user')).toBe(true);
    expect(q.step).toBe('low');
  });
  it('?quality override beats storage and is not persisted', () => {
    const s = mem(JSON.stringify({ step: 'high', userChosen: false }));
    const q = new QualityManager({ storage: s, search: '?quality=low' });
    expect(q.step).toBe('low');
    expect(JSON.parse(s.m.get(QUALITY_STORAGE_KEY)!).step).toBe('high');
  });
  it('ignores an invalid override', () => {
    const q = new QualityManager({ storage: mem(), search: '?quality=ultra' });
    expect(q.step).toBe('medium');
    expect(q.userChosen).toBe(false);
  });
  it('set invalid returns false and changes nothing', () => {
    const s = mem();
    const q = new QualityManager({ storage: s });
    expect(q.set('ultra' as never, 'user')).toBe(false);
    expect(q.step).toBe('medium');
    expect(s.m.size).toBe(0);
  });
  it('persists user and probe choices, not governor', () => {
    const s = mem();
    const q = new QualityManager({ storage: s });
    q.set('high', 'probe');
    expect(JSON.parse(s.m.get(QUALITY_STORAGE_KEY)!)).toEqual({ step: 'high', userChosen: false });
    expect(q.userChosen).toBe(false);
    q.set('low', 'governor');
    expect(JSON.parse(s.m.get(QUALITY_STORAGE_KEY)!).step).toBe('high');
    q.set('medium', 'user');
    expect(JSON.parse(s.m.get(QUALITY_STORAGE_KEY)!)).toEqual({ step: 'medium', userChosen: true });
    expect(q.userChosen).toBe(true);
  });
  it('notifies subscribers on change only', () => {
    const q = new QualityManager({});
    const fn = vi.fn();
    const off = q.subscribe(fn);
    q.set('medium', 'user');
    expect(fn).not.toHaveBeenCalled();
    q.set('low', 'user');
    expect(fn).toHaveBeenCalledWith('low');
    off();
    q.set('high', 'user');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('applies graphics per step', () => {
    const g = gfx();
    const q = new QualityManager({ graphics: g });
    q.set('low', 'user');
    expect(g.setRenderScale).toHaveBeenLastCalledWith(0.75);
    expect(g.setShadows).toHaveBeenLastCalledWith('off', 0);
    expect(g.setViewDistanceOffset).toHaveBeenLastCalledWith(-1);
    q.set('medium', 'user');
    expect(g.setRenderScale).toHaveBeenLastCalledWith(0.9);
    expect(g.setShadows).toHaveBeenLastCalledWith('half', 40);
    q.set('high', 'user');
    expect(g.setRenderScale).toHaveBeenLastCalledWith(1);
    expect(g.setShadows).toHaveBeenLastCalledWith('full', 80);
    expect(g.setViewDistanceOffset).toHaveBeenLastCalledWith(0);
  });
  it('isolates a throwing graphics service and logs once', () => {
    const g = gfx();
    g.setRenderScale.mockImplementation(() => {
      throw new Error('boom');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const q = new QualityManager({ graphics: g });
    expect(() => {
      q.set('low', 'user');
      q.set('high', 'user');
    }).not.toThrow();
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
  it('works with graphics null', () => {
    const q = new QualityManager({ graphics: null });
    expect(() => q.applyToGraphics()).not.toThrow();
  });
});
