import { describe, expect, it } from 'vitest';
import { SlagmawBrain, type SlagmawHooks, type SlagmawSense } from './SlagmawBrain';
import { CYCLE, SLAGMAW } from './tuning';

const TICK = 1 / 60;

function recorder() {
  const log: string[] = [];
  const hooks: SlagmawHooks = {
    tremor: (id, lead, chained) => log.push(`tremor:${id}:${lead}:${chained}`),
    aim: (id) => log.push(`aim:${id}`),
    erupt: (id) => log.push(`erupt:${id}`),
    spit: () => log.push('spit'),
    tremorCancelled: (id) => log.push(`cancelled:${id}`),
    submerge: () => log.push('submerge'),
    submerged: () => log.push('submerged'),
    stagger: () => log.push('stagger'),
    restorePoise: () => log.push('restorePoise'),
  };
  return { log, hooks };
}

const sense = (dist = 8): SlagmawSense => ({ dist });

function make(phase = 1) {
  const r = recorder();
  const brain = new SlagmawBrain(r.hooks);
  const run = (seconds: number, s: SlagmawSense = sense()) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) brain.tick(TICK, s);
  };
  for (let p = 2; p <= phase; p++) brain.onPhase(p);
  return { ...r, brain, run };
}

const count = (log: string[], prefix: string) => log.filter((l) => l.startsWith(prefix)).length;

describe('SlagmawBrain', () => {
  it('idles until started, then burrows', () => {
    const t = make();
    t.run(2);
    expect(t.brain.state).toBe('idle');
    expect(t.log).toEqual([]);
    t.brain.start();
    expect(t.brain.state).toBe('burrowed');
    expect(t.brain.exposed).toBe(false);
  });

  it('start only once', () => {
    const t = make();
    t.brain.start();
    t.run(CYCLE.burrowedSeconds[0] + 0.1);
    expect(t.brain.state).toBe('tremor');
    t.brain.start();
    expect(t.brain.state).toBe('tremor');
    expect(count(t.log, 'tremor:')).toBe(1);
  });

  for (const phase of [1, 2, 3]) {
    it(`phase ${phase}: stays burrowed for ${CYCLE.burrowedSeconds[phase - 1]} s, then the tremor starts`, () => {
      const t = make(phase);
      t.brain.start();
      t.run(CYCLE.burrowedSeconds[phase - 1] - 0.1);
      expect(t.brain.state).toBe('burrowed');
      expect(count(t.log, 'tremor:')).toBe(0);
      t.run(0.2);
      expect(t.brain.state).toBe('tremor');
      expect(t.log).toContain(`tremor:1:${CYCLE.tremorSeconds}:false`);
    });

    it(`phase ${phase}: surfaced lasts ${CYCLE.surfacedSeconds[phase - 1]} s, spit cadence, then submerge and burrow`, () => {
      const t = make(phase);
      t.brain.start();
      t.run(CYCLE.burrowedSeconds[phase - 1] + CYCLE.tremorSeconds + 0.05);
      expect(t.log).toContain('erupt:1');
      if (phase === 3) {
        // The chained second tremor follows at once; run through it to the real surface time.
        t.run(CYCLE.tremorSeconds + 0.05);
        expect(t.log).toContain('erupt:2');
      }
      expect(t.brain.state).toBe('surfaced');
      const before = count(t.log, 'spit');
      const every = CYCLE.spitEverySeconds[phase - 1];
      const surfaced = CYCLE.surfacedSeconds[phase - 1];
      t.run(CYCLE.spitFirstSeconds - 0.15);
      expect(count(t.log, 'spit')).toBe(before);
      t.run(0.3);
      expect(count(t.log, 'spit')).toBe(before + 1);
      t.run(every - 0.15 - 0.1);
      expect(count(t.log, 'spit')).toBe(before + 1);
      t.run(0.2);
      expect(count(t.log, 'spit')).toBe(before + 2);
      // Finish the surfaced spell (about spitFirst + every + 0.15 s so far).
      const elapsed = CYCLE.spitFirstSeconds + every + 0.15;
      t.run(surfaced - elapsed - 0.1);
      expect(t.brain.state).toBe('surfaced');
      t.run(0.3);
      expect(t.brain.state).toBe('submerge');
      expect(t.log[t.log.length - 1]).toBe('submerge');
      t.run(CYCLE.submergeSeconds + 0.1);
      expect(t.brain.state).toBe('burrowed');
      expect(t.log[t.log.length - 1]).toBe('submerged');
    });
  }

  it('the tremor lasts 1.2 s, the aim locks before the eruption, the eruption only after the tremor', () => {
    const t = make();
    t.brain.start();
    t.run(CYCLE.burrowedSeconds[0] + 0.02);
    expect(t.brain.state).toBe('tremor');
    t.run(CYCLE.tremorSeconds - CYCLE.aimLockBefore - 0.1);
    expect(count(t.log, 'aim:')).toBe(0);
    t.run(0.2);
    expect(t.log).toContain('aim:1');
    expect(count(t.log, 'erupt:')).toBe(0);
    expect(t.brain.exposed).toBe(false);
    t.run(CYCLE.aimLockBefore - 0.1 - 0.02);
    expect(count(t.log, 'erupt:')).toBe(0);
    t.run(0.2);
    expect(t.log).toContain('erupt:1');
    expect(t.log.indexOf('aim:1')).toBeLessThan(t.log.indexOf('erupt:1'));
    expect(t.log.indexOf('tremor:1:1.2:false')).toBeLessThan(t.log.indexOf('aim:1'));
    expect(t.brain.state).toBe('surfaced');
    expect(t.brain.exposed).toBe(true);
  });

  it('phases 1 and 2 do not chain a second tremor', () => {
    for (const phase of [1, 2]) {
      const t = make(phase);
      t.brain.start();
      t.run(CYCLE.burrowedSeconds[phase - 1] + CYCLE.tremorSeconds + 1);
      expect(t.brain.state).toBe('surfaced');
      expect(count(t.log, 'tremor:')).toBe(1);
    }
  });

  it('phase 3 chains a second tremor with no surface time, and does not chain forever', () => {
    const t = make(3);
    t.brain.start();
    t.run(CYCLE.burrowedSeconds[2] + CYCLE.tremorSeconds + 0.05);
    expect(t.log).toContain('erupt:1');
    t.run(TICK * 3);
    expect(t.log).toContain(`tremor:2:${CYCLE.tremorSeconds}:true`);
    expect(count(t.log, 'spit')).toBe(0);
    expect(t.brain.state).toBe('tremor');
    // The worm went under between the two strikes.
    expect(t.log.indexOf('erupt:1')).toBeLessThan(t.log.indexOf('submerged'));
    expect(t.log.indexOf('submerged')).toBeLessThan(t.log.indexOf('tremor:2:1.2:true'));
    t.run(CYCLE.tremorSeconds + 0.05);
    expect(t.log).toContain('erupt:2');
    t.run(TICK * 5);
    expect(t.brain.state).toBe('surfaced');
    expect(count(t.log, 'tremor:')).toBe(2);
    // Second eruption is followed by a real surfaced spell with spits, not a third tremor.
    t.run(CYCLE.surfacedSeconds[2] - 0.2);
    expect(t.brain.state).toBe('surfaced');
    expect(count(t.log, 'spit')).toBeGreaterThan(0);
    expect(count(t.log, 'tremor:')).toBe(2);
  });

  it('phase 3 chains again on the next cycle', () => {
    const t = make(3);
    t.brain.start();
    t.run(60);
    expect(count(t.log, 'tremor:')).toBeGreaterThanOrEqual(4);
    expect(t.log.filter((l) => l.endsWith(':true')).length).toBeGreaterThanOrEqual(2);
    const tremors = t.log.filter((l) => l.startsWith('tremor:'));
    expect(tremors[0].endsWith(':false')).toBe(true);
    expect(tremors[1].endsWith(':true')).toBe(true);
    expect(tremors[2].endsWith(':false')).toBe(true);
  });

  it('spits wait while the player is too close', () => {
    const t = make();
    t.brain.start();
    t.run(CYCLE.burrowedSeconds[0] + CYCLE.tremorSeconds + 0.05);
    t.run(CYCLE.spitFirstSeconds + 1, sense(1));
    expect(count(t.log, 'spit')).toBe(0);
    t.run(0.2, sense(8));
    expect(count(t.log, 'spit')).toBe(1);
  });

  it('a break in the tremor cancels it, staggers, and no eruption follows', () => {
    const t = make();
    t.brain.start();
    t.run(CYCLE.burrowedSeconds[0] + 0.3);
    expect(t.brain.state).toBe('tremor');
    t.brain.onBreak();
    expect(t.log).toContain('cancelled:1');
    expect(t.log[t.log.length - 1]).toBe('stagger');
    expect(t.brain.state).toBe('broken');
    expect(t.brain.exposed).toBe(true);
    t.run(CYCLE.tremorSeconds);
    expect(count(t.log, 'aim:')).toBe(0);
    expect(count(t.log, 'erupt:')).toBe(0);
  });

  it('a break while surfaced staggers without cancelling a tremor', () => {
    const t = make();
    t.brain.start();
    t.run(CYCLE.burrowedSeconds[0] + CYCLE.tremorSeconds + 0.5);
    expect(t.brain.state).toBe('surfaced');
    t.brain.onBreak();
    expect(t.brain.state).toBe('broken');
    expect(count(t.log, 'cancelled')).toBe(0);
    expect(count(t.log, 'stagger')).toBe(1);
  });

  it('a break while burrowed brings him up stunned', () => {
    const t = make();
    t.brain.start();
    t.run(1);
    t.brain.onBreak();
    expect(t.brain.state).toBe('broken');
    expect(t.brain.exposed).toBe(true);
    expect(count(t.log, 'stagger')).toBe(1);
  });

  it('a break in phase 3 between chained strikes clears the chain', () => {
    const t = make(3);
    t.brain.start();
    t.run(CYCLE.burrowedSeconds[2] + CYCLE.tremorSeconds + 0.02);
    expect(t.brain.state).toBe('surfaced');
    t.brain.onBreak();
    t.run(0.5);
    expect(count(t.log, 'tremor:')).toBe(1);
    expect(t.brain.state).toBe('broken');
  });

  it('a break while already broken only restores poise', () => {
    const t = make();
    t.brain.start();
    t.run(1);
    t.brain.onBreak();
    t.run(1);
    t.brain.onBreak();
    expect(count(t.log, 'stagger')).toBe(1);
    expect(count(t.log, 'restorePoise')).toBe(1);
    expect(t.brain.state).toBe('broken');
  });

  it('the break stun lasts SLAGMAW.breakSeconds, then poise is restored and he submerges', () => {
    const t = make();
    t.brain.start();
    t.run(1);
    t.brain.onBreak();
    t.run(SLAGMAW.breakSeconds - 0.1);
    expect(t.brain.state).toBe('broken');
    expect(count(t.log, 'restorePoise')).toBe(0);
    t.run(0.2);
    expect(t.brain.state).toBe('submerge');
    expect(t.log).toContain('restorePoise');
    expect(t.log[t.log.length - 1]).toBe('submerge');
    t.run(CYCLE.submergeSeconds + 0.1);
    expect(t.brain.state).toBe('burrowed');
    expect(t.log[t.log.length - 1]).toBe('submerged');
    expect(t.brain.exposed).toBe(false);
  });

  it('after a break the cycle resumes with a tremor', () => {
    const t = make();
    t.brain.start();
    t.run(1);
    t.brain.onBreak();
    t.run(SLAGMAW.breakSeconds + CYCLE.submergeSeconds + CYCLE.burrowedSeconds[0] + 0.2);
    expect(t.brain.state).toBe('tremor');
  });

  it('onPhase only moves forward', () => {
    const t = make();
    expect(t.brain.phase).toBe(1);
    t.brain.onPhase(2);
    expect(t.brain.phase).toBe(2);
    t.brain.onPhase(1);
    expect(t.brain.phase).toBe(2);
    t.brain.onPhase(2);
    expect(t.brain.phase).toBe(2);
    t.brain.onPhase(3);
    expect(t.brain.phase).toBe(3);
    t.brain.onPhase(2);
    expect(t.brain.phase).toBe(3);
  });

  it('a new phase shortens the next burrowed time', () => {
    const t = make();
    t.brain.start();
    t.brain.onPhase(2);
    t.run(CYCLE.burrowedSeconds[1] + 0.05);
    expect(t.brain.state).toBe('tremor');
  });

  it('onDefeated mid-tremor cancels it and is terminal', () => {
    const t = make();
    t.brain.start();
    t.run(CYCLE.burrowedSeconds[0] + 0.3);
    t.brain.onDefeated();
    expect(t.log).toContain('cancelled:1');
    expect(t.brain.state).toBe('dying');
    const len = t.log.length;
    t.run(20);
    t.brain.onBreak();
    t.brain.onPhase(3);
    t.brain.start();
    t.brain.onDefeated();
    expect(t.log.length).toBe(len);
    expect(t.brain.state).toBe('dying');
    expect(t.brain.phase).toBe(1);
    expect(t.brain.exposed).toBe(false);
  });

  it('onDefeated outside a tremor does not cancel anything', () => {
    const t = make();
    t.brain.start();
    t.run(1);
    t.brain.onDefeated();
    expect(count(t.log, 'cancelled')).toBe(0);
    expect(t.brain.state).toBe('dying');
  });

  it('tick ignores bad dt', () => {
    const t = make();
    t.brain.start();
    for (const dt of [NaN, Infinity, -Infinity, -1, 0]) t.brain.tick(dt, sense());
    t.run(CYCLE.burrowedSeconds[0] - 0.2);
    expect(t.brain.state).toBe('burrowed');
    t.run(0.3);
    expect(t.brain.state).toBe('tremor');
  });

  it('exposed is true only while surfaced or broken', () => {
    const t = make();
    expect(t.brain.exposed).toBe(false);
    t.brain.start();
    expect(t.brain.exposed).toBe(false);
    t.run(CYCLE.burrowedSeconds[0] + 0.3);
    expect(t.brain.state).toBe('tremor');
    expect(t.brain.exposed).toBe(false);
    t.run(CYCLE.tremorSeconds);
    expect(t.brain.exposed).toBe(true);
    t.run(CYCLE.surfacedSeconds[0]);
    expect(t.brain.state).toBe('submerge');
    expect(t.brain.exposed).toBe(false);
  });

  it('swing ids increase with every tremor', () => {
    const t = make();
    t.brain.start();
    t.run(40);
    const ids = t.log.filter((l) => l.startsWith('tremor:')).map((l) => Number(l.split(':')[1]));
    expect(ids.length).toBeGreaterThan(2);
    ids.forEach((id, i) => expect(id).toBe(i + 1));
  });
});
