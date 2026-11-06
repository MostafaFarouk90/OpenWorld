import { describe, expect, it } from 'vitest';
import { EormenBrain, type EormenHooks } from './EormenBrain';
import { BLADES, STAGGER, SWIPE, TOLL } from './tuning';

const TICK = 1 / 60;

function harness() {
  const log: string[] = [];
  const hooks: EormenHooks = {
    telegraph: (a, s, lead) => log.push(`telegraph:${a}:${s}:${lead}`),
    cancelTelegraph: (s) => log.push(`cancel:${s}`),
    blades: (s) => log.push(`blades:${s}`),
    toll: (s) => log.push(`toll:${s}`),
    swipe: (s) => log.push(`swipe:${s}`),
    windowOpen: (ext) => log.push(ext ? 'window:extended' : 'window:open'),
    windowClose: () => log.push('window:close'),
    staggerStart: () => log.push('staggerStart'),
    staggerEnd: () => log.push('staggerEnd'),
  };
  const brain = new EormenBrain(hooks);
  let dist = 8;
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) brain.tick(TICK, { dist });
  };
  /** Runs until `pred` or `limit` seconds. */
  const until = (pred: () => boolean, limit = 60) => {
    for (let i = 0; i < Math.round(limit / TICK) && !pred(); i++) brain.tick(TICK, { dist });
  };
  return { brain, log, run, until, setDist: (d: number) => (dist = d) };
}

describe('EormenBrain.pick', () => {
  it('tolls first when due, swipes close in, throws blades when due, otherwise drifts', () => {
    expect(EormenBrain.pick(2, true, true, true)).toBe('toll');
    expect(EormenBrain.pick(SWIPE.reach, false, true, true)).toBe('swipe');
    expect(EormenBrain.pick(SWIPE.reach + 0.1, false, true, true)).toBe('blades');
    expect(EormenBrain.pick(2, false, true, false)).toBe('blades');
    expect(EormenBrain.pick(8, false, false, true)).toBeNull();
  });
});

describe('EormenBrain', () => {
  it('does nothing before start, then flashes 0.8 s before the blades fly', () => {
    const h = harness();
    h.run(10);
    expect(h.log).toEqual([]);
    h.brain.start();
    h.until(() => h.log.length > 0);
    expect(h.log[0]).toBe(`telegraph:blades:1:${BLADES.windup}`);
    h.run(BLADES.windup - 2 * TICK);
    expect(h.log).not.toContain('blades:1');
    h.run(3 * TICK);
    expect(h.log).toContain('blades:1');
  });

  it('tolls after a 1.2 s telegraph and opens the gong for 4 s', () => {
    const h = harness();
    h.brain.start();
    h.brain.onFloor();
    h.until(() => h.brain.current === 'toll');
    expect(h.log).toContain(`telegraph:toll:${h.log.filter((x) => x.startsWith('telegraph')).length}:${TOLL.windup}`);
    h.until(() => h.brain.windowOpen);
    expect(h.log.slice(-1)[0]).toBe('window:open');
    expect(h.brain.windowRemaining).toBeCloseTo(TOLL.windowSeconds, 1);
    h.run(TOLL.windowSeconds + 0.05);
    expect(h.brain.windowOpen).toBe(false);
    expect(h.log).toContain('window:close');
  });

  it('a gong strike inside the window breaks once and closes it; outside it is a dud', () => {
    const h = harness();
    h.brain.start();
    expect(h.brain.strikeGong()).toBe('dud');
    h.brain.onFloor();
    h.until(() => h.brain.windowOpen);
    expect(h.brain.strikeGong()).toBe('break');
    expect(h.brain.windowOpen).toBe(false);
    expect(h.brain.strikeGong()).toBe('dud');
  });

  it('a toll during an open window extends it and never grants a second bar', () => {
    const h = harness();
    h.brain.start();
    h.brain.onFloor();
    h.until(() => h.brain.windowOpen);
    // Force a second toll while the window is still open (the early toll's worst case).
    (h.brain as unknown as { tollIn: number }).tollIn = 0;
    h.until(() => h.log.includes('window:extended'), 10);
    expect(h.log).toContain('window:extended');
    expect(h.log.filter((x) => x === 'window:open')).toHaveLength(1);
    expect(h.brain.windowRemaining).toBeGreaterThan(TOLL.windowSeconds - 0.1);
    expect(h.brain.strikeGong()).toBe('break');
    expect(h.brain.strikeGong()).toBe('dud');
  });

  it('the floor brings the toll forward to 1.5 s, but not while the gong is open', () => {
    const h = harness();
    h.brain.start();
    expect(h.brain.onFloor()).toBe(true);
    expect(h.brain.tollRemaining).toBeLessThanOrEqual(TOLL.atFloor);
    h.until(() => h.brain.windowOpen);
    (h.brain as unknown as { tollIn: number }).tollIn = 30;
    expect(h.brain.onFloor()).toBe(false);
    expect(h.brain.tollRemaining).toBeGreaterThan(TOLL.atFloor);
    h.run(TOLL.windowSeconds + 0.1);
    expect(h.brain.onFloor()).toBe(true);
    expect(h.brain.tollRemaining).toBeLessThanOrEqual(TOLL.atFloor);
  });

  it('a toll before the floor opens nothing; the floor arms the gong; a break or a new phase disarms it', () => {
    const h = harness();
    h.brain.start();
    h.until(() => h.log.some((x) => x.startsWith('toll:')), 20);
    h.run(0.1);
    expect(h.brain.gongReady).toBe(false);
    expect(h.brain.windowOpen).toBe(false);
    expect(h.log).not.toContain('window:open');
    expect(h.brain.strikeGong()).toBe('dud');
    h.brain.onFloor();
    expect(h.brain.gongReady).toBe(true);
    h.until(() => h.brain.windowOpen, 10);
    expect(h.brain.strikeGong()).toBe('break');
    expect(h.brain.gongReady).toBe(false);
    h.brain.onFloor();
    h.brain.onPhase(2);
    expect(h.brain.gongReady).toBe(false);
    const opens = h.log.filter((x) => x === 'window:open').length;
    h.run(30);
    expect(h.log.filter((x) => x === 'window:open')).toHaveLength(opens);
  });

  it('swipes when Cael stands close, then waits out its cooldown', () => {
    const h = harness();
    h.setDist(2);
    h.brain.start();
    h.until(() => h.log.some((x) => x.startsWith('swipe:')), 5);
    expect(h.log[0]).toBe(`telegraph:swipe:1:${SWIPE.windup}`);
    const swipes = () => h.log.filter((x) => x.startsWith('swipe:')).length;
    h.run(SWIPE.cooldown - 0.2);
    expect(swipes()).toBe(1);
  });

  it('a break cancels the telegraph and staggers him; he resumes after', () => {
    const h = harness();
    h.brain.start();
    h.until(() => h.brain.state === 'telegraph');
    h.brain.onBreak();
    expect(h.log).toContain('cancel:1');
    expect(h.brain.state).toBe('staggered');
    h.run(STAGGER.seconds + 0.05);
    expect(h.log).toContain('staggerEnd');
    expect(h.brain.state).not.toBe('staggered');
  });

  it('attacks faster in later phases', () => {
    const count = (phase: number) => {
      const h = harness();
      h.brain.start();
      h.brain.onPhase(phase);
      h.run(120);
      return h.log.filter((x) => x.startsWith('telegraph:')).length;
    };
    expect(count(2)).toBeGreaterThan(count(1));
    expect(count(3)).toBeGreaterThan(count(2));
  });

  it('stops dead on defeat, closing an open window', () => {
    const h = harness();
    h.brain.start();
    h.brain.onFloor();
    h.until(() => h.brain.windowOpen);
    h.brain.onDefeated();
    expect(h.log.slice(-1)[0]).toBe('window:close');
    const n = h.log.length;
    h.run(30);
    expect(h.log).toHaveLength(n);
    expect(h.brain.strikeGong()).toBe('dud');
  });

  it('ignores a zero or bad dt and a lower phase', () => {
    const h = harness();
    h.brain.start();
    h.brain.tick(0, { dist: 8 });
    h.brain.tick(Number.NaN, { dist: 8 });
    h.brain.onPhase(2);
    h.brain.onPhase(1);
    expect(h.brain.phase).toBe(2);
    expect(h.log).toEqual([]);
  });
});
