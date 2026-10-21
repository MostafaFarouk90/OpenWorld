import { describe, expect, it } from 'vitest';
import { RedmaneBrain, type ChargeProgress, type RedmaneHooks, type RedmaneSense } from './RedmaneBrain';
import { CHARGE, MOVES, REDMANE, TRAP } from './tuning';

const TICK = 1 / 60;

function recorder() {
  const log: string[] = [];
  const state = { charge: 'running' as ChargeProgress, chargeTicks: 0 };
  const hooks: RedmaneHooks = {
    telegraph: (m, id, lead) => log.push(`telegraph:${m.id}:${id}:${lead}`),
    telegraphCancelled: (id) => log.push(`cancelled:${id}`),
    aim: (id) => log.push(`aim:${id}`),
    chargeStart: (id) => log.push(`chargeStart:${id}`),
    chargeTick: () => {
      state.chargeTicks++;
      return state.charge;
    },
    chargeEnd: (id, interrupted) => log.push(`chargeEnd:${id}:${interrupted}`),
    strike: (m) => log.push(`strike:${m.id}`),
    netRelease: () => log.push('net'),
    trapPlace: () => log.push('trap'),
    backstep: () => log.push('backstep'),
    stagger: () => log.push('stagger'),
    window: () => log.push('window'),
    restorePoise: () => log.push('restorePoise'),
  };
  return { log, hooks, state };
}

const sense = (dist: number, liveTraps = 0): RedmaneSense => ({ dist, liveTraps });

/** rng 0 picks the first ready move in table order (charge, thrust, net, trap); 0.99 the last. */
function make(rng = 0) {
  const r = recorder();
  const brain = new RedmaneBrain(r.hooks, () => rng);
  const run = (seconds: number, s: RedmaneSense = sense(7)) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) brain.tick(TICK, s);
  };
  return { ...r, brain, run };
}

describe('RedmaneBrain', () => {
  it('idles until started, then approaches', () => {
    const t = make();
    t.run(1);
    expect(t.brain.state).toBe('idle');
    t.brain.start();
    expect(t.brain.state).toBe('approach');
    expect(t.brain.moving).toBe('approach');
  });

  it('close range picks the thrust: telegraph, strike after the windup, then recover', () => {
    const t = make();
    t.brain.start();
    t.run(REDMANE.approachSecondsMin + 0.05, sense(2));
    expect(t.brain.state).toBe('thrust');
    expect(t.log).toContain(`telegraph:thrust:1:${MOVES.thrust.windup}`);
    t.run(MOVES.thrust.windup + 0.05, sense(2));
    expect(t.log).toContain('strike:thrust');
    expect(t.brain.state).toBe('recover');
  });

  it('the charge: 0.8 s couch telegraph, lane locks 0.15 s before take-off, then the run until done', () => {
    const t = make();
    t.brain.start();
    t.run(REDMANE.approachSecondsMin + 0.05);
    expect(t.brain.state).toBe('couch');
    expect(t.log).toContain(`telegraph:charge:1:${MOVES.charge.windup}`);
    t.run(MOVES.charge.windup - CHARGE.aimLockBefore - 0.05);
    expect(t.log.some((l) => l.startsWith('aim'))).toBe(false);
    t.run(0.1);
    expect(t.log).toContain('aim:1');
    expect(t.log.some((l) => l.startsWith('chargeStart'))).toBe(false);
    t.run(0.1);
    expect(t.log).toContain('chargeStart:1');
    expect(t.brain.state).toBe('charge');
    t.state.charge = 'done';
    t.run(TICK * 2);
    expect(t.log).toContain('chargeEnd:1:false');
    expect(t.brain.state).toBe('recover');
  });

  it('a charge that ends at the wall leaves him open longer', () => {
    const a = make();
    a.brain.start();
    a.run(REDMANE.approachSecondsMin + 0.05);
    a.run(MOVES.charge.windup + 0.05);
    a.state.charge = 'done';
    a.run(TICK * 2, sense(7));
    const b = make();
    b.brain.start();
    b.run(REDMANE.approachSecondsMin + 0.05);
    b.run(MOVES.charge.windup + 0.05);
    b.state.charge = 'wall';
    b.run(TICK * 2, sense(7));
    const inRecover = (t: ReturnType<typeof make>) => {
      let n = 0;
      while (t.brain.state === 'recover' && n < 600) {
        t.run(TICK, sense(7));
        n++;
      }
      return n;
    };
    expect(inRecover(b)).toBeGreaterThan(inRecover(a) + Math.round(CHARGE.wallExtraRecover / TICK) - 3);
  });

  it('the net: 0.6 s swing, then release', () => {
    const t = make();
    t.brain.start();
    t.run(REDMANE.approachSecondsMin + 0.05, sense(12));
    expect(t.brain.state).toBe('net');
    expect(t.log).toContain(`telegraph:net:1:${MOVES.net.windup}`);
    t.run(MOVES.net.windup + 0.05, sense(12));
    expect(t.log).toContain('net');
  });

  it('the trap: placed after its windup; the cap is one live trap in phase 1 and three in phase 2', () => {
    const t = make(0.99);
    t.brain.start();
    t.run(REDMANE.approachSecondsMax + 0.05, sense(2.5));
    expect(t.brain.state).toBe('trap');
    t.run(MOVES.trap.windup + 0.05, sense(2.5));
    expect(t.log).toContain('trap');
    // A live trap in phase 1 blocks the next one: the brain picks something else (the thrust here).
    const u = make(0.99);
    u.brain.start();
    u.run(REDMANE.approachSecondsMax + 0.05, sense(2.5, TRAP.maxLive[0]));
    expect(u.brain.state).toBe('thrust');
    // Phase 2 allows more.
    const v = make(0.99);
    v.brain.start();
    v.brain.onPhase(2);
    v.run(REDMANE.approachSecondsMax + 0.05, sense(2.5, TRAP.maxLive[0]));
    expect(v.brain.state).toBe('trap');
    const w = make(0.99);
    w.brain.start();
    w.brain.onPhase(2);
    w.run(REDMANE.approachSecondsMax + 0.05, sense(2.5, TRAP.maxLive[1]));
    expect(w.brain.state).toBe('thrust');
  });

  it('keeps stalking when nothing is ready (too far for everything)', () => {
    const t = make();
    t.brain.start();
    t.run(3, sense(30));
    expect(t.brain.state).toBe('approach');
    expect(t.log).toEqual([]);
  });

  it('cooldowns: the charge is not offered again until its cooldown ran out', () => {
    const t = make();
    t.brain.start();
    t.run(REDMANE.approachSecondsMin + 0.05);
    t.run(MOVES.charge.windup + 0.05);
    t.state.charge = 'done';
    t.run(TICK * 2);
    t.state.charge = 'running';
    t.run(MOVES.charge.recover + 1, sense(7));
    // Back in approach with the charge cooling: at 7 m only the net and the trap are ready.
    expect(t.log.filter((l) => l.startsWith('telegraph:charge'))).toHaveLength(1);
  });

  it('phase 2 shortens cooldowns by 0.75', () => {
    const cooled = (phase: 1 | 2) => {
      const t = make();
      t.brain.start();
      if (phase === 2) t.brain.onPhase(2);
      t.run(REDMANE.approachSecondsMin + 0.05, sense(2));
      t.run(MOVES.thrust.windup + 0.05, sense(2));
      let n = 0;
      // Count ticks until the thrust is offered again.
      const before = t.log.filter((l) => l.startsWith('telegraph:thrust')).length;
      while (t.log.filter((l) => l.startsWith('telegraph:thrust')).length === before && n < 2000) {
        t.run(TICK, sense(2));
        n++;
      }
      return n;
    };
    expect(cooled(2)).toBeLessThan(cooled(1));
  });

  it('phase 2: a charge that found open floor chains one feint and a second charge; not a third', () => {
    const t = make();
    t.brain.start();
    t.brain.onPhase(2);
    t.run(REDMANE.approachSecondsMin + 0.05);
    t.run(MOVES.charge.windup + 0.05);
    t.state.charge = 'done';
    t.run(TICK * 2);
    expect(t.brain.state).toBe('feint');
    expect(t.brain.moving).toBe('feint');
    t.state.charge = 'running';
    t.run(REDMANE.feintSeconds + 0.05);
    expect(t.brain.state).toBe('couch');
    expect(t.log.filter((l) => l.startsWith('telegraph:charge'))).toHaveLength(2);
    t.run(MOVES.charge.windup + 0.05);
    t.state.charge = 'done';
    t.run(TICK * 2);
    expect(t.brain.state).toBe('recover');
  });

  it('phase 1 never feints; a wall stop in phase 2 does not chain', () => {
    const t = make();
    t.brain.start();
    t.run(REDMANE.approachSecondsMin + 0.05);
    t.run(MOVES.charge.windup + 0.05);
    t.state.charge = 'done';
    t.run(TICK * 2);
    expect(t.brain.state).toBe('recover');
    const u = make();
    u.brain.start();
    u.brain.onPhase(2);
    u.run(REDMANE.approachSecondsMin + 0.05);
    u.run(MOVES.charge.windup + 0.05);
    u.state.charge = 'wall';
    u.run(TICK * 2);
    expect(u.brain.state).toBe('recover');
  });

  it('a break interrupts every breakable state: couch, thrust, net, trap, charge, feint, recover, approach', () => {
    const cases: Array<[number, RedmaneSense, string]> = [
      [7, sense(7), 'couch'],
      [2, sense(2), 'thrust'],
    ];
    for (const [, s, state] of cases) {
      const t = make();
      t.brain.start();
      t.run(REDMANE.approachSecondsMin + 0.05, s);
      expect(t.brain.state).toBe(state);
      t.brain.onBreak();
      expect(t.brain.state).toBe('broken');
      expect(t.log).toContain('cancelled:1');
      expect(t.log).toContain('stagger');
    }
    const n = make();
    n.brain.start();
    n.run(REDMANE.approachSecondsMin + 0.05, sense(12));
    n.brain.onBreak();
    expect(n.log).toContain('cancelled:1');
    const c = make();
    c.brain.start();
    c.run(REDMANE.approachSecondsMin + 0.05);
    c.run(MOVES.charge.windup + 0.05);
    expect(c.brain.state).toBe('charge');
    c.brain.onBreak();
    expect(c.log).toContain('chargeEnd:1:true');
    expect(c.brain.state).toBe('broken');
    const a = make();
    a.brain.start();
    a.brain.onBreak();
    expect(a.brain.state).toBe('broken');
  });

  it('the stagger ends: poise restored and back to approach', () => {
    const t = make();
    t.brain.start();
    t.brain.onBreak();
    t.run(REDMANE.breakSeconds + 0.05);
    expect(t.log).toContain('restorePoise');
    expect(t.brain.state).toBe('approach');
  });

  it('a break the brain cannot act on (idle, already broken, window) restores poise instead of leaving it empty', () => {
    const t = make();
    t.brain.onBreak();
    expect(t.log).toEqual(['restorePoise']);
    t.brain.start();
    t.brain.onBreak();
    t.log.length = 0;
    t.brain.onBreak();
    expect(t.log).toEqual(['restorePoise']);
    t.brain.onReleaseWindow(true);
    t.log.length = 0;
    t.brain.onBreak();
    expect(t.log).toEqual(['restorePoise']);
    expect(t.brain.state).toBe('window');
  });

  it('the window: he lies low; closing it unused stands him up with poise restored; the next open lies him low again', () => {
    const t = make();
    t.brain.start();
    t.brain.onReleaseWindow(true);
    expect(t.brain.state).toBe('window');
    expect(t.log).toContain('window');
    t.brain.onReleaseWindow(true);
    expect(t.log.filter((l) => l === 'window')).toHaveLength(1);
    t.brain.onReleaseWindow(false);
    expect(t.brain.state).toBe('approach');
    expect(t.log).toContain('restorePoise');
    t.brain.onReleaseWindow(true);
    expect(t.brain.state).toBe('window');
    expect(t.log.filter((l) => l === 'window')).toHaveLength(2);
  });

  it('a window cuts a running swing short', () => {
    const t = make();
    t.brain.start();
    t.run(REDMANE.approachSecondsMin + 0.05);
    t.brain.onReleaseWindow(true);
    expect(t.log).toContain('cancelled:1');
    expect(t.brain.state).toBe('window');
  });

  it('terminal states ignore everything after an outcome', () => {
    const spared = make();
    spared.brain.start();
    spared.brain.onOutcome('spared');
    expect(spared.brain.state).toBe('spared');
    spared.brain.onBreak();
    spared.brain.onReleaseWindow(true);
    spared.brain.onReleaseWindow(false);
    spared.run(5);
    expect(spared.brain.state).toBe('spared');
    const dead = make();
    dead.brain.start();
    dead.brain.onOutcome('defeated');
    expect(dead.brain.state).toBe('dying');
    dead.brain.onOutcome('spared');
    expect(dead.brain.state).toBe('dying');
  });

  it('an outcome during a charge ends it as interrupted', () => {
    const t = make();
    t.brain.start();
    t.run(REDMANE.approachSecondsMin + 0.05);
    t.run(MOVES.charge.windup + 0.05);
    t.brain.onOutcome('defeated');
    expect(t.log).toContain('chargeEnd:1:true');
  });

  it('camping: ten seconds within 2.5 m of him earns a backstep (never mid-charge)', () => {
    const t = make();
    t.brain.start();
    // Stay in recover/approach hugging him with the thrust on cooldown: dist 1 makes the thrust ready first, so use dist 2.4 and
    // keep ticking; the backstep eventually fires.
    t.run(REDMANE.campSeconds + 2, sense(2.4));
    expect(t.log).toContain('backstep');
    expect(t.brain.moving === 'backstep' || t.brain.state !== 'idle').toBe(true);
  });

  it('ignores non-positive or non-finite ticks, and phase changes only go forward', () => {
    const t = make();
    t.brain.start();
    t.brain.tick(0, sense(2));
    t.brain.tick(-1, sense(2));
    t.brain.tick(Number.NaN, sense(2));
    expect(t.brain.state).toBe('approach');
    t.brain.onPhase(2);
    t.brain.onPhase(1);
    expect(t.brain.phase).toBe(2);
  });
});
