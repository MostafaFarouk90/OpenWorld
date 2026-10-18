import { describe, expect, it, vi } from 'vitest';
import type { GameContext } from './Game';
import { SYSTEM_ERROR_LOG_INTERVAL_MS, SystemRegistry, type GameSystem } from './systems';

const ctx = {} as GameContext;

function make(now = () => 0) {
  const report = vi.fn();
  const reg = new SystemRegistry(report, now);
  return { reg, report };
}

function logger(log: string[], id: string, extra: Partial<GameSystem> = {}): GameSystem {
  return { id, fixedUpdate: () => log.push(id), render: () => log.push(`r:${id}`), ...extra };
}

describe('SystemRegistry', () => {
  it('runs fixed systems of a phase by order, ties by id', () => {
    const { reg } = make();
    const log: string[] = [];
    reg.add(logger(log, 'c', { fixedPhase: 'rules', order: 5 }));
    reg.add(logger(log, 'b', { fixedPhase: 'rules', order: 5 }));
    reg.add(logger(log, 'a', { fixedPhase: 'rules', order: 10 }));
    reg.add(logger(log, 'z', { fixedPhase: 'rules', order: -1 }));
    reg.add(logger(log, 'n', { fixedPhase: 'rules' })); // order defaults to 0
    reg.commit();
    reg.runFixed('rules', 0.1, ctx);
    expect(log).toEqual(['z', 'n', 'b', 'c', 'a']);
  });

  it('only runs the requested phase and keeps fixed and render separate', () => {
    const { reg } = make();
    const log: string[] = [];
    reg.add(logger(log, 'in', { fixedPhase: 'input' }));
    reg.add(logger(log, 'late', { fixedPhase: 'late' }));
    reg.add(logger(log, 'w', { renderPhase: 'world' }));
    reg.add(logger(log, 'both', { fixedPhase: 'input', renderPhase: 'hud' }));
    reg.add(logger(log, 'none'));
    reg.commit();
    reg.runFixed('input', 0.1, ctx);
    expect(log).toEqual(['both', 'in']);
    log.length = 0;
    reg.runRender('world', 0.5, 1, ctx);
    expect(log).toEqual(['r:w']);
    log.length = 0;
    reg.runRender('hud', 0.5, 1, ctx);
    expect(log).toEqual(['r:both']);
    log.length = 0;
    reg.runRender('afterCamera', 0.5, 1, ctx); // empty phase
    reg.runFixed('animation', 0.1, ctx);
    expect(log).toEqual([]);
  });

  it('passes dt, alpha, frameTime and ctx', () => {
    const { reg } = make();
    const fixed = vi.fn();
    const render = vi.fn();
    reg.add({ id: 's', fixedPhase: 'input', renderPhase: 'world', fixedUpdate: fixed, render });
    reg.commit();
    reg.runFixed('input', 0.016, ctx);
    reg.runRender('world', 0.25, 12, ctx);
    expect(fixed).toHaveBeenCalledWith(0.016, ctx);
    expect(render).toHaveBeenCalledWith(0.25, 12, ctx);
  });

  it('a system without the matching method is skipped', () => {
    const { reg, report } = make();
    reg.add({ id: 'x', fixedPhase: 'input', renderPhase: 'world' });
    reg.commit();
    reg.runFixed('input', 0.1, ctx);
    reg.runRender('world', 0, 0, ctx);
    expect(report).not.toHaveBeenCalled();
  });

  it('duplicate id throws and keeps the first', () => {
    const { reg } = make();
    reg.add({ id: 'a' });
    expect(() => reg.add({ id: 'a' })).toThrow(/duplicate system id "a"/);
    expect(reg.size).toBe(1);
  });

  it('unknown phases throw', () => {
    const { reg } = make();
    expect(() => reg.add({ id: 'a', fixedPhase: 'nope' as never })).toThrow(/unknown fixed phase/);
    expect(() => reg.add({ id: 'b', renderPhase: 'nope' as never })).toThrow(/unknown render phase/);
    expect(reg.has('a')).toBe(false);
    expect(reg.has('b')).toBe(false);
  });

  it('a system added during a run first runs after commit()', () => {
    const { reg } = make();
    const log: string[] = [];
    reg.add({
      id: 'adder',
      fixedPhase: 'rules',
      fixedUpdate: () => {
        log.push('adder');
        if (!reg.has('late')) reg.add(logger(log, 'late', { fixedPhase: 'rules' }));
      },
    });
    reg.commit();
    reg.runFixed('rules', 0.1, ctx);
    expect(log).toEqual(['adder']);
    reg.runFixed('rules', 0.1, ctx); // still no commit
    expect(log).toEqual(['adder', 'adder']);
    reg.commit();
    reg.runFixed('rules', 0.1, ctx);
    expect(log).toEqual(['adder', 'adder', 'adder', 'late']);
  });

  it('a system removed during a run is not called later in the same run, and is disposed', () => {
    const { reg } = make();
    const log: string[] = [];
    const dispose = vi.fn();
    let off: () => void = () => {};
    reg.add({ id: 'a', fixedPhase: 'rules', order: 0, fixedUpdate: () => off() });
    off = reg.add(logger(log, 'b', { fixedPhase: 'rules', order: 1, dispose }));
    reg.commit();
    reg.runFixed('rules', 0.1, ctx);
    expect(log).toEqual([]);
    expect(dispose).toHaveBeenCalledTimes(1);
    reg.commit();
    reg.runFixed('rules', 0.1, ctx);
    expect(log).toEqual([]);
    expect(reg.has('b')).toBe(false);
  });

  it('commit during a run does not resort', () => {
    const { reg } = make();
    const log: string[] = [];
    reg.add({
      id: 'a',
      fixedPhase: 'rules',
      fixedUpdate: () => {
        reg.add(logger(log, 'n', { fixedPhase: 'rules' }));
        reg.commit(); // must be a no-op while running
      },
    });
    reg.commit();
    reg.runFixed('rules', 0.1, ctx);
    expect(log).toEqual([]);
    reg.commit();
    reg.runFixed('rules', 0.1, ctx);
    expect(log).toEqual(['n']);
  });

  it('the remove function can be called twice; dispose runs once', () => {
    const { reg } = make();
    const dispose = vi.fn();
    const off = reg.add({ id: 'a', dispose });
    off();
    off();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(reg.size).toBe(0);
    // id is free again
    expect(() => reg.add({ id: 'a' })).not.toThrow();
  });

  it('a throwing dispose on removal is reported', () => {
    const { reg, report } = make();
    reg.add({
      id: 'a',
      dispose: () => {
        throw new Error('d');
      },
    })();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toContain('"a"');
  });

  it('order() lists ids per phase without needing a commit', () => {
    const { reg } = make();
    reg.add({ id: 'b', fixedPhase: 'input', order: 2 });
    reg.add({ id: 'a', fixedPhase: 'input', order: 2 });
    reg.add({ id: 'c', fixedPhase: 'input', order: 1 });
    reg.add({ id: 'r', renderPhase: 'hud' });
    expect(reg.order('input')).toEqual(['c', 'a', 'b']);
    expect(reg.order('hud')).toEqual(['r']);
    expect(reg.order('late')).toEqual([]);
  });

  describe('error isolation and rate limiting', () => {
    it('a throwing fixed system does not stop the others', () => {
      const { reg, report } = make();
      const after = vi.fn();
      reg.add({
        id: 'bad',
        fixedPhase: 'rules',
        order: 0,
        fixedUpdate: () => {
          throw new Error('x');
        },
      });
      reg.add({ id: 'good', fixedPhase: 'rules', order: 1, fixedUpdate: after });
      reg.commit();
      reg.runFixed('rules', 0.1, ctx);
      expect(after).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledTimes(1);
      expect(report.mock.calls[0][0]).toContain('"bad"');
      expect(report.mock.calls[0][0]).toContain('fixedUpdate');
    });

    it('a throwing render system is isolated and labelled render', () => {
      const { reg, report } = make();
      reg.add({
        id: 'bad',
        renderPhase: 'world',
        render: () => {
          throw new Error('x');
        },
      });
      reg.commit();
      expect(() => reg.runRender('world', 0, 0, ctx)).not.toThrow();
      expect(report.mock.calls[0][0]).toContain('render');
    });

    it('reports a failing system at most once per SYSTEM_ERROR_LOG_INTERVAL_MS', () => {
      let t = 1000;
      const { reg, report } = make(() => t);
      reg.add({
        id: 'bad',
        fixedPhase: 'rules',
        fixedUpdate: () => {
          throw new Error('x');
        },
      });
      reg.commit();
      reg.runFixed('rules', 0.1, ctx);
      reg.runFixed('rules', 0.1, ctx);
      t += SYSTEM_ERROR_LOG_INTERVAL_MS - 1;
      reg.runFixed('rules', 0.1, ctx);
      expect(report).toHaveBeenCalledTimes(1);
      t += 1;
      reg.runFixed('rules', 0.1, ctx);
      expect(report).toHaveBeenCalledTimes(2);
      reg.runFixed('rules', 0.1, ctx);
      expect(report).toHaveBeenCalledTimes(2);
    });

    it('rate limits are per system', () => {
      const { reg, report } = make();
      const boom = () => {
        throw new Error('x');
      };
      reg.add({ id: 'a', fixedPhase: 'rules', fixedUpdate: boom });
      reg.add({ id: 'b', fixedPhase: 'rules', fixedUpdate: boom });
      reg.commit();
      reg.runFixed('rules', 0.1, ctx);
      reg.runFixed('rules', 0.1, ctx);
      expect(report).toHaveBeenCalledTimes(2);
    });

    it('the first failure is reported even when the clock reads 0', () => {
      const { reg, report } = make(() => 0);
      reg.add({
        id: 'a',
        fixedPhase: 'rules',
        fixedUpdate: () => {
          throw new Error('x');
        },
      });
      reg.commit();
      reg.runFixed('rules', 0.1, ctx);
      expect(report).toHaveBeenCalledTimes(1);
    });

    it('a throwing reporter never breaks the tick', () => {
      const reg = new SystemRegistry(
        () => {
          throw new Error('r');
        },
        () => 0,
      );
      const after = vi.fn();
      reg.add({
        id: 'bad',
        fixedPhase: 'rules',
        order: 0,
        fixedUpdate: () => {
          throw new Error('x');
        },
      });
      reg.add({ id: 'good', fixedPhase: 'rules', order: 1, fixedUpdate: after });
      reg.commit();
      expect(() => reg.runFixed('rules', 0.1, ctx)).not.toThrow();
      expect(after).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('disposes systems in reverse registration order', () => {
      const { reg } = make();
      const log: string[] = [];
      for (const id of ['a', 'b', 'c']) reg.add({ id, dispose: () => log.push(id), order: -log.length });
      reg.dispose();
      expect(log).toEqual(['c', 'b', 'a']);
      expect(reg.size).toBe(0);
    });

    it('is idempotent, continues past a throwing dispose, and refuses new systems', () => {
      const { reg, report } = make();
      const dispose = vi.fn();
      reg.add({ id: 'a', dispose });
      reg.add({
        id: 'b',
        dispose: () => {
          throw new Error('x');
        },
      });
      reg.dispose();
      reg.dispose();
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledTimes(1);
      expect(() => reg.add({ id: 'c' })).toThrow(/disposed/);
    });

    it('nothing runs after dispose', () => {
      const { reg } = make();
      const fn = vi.fn();
      reg.add({ id: 'a', fixedPhase: 'rules', fixedUpdate: fn });
      reg.commit();
      reg.dispose();
      reg.commit();
      reg.runFixed('rules', 0.1, ctx);
      expect(fn).not.toHaveBeenCalled();
    });

    it('a system disposed mid-run is not called again in that run', () => {
      const { reg } = make();
      const b = vi.fn();
      reg.add({ id: 'a', fixedPhase: 'rules', order: 0, fixedUpdate: () => reg.dispose() });
      reg.add({ id: 'b', fixedPhase: 'rules', order: 1, fixedUpdate: b });
      reg.commit();
      reg.runFixed('rules', 0.1, ctx);
      expect(b).not.toHaveBeenCalled();
    });
  });
});
