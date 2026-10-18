import { describe, expect, it } from 'vitest';
import { BanterDirector, LineBag, type BanterLines, type BanterTuning } from './BanterDirector';
import { TOBB_TUNING } from './tuning';

/** Seeded LCG in [0, 1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const LINES: BanterLines = {
  area: { ford: ['ford.1', 'ford.2'], road: ['road.1'], empty: [] },
  combatStart: ['cs.1', 'cs.2', 'cs.3'],
  combatEnd: ['ce.1', 'ce.2'],
  elapsed: ['el.1', 'el.2', 'el.3'],
};

/** Elapsed barks pushed out of the way so they cannot interfere. */
const tuned = (min: number, max: number): BanterTuning => ({ ...TOBB_TUNING, elapsedMinSeconds: min, elapsedMaxSeconds: max }) as BanterTuning;
const QUIET_ELAPSED = tuned(1e9, 1e9);

function director(tuning = QUIET_ELAPSED, lines = LINES, rng = lcg(1)) {
  const d = new BanterDirector(lines, rng, tuning);
  d.setActive(true);
  return d;
}

describe('LineBag', () => {
  it('gives no repeats until the pool is used up', () => {
    const bag = new LineBag(['a', 'b', 'c', 'd'], lcg(3));
    for (let round = 0; round < 5; round++) {
      const drawn = [bag.next(), bag.next(), bag.next(), bag.next()];
      expect(new Set(drawn).size).toBe(4);
    }
  });
  it('never gives the same line twice in a row across a refill', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const bag = new LineBag(['a', 'b', 'c'], lcg(seed));
      let prev: string | null = null;
      for (let i = 0; i < 100; i++) {
        const l = bag.next();
        expect(l).not.toBe(prev);
        prev = l;
      }
    }
  });
  it('also holds for a two-line pool and a constant rng', () => {
    for (const rng of [() => 0, () => 0.999999, () => 1]) {
      const bag = new LineBag(['a', 'b'], rng);
      let prev: string | null = null;
      for (let i = 0; i < 20; i++) {
        const l = bag.next();
        expect(l === 'a' || l === 'b').toBe(true);
        expect(l).not.toBe(prev);
        prev = l;
      }
    }
  });
  it('returns null for an empty pool, every time', () => {
    const bag = new LineBag([], lcg(1));
    expect(bag.next()).toBeNull();
    expect(bag.next()).toBeNull();
  });
  it('a single-line pool repeats that line (nothing else to say)', () => {
    const bag = new LineBag(['only'], lcg(1));
    expect(bag.next()).toBe('only');
    expect(bag.next()).toBe('only');
  });
  it('does not mutate the source pool', () => {
    const lines = ['a', 'b', 'c'];
    const bag = new LineBag(lines, lcg(5));
    for (let i = 0; i < 6; i++) bag.next();
    expect(lines).toEqual(['a', 'b', 'c']);
  });
});

describe('BanterDirector: activity and area barks', () => {
  it('says nothing while inactive', () => {
    const d = new BanterDirector(LINES, lcg(1), QUIET_ELAPSED);
    expect(d.area('ford')).toBeNull();
    expect(d.combat('start')).toBeNull();
    expect(d.tick(1000)).toBeNull();
  });
  it('barks an area line immediately when allowed', () => {
    const d = director();
    const b = d.area('ford');
    expect(b?.trigger).toBe('area');
    expect(LINES.area.ford).toContain(b?.lineKey);
  });
  it('knows only known places, and not empty pools', () => {
    const d = director();
    expect(d.area('nowhere')).toBeNull();
    expect(d.area('empty')).toBeNull();
    expect(d.area('toString')).toBeNull();
    // and those misses did not use up the cooldown
    expect(d.area('ford')).not.toBeNull();
  });
  it('does not repeat a place within 600 s, then does after', () => {
    const d = director();
    expect(d.area('ford')).not.toBeNull();
    expect(d.area('ford')).toBeNull();
    d.tick(599);
    expect(d.area('ford')).toBeNull();
    d.tick(1);
    expect(d.area('ford')).not.toBeNull();
  });
  it('a refused repeat is not queued for later', () => {
    const d = director();
    d.area('ford');
    expect(d.area('ford')).toBeNull();
    for (let i = 0; i < 100; i++) expect(d.tick(1)).toBeNull();
  });
  it('different places share the global cooldown', () => {
    const d = director();
    expect(d.area('ford')).not.toBeNull();
    expect(d.area('road')).toBeNull();
  });
  it('going inactive drops a pending area bark', () => {
    const d = director();
    d.combat('start');
    d.tick(10);
    d.area('ford'); // pending
    d.setActive(false);
    d.setActive(true);
    expect(d.tick(40)).toBeNull();
  });
});

describe('BanterDirector: cooldown', () => {
  it('the global 45 s cooldown drops a combat bark (and does not queue it)', () => {
    const d = director();
    expect(d.area('ford')).not.toBeNull();
    d.tick(10);
    expect(d.combat('start')).toBeNull();
    expect(d.tick(35)).toBeNull();
    expect(d.combat('start')).not.toBeNull();
  });
  it('a dropped combat bark does not extend the cooldown', () => {
    const d = director();
    d.combat('start');
    d.tick(40);
    d.combat('end');
    d.tick(5);
    expect(d.combat('end')).not.toBeNull();
  });
  it('an area bark during cooldown waits and fires when the cooldown ends if within 8 s', () => {
    const d = director();
    d.combat('start');
    d.tick(40);
    expect(d.area('ford')).toBeNull();
    expect(d.tick(4)).toBeNull();
    const b = d.tick(1);
    expect(b?.trigger).toBe('area');
  });
  it('an area bark waiting more than 8 s is dropped', () => {
    const d = director();
    d.combat('start');
    d.tick(10);
    expect(d.area('ford')).toBeNull();
    expect(d.tick(35)).toBeNull();
    for (let i = 0; i < 20; i++) expect(d.tick(1)).toBeNull();
  });
  it('a pending area bark is said once only', () => {
    const d = director();
    d.combat('start');
    d.tick(44);
    d.area('ford');
    expect(d.tick(1)?.trigger).toBe('area');
    expect(d.tick(1)).toBeNull();
  });
  it('a pending area bark outranks an elapsed bark that is also due', () => {
    const d = new BanterDirector(LINES, () => 0, tuned(50, 50));
    d.setActive(true);
    d.combat('start'); // cooldown to 45
    d.tick(44);
    d.area('ford');
    expect(d.tick(6)?.trigger).toBe('area');
  });
  it('combat start and end both use their own pools', () => {
    const d = director();
    expect(LINES.combatStart).toContain(d.combat('start')?.lineKey);
    d.tick(45);
    const e = d.combat('end');
    expect(e?.trigger).toBe('combatEnd');
    expect(LINES.combatEnd).toContain(e?.lineKey);
  });
  it('an empty pool says nothing and does not start a cooldown', () => {
    const d = director(QUIET_ELAPSED, { ...LINES, combatEnd: [] });
    expect(d.combat('end')).toBeNull();
    expect(d.combat('start')).not.toBeNull();
  });
});

describe('BanterDirector: suppression', () => {
  it.each(['dialogue', 'cutscene', 'modal:inventory', 'death'])('%s blocks barks and releasing it allows them', (reason) => {
    const d = director();
    d.suppress(reason, true);
    expect(d.suppressed).toBe(true);
    expect(d.combat('start')).toBeNull();
    d.suppress(reason, false);
    expect(d.suppressed).toBe(false);
    expect(d.combat('start')).not.toBeNull();
  });
  it('several reasons are independent', () => {
    const d = director();
    d.suppress('modal:a', true);
    d.suppress('modal:b', true);
    d.suppress('modal:a', false);
    expect(d.suppressed).toBe(true);
    d.suppress('modal:b', false);
    expect(d.suppressed).toBe(false);
  });
  it('setting the same reason twice and releasing once is enough; releasing an unknown reason is harmless', () => {
    const d = director();
    d.suppress('dialogue', true);
    d.suppress('dialogue', true);
    d.suppress('dialogue', false);
    expect(d.suppressed).toBe(false);
    expect(() => d.suppress('never-set', false)).not.toThrow();
  });
  it('an area bark held back by dialogue fires if it is released within 8 s, else is dropped', () => {
    const a = director();
    a.suppress('dialogue', true);
    expect(a.area('ford')).toBeNull();
    a.tick(3);
    a.suppress('dialogue', false);
    expect(a.tick(1)?.trigger).toBe('area');

    const b = director();
    b.suppress('dialogue', true);
    b.area('ford');
    b.tick(9);
    b.suppress('dialogue', false);
    expect(b.tick(1)).toBeNull();
  });
});

describe('BanterDirector: bosses', () => {
  it('bossStarted suppresses; bossEnded keeps quiet 3 s more', () => {
    const d = director();
    d.bossStarted('a');
    expect(d.suppressed).toBe(true);
    expect(d.combat('start')).toBeNull();
    d.bossEnded('a');
    expect(d.suppressed).toBe(true);
    d.tick(2.9);
    expect(d.suppressed).toBe(true);
    d.tick(0.2);
    expect(d.suppressed).toBe(false);
    expect(d.combat('start')).not.toBeNull();
  });
  it('two bosses need both ended', () => {
    const d = director();
    d.bossStarted('a');
    d.bossStarted('b');
    d.bossEnded('a');
    d.tick(10);
    expect(d.suppressed).toBe(true);
    d.bossEnded('b');
    expect(d.suppressed).toBe(true);
    d.tick(3.1);
    expect(d.suppressed).toBe(false);
  });
  it('bossEnded of an unknown id does nothing', () => {
    const d = director();
    d.bossEnded('ghost');
    expect(d.suppressed).toBe(false);
    d.bossStarted('a');
    d.bossEnded('ghost');
    expect(d.suppressed).toBe(true);
    d.bossEnded('a');
    d.bossEnded('a'); // second end does not restart the quiet period
    d.tick(3.1);
    expect(d.suppressed).toBe(false);
  });
  it('a bark that fell due during a boss intro fires after the boss quiet ends', () => {
    const d = new BanterDirector(LINES, () => 0, tuned(100, 100));
    d.setActive(true);
    d.bossStarted('a');
    expect(d.tick(100)).toBeNull();
    expect(d.tick(50)).toBeNull();
    d.bossEnded('a');
    expect(d.tick(2.9)).toBeNull();
    expect(d.tick(0.2)?.trigger).toBe('elapsed');
  });
  it('saveLoaded clears boss and death suppression and the boss quiet period', () => {
    const d = director();
    d.bossStarted('a');
    d.suppress('death', true);
    d.saveLoaded();
    expect(d.suppressed).toBe(false);

    d.bossStarted('b');
    d.bossEnded('b');
    expect(d.suppressed).toBe(true);
    d.saveLoaded();
    expect(d.suppressed).toBe(false);
  });
  it('saveLoaded leaves other suppressions (a dialogue) alone and drops a pending area bark', () => {
    const d = director();
    d.suppress('dialogue', true);
    d.area('ford');
    d.saveLoaded();
    expect(d.suppressed).toBe(true);
    d.suppress('dialogue', false);
    expect(d.tick(1)).toBeNull();
  });
});

describe('BanterDirector: elapsed barks', () => {
  it('fires at 360 s with the lowest roll and 540 s with the highest', () => {
    for (const [roll, at] of [
      [0, 360],
      [1, 540],
    ] as const) {
      const d = new BanterDirector(LINES, () => roll);
      d.setActive(true);
      expect(d.tick(at - 1)).toBeNull();
      const b = d.tick(1);
      expect(b?.trigger).toBe('elapsed');
      expect(LINES.elapsed).toContain(b?.lineKey);
    }
  });
  it('always fires between 360 and 540 s of active time, whatever the roll', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const d = new BanterDirector(LINES, lcg(seed));
      d.setActive(true);
      let t = 0;
      let bark = null;
      while (!bark && t < 600) {
        bark = d.tick(1);
        t++;
      }
      expect(bark).not.toBeNull();
      expect(t).toBeGreaterThanOrEqual(360);
      expect(t).toBeLessThanOrEqual(541);
    }
  });
  it('rolls out-of-range rng values back into range', () => {
    const lo = new BanterDirector(LINES, () => -5);
    lo.setActive(true);
    expect(lo.tick(359)).toBeNull();
    expect(lo.tick(1)).not.toBeNull();
    const hi = new BanterDirector(LINES, () => 9);
    hi.setActive(true);
    expect(hi.tick(539)).toBeNull();
    expect(hi.tick(1)).not.toBeNull();
  });
  it('the elapsed timer does not advance while inactive', () => {
    const d = new BanterDirector(LINES, () => 0);
    d.setActive(true);
    d.tick(300);
    d.setActive(false);
    expect(d.tick(1000)).toBeNull();
    d.setActive(true);
    expect(d.tick(59)).toBeNull();
    expect(d.tick(1)?.trigger).toBe('elapsed');
  });
  it('any bark resets the elapsed timer', () => {
    const d = new BanterDirector(LINES, () => 0);
    d.setActive(true);
    d.tick(350);
    expect(d.combat('start')).not.toBeNull();
    expect(d.tick(359)).toBeNull();
    expect(d.tick(1)?.trigger).toBe('elapsed');
  });
  it('after an elapsed bark the next one needs a fresh interval', () => {
    const d = new BanterDirector(LINES, () => 0);
    d.setActive(true);
    d.tick(360);
    for (let i = 0; i < 359; i++) expect(d.tick(1)).toBeNull();
    expect(d.tick(1)?.trigger).toBe('elapsed');
  });
  it('waits out the cooldown if it falls due inside one', () => {
    const d = new BanterDirector(LINES, () => 0, tuned(20, 20));
    d.setActive(true);
    d.combat('start'); // resets timer to 20 s, cooldown 45 s
    expect(d.tick(30)).toBeNull();
    expect(d.tick(14)).toBeNull();
    expect(d.tick(1)?.trigger).toBe('elapsed');
  });
  it('tick with dt <= 0 or NaN does nothing', () => {
    const d = new BanterDirector(LINES, () => 0);
    d.setActive(true);
    for (const dt of [0, -10, NaN]) expect(d.tick(dt)).toBeNull();
    expect(d.tick(359)).toBeNull();
    expect(d.tick(1)).not.toBeNull();
  });
  it('an empty elapsed pool says nothing', () => {
    const d = new BanterDirector({ ...LINES, elapsed: [] }, () => 0);
    d.setActive(true);
    expect(d.tick(400)).toBeNull();
  });
});
