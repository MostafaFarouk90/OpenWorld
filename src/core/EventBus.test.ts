import { describe, expect, it, vi } from 'vitest';
import { EventBus, MAX_EVENTS_PER_FLUSH } from './EventBus';

interface M {
  a: { n: number };
  b: { n: number };
  c: { n: number };
}

function make() {
  const report = vi.fn();
  return { bus: new EventBus<M>(report), report };
}

describe('EventBus', () => {
  it('delivers to listeners in registration order, typed listeners before onAny', () => {
    const { bus } = make();
    const log: string[] = [];
    bus.onAny((t) => log.push(`any:${String(t)}`));
    bus.on('a', () => log.push('1'));
    bus.on('a', () => log.push('2'));
    bus.emit('a', { n: 0 });
    expect(log).toEqual(['1', '2', 'any:a']);
  });

  it('passes the payload and ignores events with no listeners', () => {
    const { bus } = make();
    const fn = vi.fn();
    bus.on('a', fn);
    bus.emit('b', { n: 1 });
    bus.emit('a', { n: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ n: 2 });
  });

  it('queues events emitted during dispatch until every listener saw the current one (FIFO, three deep)', () => {
    const { bus } = make();
    const log: string[] = [];
    bus.on('a', () => {
      log.push('a1');
      bus.emit('b', { n: 0 });
    });
    bus.on('a', () => log.push('a2'));
    bus.on('b', () => {
      log.push('b1');
      bus.emit('c', { n: 0 });
    });
    bus.on('b', () => log.push('b2'));
    bus.on('c', () => log.push('c1'));
    bus.emit('a', { n: 0 });
    expect(log).toEqual(['a1', 'a2', 'b1', 'b2', 'c1']);
  });

  it('keeps FIFO between several events queued during dispatch', () => {
    const { bus } = make();
    const log: number[] = [];
    bus.on('a', () => {
      bus.emit('b', { n: 1 });
      bus.emit('b', { n: 2 });
    });
    bus.on('b', (p) => log.push(p.n));
    bus.emit('a', { n: 0 });
    expect(log).toEqual([1, 2]);
  });

  it('a listener added during dispatch does not get the current event but gets the next', () => {
    const { bus } = make();
    const late = vi.fn();
    bus.on('a', () => {
      bus.on('a', late);
    });
    bus.emit('a', { n: 1 });
    expect(late).not.toHaveBeenCalled();
    bus.emit('a', { n: 2 });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('a listener removed during dispatch is not called', () => {
    const { bus } = make();
    const second = vi.fn();
    let off: () => void = () => {};
    bus.on('a', () => off());
    off = bus.on('a', second);
    bus.emit('a', { n: 1 });
    expect(second).not.toHaveBeenCalled();
    expect(bus.listenerCount('a')).toBe(1);
  });

  it('isolates a throwing listener and reports it', () => {
    const { bus, report } = make();
    const after = vi.fn();
    const err = new Error('boom');
    bus.on('a', () => {
      throw err;
    });
    bus.on('a', after);
    bus.emit('a', { n: 1 });
    expect(after).toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toContain('"a"');
    expect(report.mock.calls[0][1]).toBe(err);
  });

  it('isolates a throwing onAny listener', () => {
    const { bus, report } = make();
    const other = vi.fn();
    bus.onAny(() => {
      throw new Error('x');
    });
    bus.onAny(other);
    bus.emit('a', { n: 1 });
    expect(other).toHaveBeenCalledWith('a', { n: 1 });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('survives a reporter that throws', () => {
    const bus = new EventBus<M>(() => {
      throw new Error('reporter');
    });
    const after = vi.fn();
    bus.on('a', () => {
      throw new Error('x');
    });
    bus.on('a', after);
    expect(() => bus.emit('a', { n: 1 })).not.toThrow();
    expect(after).toHaveBeenCalled();
    // and the bus is still usable
    bus.emit('a', { n: 2 });
    expect(after).toHaveBeenCalledTimes(2);
  });

  it('once fires a single time, even when the event re-emits itself', () => {
    const { bus } = make();
    const fn = vi.fn();
    bus.once('a', (p) => {
      fn(p.n);
      bus.emit('a', { n: p.n + 1 });
    });
    bus.emit('a', { n: 1 });
    bus.emit('a', { n: 5 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
    expect(bus.listenerCount('a')).toBe(0);
  });

  it('once is removed before it runs, so a throwing once listener is not retried', () => {
    const { bus, report } = make();
    bus.once('a', () => {
      throw new Error('x');
    });
    bus.emit('a', { n: 1 });
    bus.emit('a', { n: 2 });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('onAny sees every event with its type', () => {
    const { bus } = make();
    const seen: [string, number][] = [];
    bus.onAny((t, p) => seen.push([String(t), (p as { n: number }).n]));
    bus.emit('a', { n: 1 });
    bus.emit('b', { n: 2 });
    expect(seen).toEqual([['a', 1], ['b', 2]]);
  });

  it('unsubscribing twice is safe and does not remove another listener', () => {
    const { bus } = make();
    const fn = vi.fn();
    const off = bus.on('a', () => {});
    bus.on('a', fn);
    off();
    off();
    expect(bus.listenerCount('a')).toBe(1);
    bus.emit('a', { n: 1 });
    expect(fn).toHaveBeenCalled();
    const offAny = bus.onAny(() => {});
    offAny();
    offAny();
  });

  it('the same function registered twice gets independent subscriptions', () => {
    const { bus } = make();
    const fn = vi.fn();
    const off1 = bus.on('a', fn);
    bus.on('a', fn);
    off1();
    bus.emit('a', { n: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('an onAny listener removed during dispatch is skipped', () => {
    const { bus } = make();
    const second = vi.fn();
    let off: () => void = () => {};
    bus.onAny(() => off());
    off = bus.onAny(second);
    bus.emit('a', { n: 1 });
    expect(second).not.toHaveBeenCalled();
  });

  describe('batch', () => {
    it('holds events until the function returns, then delivers them together', () => {
      const { bus } = make();
      const log: string[] = [];
      bus.on('a', (p) => log.push(`a${p.n}`));
      bus.on('b', (p) => log.push(`b${p.n}`));
      bus.batch(() => {
        bus.emit('a', { n: 1 });
        bus.emit('b', { n: 2 });
        log.push('inside');
      });
      expect(log).toEqual(['inside', 'a1', 'b2']);
    });

    it('delivers batched events before events their listeners emit', () => {
      const { bus } = make();
      const log: string[] = [];
      bus.on('a', () => {
        log.push('a');
        bus.emit('c', { n: 0 });
      });
      bus.on('b', () => log.push('b'));
      bus.on('c', () => log.push('c'));
      bus.batch(() => {
        bus.emit('a', { n: 0 });
        bus.emit('b', { n: 0 });
      });
      expect(log).toEqual(['a', 'b', 'c']);
    });

    it('returns the function result', () => {
      const { bus } = make();
      expect(bus.batch(() => 42)).toBe(42);
    });

    it('delivers held events even when the function throws, and rethrows', () => {
      const { bus } = make();
      const fn = vi.fn();
      bus.on('a', fn);
      expect(() =>
        bus.batch(() => {
          bus.emit('a', { n: 1 });
          throw new Error('x');
        }),
      ).toThrow('x');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('nested batches join the outermost', () => {
      const { bus } = make();
      const log: string[] = [];
      bus.on('a', () => log.push('a'));
      bus.on('b', () => log.push('b'));
      bus.batch(() => {
        bus.batch(() => bus.emit('a', { n: 0 }));
        log.push('after-inner');
        bus.emit('b', { n: 0 });
      });
      expect(log).toEqual(['after-inner', 'a', 'b']);
    });

    it('a batch inside a dispatch delivers after the current event finished', () => {
      const { bus } = make();
      const log: string[] = [];
      bus.on('a', () => {
        log.push('a1');
        bus.batch(() => {
          bus.emit('b', { n: 1 });
          bus.emit('b', { n: 2 });
        });
        log.push('a1-end');
      });
      bus.on('a', () => log.push('a2'));
      bus.on('b', (p) => log.push(`b${p.n}`));
      bus.emit('a', { n: 0 });
      expect(log).toEqual(['a1', 'a1-end', 'a2', 'b1', 'b2']);
    });

    it('an empty batch is a no-op', () => {
      const { bus } = make();
      expect(() => bus.batch(() => {})).not.toThrow();
    });
  });

  describe('loop guard', () => {
    it('drops the rest after MAX_EVENTS_PER_FLUSH and reports once', () => {
      const { bus, report } = make();
      let count = 0;
      bus.on('a', () => {
        count++;
        bus.emit('a', { n: count });
        bus.emit('a', { n: count });
      });
      bus.emit('a', { n: 0 });
      expect(count).toBe(MAX_EVENTS_PER_FLUSH);
      expect(report).toHaveBeenCalledTimes(1);
      expect(report.mock.calls[0][0]).toContain(String(MAX_EVENTS_PER_FLUSH));
    });

    it('a flush of exactly MAX_EVENTS_PER_FLUSH events is not cut off', () => {
      const { bus, report } = make();
      let count = 0;
      bus.on('a', (p) => {
        count++;
        if (p.n < MAX_EVENTS_PER_FLUSH) bus.emit('a', { n: p.n + 1 });
      });
      bus.emit('a', { n: 1 });
      expect(count).toBe(MAX_EVENTS_PER_FLUSH);
      expect(report).not.toHaveBeenCalled();
    });

    it('recovers after a cut-off: the next emit works and the counter is fresh', () => {
      const { bus, report } = make();
      let loop = true;
      let count = 0;
      bus.on('a', () => {
        count++;
        if (loop) bus.emit('a', { n: 0 });
      });
      bus.emit('a', { n: 0 });
      expect(report).toHaveBeenCalledTimes(1);
      loop = false;
      count = 0;
      bus.emit('a', { n: 0 });
      expect(count).toBe(1);
      expect(report).toHaveBeenCalledTimes(1);
    });

    it('a throwing listener inside a loop does not stop the guard', () => {
      const { bus, report } = make();
      bus.on('a', () => {
        bus.emit('a', { n: 0 });
        throw new Error('x');
      });
      bus.emit('a', { n: 0 });
      // MAX listener failures plus one loop report
      expect(report.mock.calls.filter((c) => String(c[0]).includes('more than')).length).toBe(1);
    });
  });
});
