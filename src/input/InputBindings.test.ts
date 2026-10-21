import { describe, expect, it, vi } from 'vitest';
import { InputBindings } from './InputBindings';
import { ACTIONS, ACTION_DEFS } from './actions';
import type { Binding } from './actions';

const key = (code: string): Binding => ({ device: 'key', code });
const mouse = (button: 0 | 1 | 2 | 3 | 4): Binding => ({ device: 'mouse', button });

function store(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('owg.bindings.v1', initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}
const make = (s: ReturnType<typeof store> | null = store()) => {
  const warn = vi.fn();
  return { b: new InputBindings(s, warn), warn, s };
};

describe('defaults', () => {
  it('covers every action', () => {
    const { b } = make();
    for (const a of ACTIONS) expect(b.get(a)).toEqual(ACTION_DEFS[a].defaults);
  });

  it('defaults have no conflicts', () => {
    const { b } = make();
    for (const a of ACTIONS) {
      for (const bd of b.get(a)) {
        if (!bd) continue;
        const clash = b.actionsFor(bd).filter((o) => o !== a && ACTION_DEFS[o].contexts.some((c) => ACTION_DEFS[a].contexts.includes(c)));
        expect(clash).toEqual([]);
      }
    }
  });

  it('mercy defaults to KeyT, gameplay only, rebindable, without clashing', () => {
    const { b } = make();
    expect(b.get('mercy')).toEqual([key('KeyT'), null]);
    expect(ACTION_DEFS.mercy.contexts).toEqual(['gameplay']);
    expect(ACTION_DEFS.mercy.rebindable).toBe(true);
    expect(b.actionsFor(key('KeyT'))).toEqual(['mercy']);
  });

  it('mouse button 3 is the dodge secondary', () => {
    expect(make().b.get('dodge')[1]).toEqual(mouse(3));
  });

  it('get returns a copy', () => {
    const { b } = make();
    const g = b.get('jump') as [Binding | null, Binding | null];
    g[0] = key('KeyU');
    expect(b.get('jump')[0]).toEqual(key('Space'));
  });
});

describe('rebind', () => {
  it('succeeds on a free key and notifies', () => {
    const { b } = make();
    const l = vi.fn();
    b.onChange(l);
    expect(b.rebind('jump', 0, key('KeyU'))).toEqual({ ok: true });
    expect(b.get('jump')[0]).toEqual(key('KeyU'));
    expect(l).toHaveBeenCalledTimes(1);
  });

  it('reports a conflict with action and slot', () => {
    const { b } = make();
    expect(b.rebind('jump', 0, key('KeyF'))).toEqual({ ok: false, reason: 'conflict', conflictWith: 'interact', slot: 0 });
    expect(b.rebind('jump', 1, key('ArrowUp'))).toEqual({ ok: false, reason: 'conflict', conflictWith: 'moveForward', slot: 1 });
    expect(b.get('jump')).toEqual([key('Space'), null]);
  });

  it('swap gives the other action the old binding', () => {
    const { b } = make();
    expect(b.rebind('jump', 0, key('KeyF'), { swap: true })).toEqual({ ok: true, swappedWith: 'interact' });
    expect(b.get('jump')[0]).toEqual(key('KeyF'));
    expect(b.get('interact')[0]).toEqual(key('Space'));
  });

  it('swap clears the other when there was no old binding', () => {
    const { b } = make();
    expect(b.rebind('jump', 1, key('KeyF'), { swap: true })).toEqual({ ok: true, swappedWith: 'interact' });
    expect(b.get('interact')[0]).toBeNull();
  });

  it('same binding is ok and does not notify', () => {
    const { b } = make();
    const l = vi.fn();
    b.onChange(l);
    expect(b.rebind('jump', 0, key('Space'))).toEqual({ ok: true });
    expect(l).not.toHaveBeenCalled();
  });

  it('moving a binding to the other slot of the same action clears the old slot', () => {
    const { b } = make();
    expect(b.rebind('sprint', 0, key('ShiftRight')).ok).toBe(true);
    expect(b.get('sprint')).toEqual([key('ShiftRight'), null]);
  });

  it.each([key('Escape'), key('F5'), key('F12'), mouse(0)])('reserved: %j', (bd) => {
    expect(make().b.rebind('jump', 0, bd)).toEqual({ ok: false, reason: 'reserved' });
  });

  it('left mouse is allowed for attack1 and dialogueNext only', () => {
    const { b } = make();
    expect(b.rebind('dialogueNext', 1, mouse(0)).ok).toBe(true);
    expect(b.rebind('attack1', 0, mouse(0)).ok).toBe(true);
  });

  it('F13 is not reserved', () => {
    expect(make().b.rebind('jump', 0, key('F13')).ok).toBe(true);
  });

  it('non-rebindable menu is reserved', () => {
    expect(make().b.rebind('menu', 0, key('KeyU'))).toEqual({ ok: false, reason: 'reserved' });
  });

  it('unknown action and invalid bindings', () => {
    const { b } = make();
    expect(b.rebind('nope' as never, 0, key('KeyU'))).toEqual({ ok: false, reason: 'unknown-action' });
    expect(b.rebind('jump', 0, { device: 'key', code: '' })).toEqual({ ok: false, reason: 'invalid-binding' });
    expect(b.rebind('jump', 0, { device: 'mouse', button: 7 } as never)).toEqual({ ok: false, reason: 'invalid-binding' });
    expect(b.rebind('jump', 0, null as never)).toEqual({ ok: false, reason: 'invalid-binding' });
    expect(b.rebind('jump', 5 as never, key('KeyU'))).toEqual({ ok: false, reason: 'invalid-binding' });
  });

  it('menu-only vs gameplay actions may share keys', () => {
    const { b } = make();
    // dialogueChoice1 and attack1 both default to Digit1.
    expect(b.get('dialogueChoice1')[0]).toEqual(key('Digit1'));
    expect(b.rebind('dialogueChoice2', 1, key('KeyQ')).ok).toBe(true);
    expect(b.rebind('dialogueNext', 0, key('KeyG')).ok).toBe(true); // G is surge in gameplay
  });

  it('actions sharing menu context conflict (inventory vs map)', () => {
    expect(make().b.rebind('inventory', 0, key('KeyM'))).toMatchObject({ ok: false, reason: 'conflict', conflictWith: 'map' });
  });
});

describe('clear / reset / glyph / actionsFor', () => {
  it('clear and reset', () => {
    const { b } = make();
    b.clear('dodge', 1);
    expect(b.get('dodge')[1]).toBeNull();
    b.clear('menu', 0);
    expect(b.get('menu')[0]).toEqual(key('Escape'));
    b.rebind('jump', 0, key('KeyU'));
    b.resetToDefaults();
    expect(b.get('jump')[0]).toEqual(key('Space'));
    expect(b.get('dodge')[1]).toEqual(mouse(3));
  });

  it('glyphs', () => {
    const { b } = make();
    expect(b.glyph('interact')).toBe('F');
    expect(b.glyph('jump')).toBe('Space');
    expect(b.glyph('sprint')).toBe('Shift');
    expect(b.glyph('dodge')).toBe('Ctrl');
    expect(b.glyph('lockOn')).toBe('Tab');
    expect(b.glyph('attack2')).toBe('2');
    expect(b.glyph('block')).toBe('RMB');
    expect(b.glyph('sneak')).toBe('Alt');
    expect(b.glyph('menu')).toBe('Esc');
    b.rebind('block', 0, mouse(1));
    expect(b.glyph('block')).toBe('MMB');
    b.clear('dodge', 1);
    b.rebind('block', 0, mouse(3));
    expect(b.glyph('block')).toBe('Mouse4');
    b.rebind('block', 0, mouse(4));
    expect(b.glyph('block')).toBe('Mouse5');
    b.rebind('attack1', 0, key('KeyU'));
    b.clear('attack1', 0);
    expect(b.glyph('attack1')).toBe('LMB');
    b.rebind('moveForward', 0, key('ArrowUp'), { swap: true });
    expect(b.glyph('moveForward')).toBe('↑');
    b.clear('moveForward', 0);
    b.clear('moveForward', 1);
    expect(b.glyph('moveForward')).toBe('?');
  });

  it('actionsFor filters by context', () => {
    const { b } = make();
    expect(b.actionsFor(key('Digit1'))).toEqual(['attack1', 'dialogueChoice1']);
    expect(b.actionsFor(key('Digit1'), 'dialogue')).toEqual(['dialogueChoice1']);
    expect(b.actionsFor(mouse(3))).toEqual(['dodge']);
    expect(b.actionsFor(key('KeyU'))).toEqual([]);
  });

  it('onChange unsubscribes', () => {
    const { b } = make();
    const l = vi.fn();
    const off = b.onChange(l);
    off();
    b.rebind('jump', 0, key('KeyU'));
    expect(l).not.toHaveBeenCalled();
  });
});

describe('persistence', () => {
  it('stores only overrides and round-trips', () => {
    const s = store();
    const a = new InputBindings(s, vi.fn());
    expect(JSON.parse(s.data.get('owg.bindings.v1') ?? '{}')).toEqual({});
    a.rebind('jump', 0, key('KeyU'));
    expect(JSON.parse(s.data.get('owg.bindings.v1')!)).toEqual({ jump: [key('KeyU'), null] });
    const b = new InputBindings(s, vi.fn());
    expect(b.get('jump')).toEqual([key('KeyU'), null]);
    expect(b.get('interact')[0]).toEqual(key('KeyF'));
  });

  it('merges over defaults that changed', () => {
    const s = store(JSON.stringify({ jump: [key('KeyU'), null] }));
    const { b } = make(s);
    expect(b.get('jump')[0]).toEqual(key('KeyU'));
    expect(b.get('mount')[0]).toEqual(key('KeyH'));
  });

  it('reset persists defaults', () => {
    const s = store();
    const a = new InputBindings(s, vi.fn());
    a.rebind('jump', 0, key('KeyU'));
    a.resetToDefaults();
    expect(new InputBindings(s, vi.fn()).get('jump')[0]).toEqual(key('Space'));
  });

  it('a swap round-trips without being dropped as a conflict', () => {
    const s = store();
    const a = new InputBindings(s, vi.fn());
    a.rebind('jump', 0, key('KeyF'), { swap: true });
    const { b, warn } = make(s);
    expect(b.get('jump')[0]).toEqual(key('KeyF'));
    expect(b.get('interact')[0]).toEqual(key('Space'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('drops unknown actions, invalid bindings and fixed actions with warnings', () => {
    const s = store(JSON.stringify({
      ghost: [key('KeyU'), null],
      jump: [{ device: 'key' }, null],
      sneak: [key('KeyU')],
      menu: [key('KeyU'), null],
      lockOn: [key('Escape'), null],
      surge: [key('KeyU'), null],
    }));
    const { b, warn } = make(s);
    expect(warn).toHaveBeenCalledTimes(5);
    expect(b.get('jump')[0]).toEqual(key('Space'));
    expect(b.get('menu')[0]).toEqual(key('Escape'));
    expect(b.get('lockOn')[0]).toEqual(key('Tab'));
    expect(b.get('surge')[0]).toEqual(key('KeyU'));
  });

  it('drops a stored override that conflicts', () => {
    const s = store(JSON.stringify({ jump: [key('KeyF'), null] }));
    const { b, warn } = make(s);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(b.get('jump')[0]).toEqual(key('Space'));
    expect(b.get('interact')[0]).toEqual(key('KeyF'));
  });

  it.each(['{not json', '[1,2]', '"x"', 'null'])('corrupt data %s falls back to defaults', (raw) => {
    const { b, warn } = make(store(raw));
    expect(warn).toHaveBeenCalled();
    expect(b.get('jump')[0]).toEqual(key('Space'));
  });

  it('storage that throws is session-only', () => {
    const warn = vi.fn();
    const bad = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    };
    const b = new InputBindings(bad, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(b.rebind('jump', 0, key('KeyU')).ok).toBe(true);
    expect(b.get('jump')[0]).toEqual(key('KeyU'));
  });

  it('setItem throwing warns once and keeps working', () => {
    const warn = vi.fn();
    const b = new InputBindings({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, warn);
    b.rebind('jump', 0, key('KeyU'));
    b.rebind('jump', 0, key('KeyO'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(b.get('jump')[0]).toEqual(key('KeyO'));
  });

  it('null storage works', () => {
    const { b } = make(null);
    expect(b.rebind('jump', 0, key('KeyU')).ok).toBe(true);
  });
});
