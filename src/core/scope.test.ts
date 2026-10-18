import { describe, expect, it, vi } from 'vitest';
import { Scope, scoped } from './scope';

class Svc {
  count = 0;
  readonly name = 'svc';
  active = new Set<string>();
  add(id: string): () => void {
    this.active.add(id);
    return () => {
      this.active.delete(id);
    };
  }
  plain(): number {
    return ++this.count;
  }
  modal(open: boolean): (() => void) | null {
    return open ? () => {} : null;
  }
  bad(): unknown {
    return 'nope';
  }
  get double(): number {
    return this.count * 2;
  }
}

class Sub extends Svc {
  extra(): string {
    return `extra:${this.name}`;
  }
}

describe('Scope', () => {
  it('close runs undos in reverse order', () => {
    const s = new Scope();
    const log: number[] = [];
    s.track(() => log.push(1));
    s.track(() => log.push(2));
    s.track(() => log.push(3));
    expect(s.size).toBe(3);
    s.close();
    expect(log).toEqual([3, 2, 1]);
    expect(s.isClosed).toBe(true);
    expect(s.size).toBe(0);
  });

  it('close is idempotent', () => {
    const s = new Scope();
    const undo = vi.fn();
    s.track(undo);
    s.close();
    s.close();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('the returned undo runs once, early, and close does not repeat it', () => {
    const s = new Scope();
    const undo = vi.fn();
    const early = s.track(undo);
    early();
    early();
    s.close();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('track after close runs immediately', () => {
    const s = new Scope();
    s.close();
    const undo = vi.fn();
    const off = s.track(undo);
    expect(undo).toHaveBeenCalledTimes(1);
    off();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(s.size).toBe(0);
  });

  it('a failing undo is reported and the others still run', () => {
    const report = vi.fn();
    const s = new Scope(report);
    const log: string[] = [];
    s.track(() => log.push('first'));
    const err = new Error('x');
    s.track(() => {
      throw err;
    });
    s.track(() => log.push('last'));
    expect(() => s.close()).not.toThrow();
    expect(log).toEqual(['last', 'first']);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('Scope: undo failed', err);
  });

  it('a failing undo tracked after close is reported, not thrown', () => {
    const report = vi.fn();
    const s = new Scope(report);
    s.close();
    expect(() =>
      s.track(() => {
        throw new Error('x');
      }),
    ).not.toThrow();
    expect(report).toHaveBeenCalledTimes(1);
  });
});

describe('scoped', () => {
  it('binds methods to the target', () => {
    const t = new Svc();
    const w = scoped(t, new Scope(), []);
    const { plain } = w; // detached call keeps `this`
    expect(plain()).toBe(1);
    expect(t.count).toBe(1);
  });

  it('forwards property reads, getters and writes', () => {
    const t = new Svc();
    const w = scoped(t, new Scope(), []);
    expect(w.name).toBe('svc');
    w.count = 4;
    expect(t.count).toBe(4);
    expect(w.count).toBe(4);
    t.count = 7;
    expect(w.count).toBe(7);
    expect(w.double).toBe(14);
  });

  it('includes inherited methods and own fields of subclasses', () => {
    const t = new Sub();
    const w = scoped(t, new Scope(), []);
    expect(w.extra()).toBe('extra:svc');
    expect(w.plain()).toBe(1);
  });

  it('does not expose constructor or Object.prototype members', () => {
    const w = scoped(new Svc(), new Scope(), []) as unknown as Record<string, unknown>;
    expect(w.constructor).toBeUndefined();
    expect(w.toString).toBeUndefined();
  });

  it('tracked methods record their undo in the scope', () => {
    const t = new Svc();
    const scope = new Scope();
    const w = scoped(t, scope, ['add']);
    w.add('x');
    w.add('y');
    expect(t.active.size).toBe(2);
    expect(scope.size).toBe(2);
    scope.close();
    expect(t.active.size).toBe(0);
  });

  it('the returned undo works early and is not repeated on close', () => {
    const t = new Svc();
    const scope = new Scope();
    const w = scoped(t, scope, ['add']);
    const off = w.add('x');
    off();
    expect(t.active.size).toBe(0);
    t.active.add('x'); // re-added elsewhere must survive a second undo
    scope.close();
    expect(t.active.has('x')).toBe(true);
  });

  it('a null return (refused modal) is passed through and not tracked', () => {
    const scope = new Scope();
    const w = scoped(new Svc(), scope, ['modal']);
    expect(w.modal(false)).toBeNull();
    expect(scope.size).toBe(0);
    expect(w.modal(true)).toBeTypeOf('function');
    expect(scope.size).toBe(1);
  });

  it('a non-function, non-null return from a tracked method throws', () => {
    const w = scoped(new Svc(), new Scope(), ['bad']);
    expect(() => w.bad()).toThrow(/bad did not return an undo function/);
  });

  it('a tracked method called after the scope closed undoes at once', () => {
    const t = new Svc();
    const scope = new Scope();
    const w = scoped(t, scope, ['add']);
    scope.close();
    w.add('late');
    expect(t.active.size).toBe(0);
  });

  it('untracked methods are not recorded even when they return functions', () => {
    const t = new Svc();
    const scope = new Scope();
    const w = scoped(t, scope, []);
    w.add('x');
    expect(scope.size).toBe(0);
    expect(t.active.has('x')).toBe(true);
  });

  it('custom methods replace the original', () => {
    const t = new Svc();
    const custom = vi.fn(() => 99);
    const w = scoped(t, new Scope(), ['add'], { plain: custom });
    expect(w.plain()).toBe(99);
    expect(t.count).toBe(0);
  });

  it('exceptions from a tracked method propagate and record nothing', () => {
    const scope = new Scope();
    const t = { boom: () => { throw new Error('b'); } };
    const w = scoped(t, scope, ['boom']);
    expect(() => w.boom()).toThrow('b');
    expect(scope.size).toBe(0);
  });
});
