import { describe, expect, it } from 'vitest';
import { OrderedBraziers } from './OrderedBraziers';
import { PuzzleController, type PuzzleDef, type PuzzlePhase } from './PuzzleController';
import { routingCorrect, routingMatches, turnsNeeded } from './routing';

const DEF: PuzzleDef = { id: 'p', plaque: [1, 2, 0], positions: 4, initial: [0, 0, 3], order: [2, 0, 1], seconds: 10, valvePrefix: 'v' };

function make(def: PuzzleDef = DEF) {
  const log: string[] = [];
  const c = new PuzzleController(def, {
    emitState: (_id, p: PuzzlePhase) => log.push(`state:${p}`),
    emitSolved: () => log.push('solved'),
    emitFailed: () => log.push('failed'),
  });
  return { c, log };
}
/** Turns every wheel to the plaque. */
const route = (c: PuzzleController) => {
  for (let i = 0; i < c.wheels.length; i++) while (c.wheels[i].position() !== c.def.plaque[i] && !c.wheels[i].locked) c.wheels[i].turn();
};

describe('routing', () => {
  it('matches only on every valve and counts turns', () => {
    expect(routingMatches([1, 2], [1, 2])).toBe(true);
    expect(routingMatches([1, 3], [1, 2])).toBe(false);
    expect(routingMatches([1], [1, 2])).toBe(false);
    expect(routingCorrect([1, 3, 0], [1, 2, 0])).toBe(2);
    expect(turnsNeeded([0, 0, 3], [1, 2, 0], 4)).toBe(1 + 2 + 1);
  });
});

describe('OrderedBraziers', () => {
  it('lights in order and finishes', () => {
    const b = new OrderedBraziers([2, 0, 1]);
    expect(b.light(2)).toBe('ok');
    expect(b.isLit(2)).toBe(true);
    expect(b.light(2)).toBe('already');
    expect(b.light(0)).toBe('ok');
    expect(b.light(1)).toBe('done');
    expect(b.litIndices()).toEqual([2, 0, 1]);
  });

  it('a wrong brazier clears everything, and unknown indices are ignored', () => {
    const b = new OrderedBraziers([2, 0, 1]);
    b.light(2);
    expect(b.light(1)).toBe('wrong');
    expect(b.litIndices()).toEqual([]);
    expect(b.light(9)).toBe('unknown');
  });

  it('rejects an empty or duplicate order', () => {
    expect(() => new OrderedBraziers([])).toThrow();
    expect(() => new OrderedBraziers([1, 1])).toThrow();
  });
});

describe('PuzzleController', () => {
  it('rejects mismatched lengths and an already-solved start', () => {
    expect(() => make({ ...DEF, initial: [0, 0] })).toThrow();
    expect(() => make({ ...DEF, initial: [1, 2, 0] })).toThrow();
  });

  it('starts idle; the first turn starts the pressure phase and clock', () => {
    const { c, log } = make();
    expect(c.phase()).toBe('idle');
    c.wheels[0].turn();
    expect(c.phase()).toBe('pressure');
    expect(c.timer.active).toBe(true);
    expect(c.timer.total).toBe(10);
    expect(log).toEqual(['state:pressure']);
  });

  it('wrong routing keeps the clock running and never opens lighting', () => {
    const { c } = make();
    c.wheels[0].turn();
    c.wheels[1].turn();
    expect(c.phase()).toBe('pressure');
    expect(c.light(0)).toBe('closed');
  });

  it('a full match stops the clock, locks the valves and opens lighting', () => {
    const { c, log } = make();
    route(c);
    expect(c.phase()).toBe('lighting');
    expect(c.timer.active).toBe(false);
    expect(c.wheels.every((w) => w.locked)).toBe(true);
    expect(log).toEqual(['state:pressure', 'state:lighting']);
  });

  it('lighting in order solves once, and a wrong brazier resets only the braziers', () => {
    const { c, log } = make();
    route(c);
    expect(c.light(2)).toBe('ok');
    expect(c.light(1)).toBe('wrong');
    expect(c.phase()).toBe('lighting');
    expect(c.braziers.litIndices()).toEqual([]);
    c.light(2);
    c.light(0);
    expect(c.light(1)).toBe('done');
    expect(c.phase()).toBe('solved');
    expect(log.filter((l) => l === 'solved')).toHaveLength(1);
    expect(c.light(1)).toBe('closed');
  });

  it('the clock reaching zero fails, resets the valves and returns to idle with no penalty', () => {
    const { c, log } = make();
    c.wheels[0].turn();
    c.update(9);
    expect(c.phase()).toBe('pressure');
    c.update(2);
    expect(log).toContain('failed');
    expect(c.phase()).toBe('idle');
    expect(c.routing()).toEqual([...DEF.initial]);
    expect(c.timer.active).toBe(false);
    expect(log.slice(-2)).toEqual(['state:failed', 'state:idle']);
    // and the puzzle can be tried again
    c.wheels[0].turn();
    expect(c.phase()).toBe('pressure');
  });

  it('abort resets an unfinished puzzle silently of failure, and leaves a solved one alone', () => {
    const { c, log } = make();
    c.wheels[0].turn();
    c.abort();
    expect(c.phase()).toBe('idle');
    expect(c.timer.active).toBe(false);
    expect(log).not.toContain('failed');
    route(c);
    c.light(2);
    c.abort();
    expect(c.phase()).toBe('idle');
    expect(c.braziers.litIndices()).toEqual([]);
    route(c);
    for (const i of DEF.order) c.light(i);
    expect(c.phase()).toBe('solved');
    c.abort();
    expect(c.phase()).toBe('solved');
  });

  it('restoreSolved sets the plaque, locks the wheels and starts no clock; clearSolved undoes it', () => {
    const { c, log } = make();
    c.restoreSolved();
    expect(c.phase()).toBe('solved');
    expect(c.routing()).toEqual([...DEF.plaque]);
    expect(c.wheels.every((w) => w.locked)).toBe(true);
    expect(c.timer.active).toBe(false);
    expect(log).toEqual([]);
    c.clearSolved();
    expect(c.phase()).toBe('idle');
    expect(c.routing()).toEqual([...DEF.initial]);
  });

  it('turning during lighting or after solving does nothing', () => {
    const { c } = make();
    route(c);
    expect(c.wheels[0].turn()).toBe(false);
    expect(c.phase()).toBe('lighting');
  });
});
