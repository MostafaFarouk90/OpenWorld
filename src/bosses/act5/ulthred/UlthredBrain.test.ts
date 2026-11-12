import { describe, expect, it } from 'vitest';
import { BREAK_SECONDS, UlthredBrain, type UlthredHooks } from './UlthredBrain';
import { CHAINS, FORGEFIRE, SLAM, SWEEP } from './tuning';

function rig() {
  const calls: string[] = [];
  const hooks: UlthredHooks = {
    telegraph: (m) => calls.push(`tell:${m.attackId}`),
    slam: (_s, len) => calls.push(`slam:${len}`),
    sweep: () => calls.push('sweep'),
    forgefire: () => calls.push('fire'),
    chains: () => calls.push('chains'),
    stagger: () => calls.push('stagger'),
    kneel: () => calls.push('kneel'),
  };
  const brain = new UlthredBrain(hooks);
  const run = (seconds: number, dist: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) brain.tick(1 / 60, { dist });
  };
  return { brain, calls, run };
}

describe('UlthredBrain', () => {
  it('approaches, tells the slam for 1.2 s, slams, and holds the hammer stuck (phase 1 poise window)', () => {
    const { brain, calls, run } = rig();
    brain.start();
    run(SLAM.gapSeconds + 0.05, 12);
    expect(brain.state).toBe('approach');
    run(0.05, 5);
    expect(brain.state).toBe('slamTell');
    expect(calls).toContain(`tell:${SLAM.attackId}`);
    run(SLAM.windupSeconds - 0.1, 5);
    expect(calls.some((c) => c.startsWith('slam:'))).toBe(false);
    run(0.15, 5);
    expect(calls).toContain(`slam:${SLAM.length[0]}`);
    expect(brain.stuck).toBe(true);
    run(SLAM.stuckSeconds + 0.05, 5);
    expect(brain.stuck).toBe(false);
  });

  it('sweeps a Cael who hugs him (not in phase 2)', () => {
    const { brain, calls, run } = rig();
    brain.start();
    run(SLAM.gapSeconds + SWEEP.windupSeconds + 0.1, 1.5);
    expect(calls).toEqual([`tell:${SWEEP.attackId}`, 'sweep']);
    brain.setPhase(2);
    calls.length = 0;
    run(3, 1.5);
    expect(calls).not.toContain('sweep');
  });

  it('phase 2: slams across the ring from where he stands and jets forge-fire every 7 s; phase 3: chains every 9 s', () => {
    const { brain, calls, run } = rig();
    brain.start();
    brain.setPhase(2);
    run(FORGEFIRE.everySeconds + 7, 15);
    expect(calls).toContain(`slam:${SLAM.length[1]}`);
    expect(calls).toContain('fire');
    brain.setPhase(3);
    calls.length = 0;
    run(CHAINS.everySeconds + 7, 4);
    expect(calls).toContain('chains');
    expect(calls).toContain(`slam:${SLAM.length[2]}`);
  });

  it('a break staggers him; the drop and the kneel hold him (invulnerable) until released', () => {
    const { brain, calls, run } = rig();
    brain.start();
    brain.onBreak();
    expect(calls).toEqual(['stagger']);
    expect(brain.state).toBe('broken');
    run(BREAK_SECONDS + 0.05, 5);
    expect(brain.state).toBe('idle');
    brain.onDrop();
    expect(brain.invulnerable).toBe(true);
    run(10, 5);
    expect(brain.state).toBe('drop');
    brain.onBreak();
    expect(brain.state).toBe('drop');
    brain.onDropDone();
    expect(brain.state).toBe('idle');
    brain.onKneel();
    expect(brain.invulnerable).toBe(true);
    run(10, 1);
    expect(brain.state).toBe('kneel');
  });

  it('edge: nothing ticks before start, and a zero or bad dt is ignored', () => {
    const { brain, calls, run } = rig();
    run(5, 1);
    expect(calls).toEqual([]);
    brain.start();
    brain.tick(0, { dist: 1 });
    brain.tick(Number.NaN, { dist: 1 });
    expect(brain.state).toBe('idle');
  });
});
