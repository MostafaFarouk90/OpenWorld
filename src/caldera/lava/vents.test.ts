// N3 vents: open (cooled) and closed on time over 120 s of fixed ticks, with a wheel and without; the wheel recharges;
// the closing warning; a load resets; two vents are independent.
import { describe, expect, it } from 'vitest';
import { VENT_CLOSED_S, VENT_OPEN_S } from '../lava';
import type { CrustVentDef } from './types';
import { VENT } from './tuning';
import { VentClock, type VentTransition } from './vents';

const DT = 1 / 60;
const def = (id: string, wheel?: string): CrustVentDef => ({
  id,
  at: { x: 0, y: 0, z: 0 },
  openS: VENT_OPEN_S,
  closedS: VENT_CLOSED_S,
  ...(wheel ? { wheel } : {}),
  volumeId: 'v',
  crust: { kind: 'box', x0: -1, z0: -1, x1: 1, z1: 1 },
});

function run(c: VentClock, seconds: number): { t: number; e: VentTransition }[] {
  const out: { t: number; e: VentTransition }[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) for (const e of c.step(DT)) out.push({ t: c.time, e });
  return out;
}

describe('VentClock', () => {
  it('a wheel vent opens when turned, warns 1.5 s before closing, closes after 6 s; the wheel is hot for 10 s', () => {
    const c = new VentClock();
    c.add(def('vent.a', 'wheel.a'));
    expect(run(c, 5)).toEqual([]); // nothing without a turn
    expect(c.turnWheel('vent.a')).toBe('opened');
    const t0 = c.time;
    const ev = run(c, 7);
    expect(ev.map((x) => x.e.kind)).toEqual(['opened', 'closing', 'closed']);
    expect(ev[1]!.t - t0).toBeCloseTo(VENT_OPEN_S - VENT.closingWarnS, 1);
    expect(ev[2]!.t - t0).toBeCloseTo(VENT_OPEN_S, 1);
    expect(c.turnWheel('vent.a')).toBe('hot');
    run(c, VENT_CLOSED_S - 1.5);
    expect(c.turnWheel('vent.a')).toBe('hot');
    run(c, 0.6);
    expect(c.turnWheel('vent.a')).toBe('opened');
    run(c, 0.1);
    expect(c.turnWheel('vent.a')).toBe('already-open');
    expect(c.closesIn('vent.a')).toBeCloseTo(VENT_OPEN_S - 0.1, 1);
  });

  it('a wheel-less vent cycles by itself over 120 s: 6 s open, 10 s closed', () => {
    const c = new VentClock();
    c.add(def('vent.b'));
    const ev = run(c, 120);
    const opened = ev.filter((x) => x.e.kind === 'opened').map((x) => x.t);
    const closed = ev.filter((x) => x.e.kind === 'closed').map((x) => x.t);
    expect(opened.length).toBe(Math.ceil(120 / 16));
    for (let i = 1; i < opened.length; i++) expect(opened[i]! - opened[i - 1]!).toBeCloseTo(16, 1);
    for (let i = 0; i < closed.length; i++) expect(closed[i]! - opened[i]!).toBeCloseTo(6, 1);
    expect(c.turnWheel('vent.b')).toBe('no-wheel');
  });

  it('a load closes every vent and readies the wheels; two vents stay independent', () => {
    const c = new VentClock();
    c.add(def('vent.a', 'w.a'));
    c.add(def('vent.c', 'w.c'));
    c.turnWheel('vent.a');
    run(c, 0.1);
    expect(c.isOpen('vent.a')).toBe(true);
    expect(c.isOpen('vent.c')).toBe(false);
    expect(c.reset()).toEqual(['vent.a']);
    expect(c.isOpen('vent.a')).toBe(false);
    expect(c.turnWheel('vent.a')).toBe('opened');
  });

  it('refuses duplicates and bad timings; unknown ids', () => {
    const c = new VentClock();
    const undo = c.add(def('vent.a', 'w'));
    expect(() => c.add(def('vent.a', 'w'))).toThrow(/already/);
    expect(() => c.add({ ...def('vent.x'), openS: 0 })).toThrow(/openS/);
    expect(c.turnWheel('nope')).toBe('unknown');
    undo();
    expect(c.has('vent.a')).toBe(false);
  });
});
