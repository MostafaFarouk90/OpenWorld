import { describe, expect, it, vi } from 'vitest';
import { ACTIONS, ACTION_DEFS } from '../actions';
import { PAD_BINDINGS_STORAGE_KEY, PadBindings } from './PadBindings';
import { PAD, PAD_DEFAULTS, chordToken } from './padLayout';

function mem(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: vi.fn((k: string) => data.get(k) ?? null), setItem: vi.fn((k: string, v: string) => void data.set(k, v)), data };
}
const quiet = () => {};

describe('PadBindings defaults', () => {
  it('no two actions that share a context share a chord', () => {
    const seen = new Map<string, string[]>();
    for (const a of ACTIONS) {
      const c = PAD_DEFAULTS[a];
      if (!c) continue;
      for (const ctx of ACTION_DEFS[a].contexts) {
        const k = `${ctx}:${chordToken(c)}`;
        seen.set(k, [...(seen.get(k) ?? []), a]);
      }
    }
    for (const [k, list] of seen) expect(list, k).toHaveLength(1);
  });

  it('every gameplay action is reachable on the pad (chord, stick or radial)', () => {
    const b = new PadBindings(null, quiet);
    for (const a of ACTIONS) expect(b.glyph(a), a).not.toBe('?');
  });

  it('tokensFor includes the chord, the radial token and the stick direction', () => {
    const b = new PadBindings(null, quiet);
    expect(b.tokensFor('jump')).toEqual(['p:act:jump', 'p:base:0']);
    expect(b.tokensFor('moveForward')).toEqual(['p:act:moveForward', 'p:stick:up']);
    expect(b.tokensFor('skills')).toEqual(['p:act:skills']);
  });
});

describe('PadBindings rebind', () => {
  it('rebinds, persists only overrides and reloads them', () => {
    const s = mem();
    const b = new PadBindings(s, quiet);
    const changed = vi.fn();
    b.onChange(changed);
    expect(b.rebind('interact', { button: PAD.Y, layer: 'lb' })).toEqual({ ok: false, reason: 'conflict', conflictWith: 'ability4' });
    expect(b.rebind('interact', { button: PAD.LS, layer: 'lb' })).toEqual({ ok: true });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(JSON.parse(s.data.get(PAD_BINDINGS_STORAGE_KEY)!)).toEqual({ interact: { button: PAD.LS, layer: 'lb' } });
    expect(new PadBindings(s, quiet).get('interact')).toEqual({ button: PAD.LS, layer: 'lb' });
    expect(new PadBindings(s, quiet).tokensFor('interact')).toContain('p:lb:10');
  });

  it('swap gives the other action the old chord', () => {
    const b = new PadBindings(null, quiet);
    expect(b.rebind('interact', { button: PAD.A, layer: 'base' }, { swap: true })).toEqual({ ok: true, swappedWith: 'jump' });
    expect(b.get('jump')).toEqual({ button: PAD.X, layer: 'base' });
    expect(b.get('interact')).toEqual({ button: PAD.A, layer: 'base' });
  });

  it('refuses reserved buttons, fixed actions, bad chords and unknown actions', () => {
    const b = new PadBindings(null, quiet);
    expect(b.rebind('jump', { button: PAD.START, layer: 'base' })).toMatchObject({ reason: 'reserved' });
    expect(b.rebind('jump', { button: PAD.RB, layer: 'base' })).toMatchObject({ reason: 'reserved' });
    expect(b.rebind('menu', { button: PAD.A, layer: 'base' })).toMatchObject({ reason: 'reserved' });
    expect(b.rebind('moveForward', { button: PAD.A, layer: 'base' })).toMatchObject({ reason: 'reserved' });
    expect(b.rebind('jump', { button: 40, layer: 'base' })).toMatchObject({ reason: 'invalid-binding' });
    expect(b.rebind('jump', { button: 1, layer: 'up' as never })).toMatchObject({ reason: 'invalid-binding' });
    expect(b.rebind('nope' as never, { button: 1, layer: 'base' })).toMatchObject({ reason: 'unknown-action' });
    expect(b.rebindable('menu')).toBe(false);
    expect(b.rebindable('jump')).toBe(true);
  });

  it('clear and reset', () => {
    const b = new PadBindings(null, quiet);
    b.clear('mount');
    expect(b.get('mount')).toBeNull();
    expect(b.glyph('mount')).toBe('?');
    b.clear('menu');
    expect(b.get('menu')).not.toBeNull();
    b.resetToDefaults();
    expect(b.get('mount')).toEqual(PAD_DEFAULTS.mount);
  });
});

describe('PadBindings storage failures', () => {
  it('corrupt, malformed and partly invalid storage fall back to defaults with warnings', () => {
    const warn = vi.fn();
    expect(new PadBindings(mem({ [PAD_BINDINGS_STORAGE_KEY]: '{oops' }), warn).get('jump')).toEqual(PAD_DEFAULTS.jump);
    expect(new PadBindings(mem({ [PAD_BINDINGS_STORAGE_KEY]: '[1]' }), warn).get('jump')).toEqual(PAD_DEFAULTS.jump);
    const b = new PadBindings(
      mem({ [PAD_BINDINGS_STORAGE_KEY]: JSON.stringify({ jump: { button: PAD.START, layer: 'base' }, menu: null, bogus: null, mount: null }) }),
      warn,
    );
    expect(b.get('jump')).toEqual(PAD_DEFAULTS.jump);
    expect(b.get('menu')).toEqual(PAD_DEFAULTS.menu);
    expect(b.get('mount')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('a stored clash reverts to defaults', () => {
    const warn = vi.fn();
    const b = new PadBindings(mem({ [PAD_BINDINGS_STORAGE_KEY]: JSON.stringify({ interact: { button: PAD.A, layer: 'base' } }) }), warn);
    expect(b.get('interact')).toEqual(PAD_DEFAULTS.interact);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('conflicts'));
  });

  it('storage that throws keeps the session working', () => {
    const warn = vi.fn();
    const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
    const b = new PadBindings(bad, warn);
    expect(b.rebind('mount', { button: PAD.LS, layer: 'lb' })).toEqual({ ok: true });
    expect(b.get('mount')).toEqual({ button: PAD.LS, layer: 'lb' });
  });
});
