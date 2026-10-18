import { describe, expect, it } from 'vitest';
import { KinematicPatrol, boxLineOfSight, runScript } from './testing/patrolSim';
import { M09_ENTRY, M09_PATROLS, M09_SCRIPT, M09_SOLIDS } from './testing/m09Fixture';

/** Watch-guard walk speed (thread 5's def; the Blighted Soldier's 1.4 m/s until it lands). */
const GUARD_SPEED = 1.4;
const los = boxLineOfSight(M09_SOLIDS);
const guards = (phase: number) => [new KinematicPatrol(M09_PATROLS.hall, GUARD_SPEED, phase), new KinematicPatrol(M09_PATROLS.stacks, GUARD_SPEED, phase)];

describe('M09 scripted headless route (embers-slice-2.md 3B.2)', () => {
  for (const phase of [-1, -0.5, 0, 0.5, 1]) {
    it(`sneaking the scripted route is never noticed (patrol phase ${phase} s)`, () => {
      const r = runScript(M09_ENTRY, M09_SCRIPT, guards(phase), los);
      expect(r.noticed).toBe(0);
      expect(r.caught).toBe(0);
      expect(r.maxAwareness).toBeLessThan(0.9);
    });
  }

  it('the same route walked upright is noticed (the test can fail)', () => {
    const r = runScript(M09_ENTRY, M09_SCRIPT, guards(0), los, true);
    expect(r.noticed).toBeGreaterThan(0);
  });

  it('skipping the hide spot is noticed (hiding is load-bearing)', () => {
    const noHide = M09_SCRIPT.map((s) => ('wait' in s && s.hidden ? { ...s, hidden: false } : s));
    expect(runScript(M09_ENTRY, noHide, guards(0), los).noticed).toBeGreaterThan(0);
  });

  it('the ledger stacks block sight; an open floor does not', () => {
    expect(los({ x: 15, y: 1.5, z: 4 }, { x: 15, y: 1.1, z: 16 })).toBe(false);
    expect(los({ x: 4, y: 1.5, z: 4 }, { x: 4, y: 1.1, z: 16 })).toBe(true);
    expect(los({ x: 15, y: 3, z: 4 }, { x: 15, y: 2.5, z: 16 })).toBe(true); // above the stacks
  });
});
