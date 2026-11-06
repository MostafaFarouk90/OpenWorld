import { describe, expect, it } from 'vitest';
import { createFakeCore } from '../region/testing/fakeCore';
import { NORTHWEST_GATE_FLAG, watchNorthwestGate, M06_ROUTE_FLAG, M06_GUARDED_FLAG, RIVER_GATE_FLAG, watchRiverGate, M06_STARTED_FLAG, gateStateFor, watchSouthGate, type GateState } from './gate';

function setup(flags: Record<string, boolean | string> = {}) {
  const fc = createFakeCore();
  for (const [k, v] of Object.entries(flags)) fc.flags.set(k, v);
  const seen: GateState[] = [];
  const gate = watchSouthGate(fc.ctx.gates, (s) => seen.push(s));
  return { fc, gate, seen };
}

describe('South Gate state', () => {
  it('maps the two flags to closed, guarded and open (route wins)', () => {
    expect(gateStateFor(false, false)).toBe('closed');
    expect(gateStateFor(true, false)).toBe('guarded');
    expect(gateStateFor(true, true)).toBe('open');
    expect(gateStateFor(false, true)).toBe('open');
  });

  it('starts closed with no flags and follows M06 through guarded to open', () => {
    const { fc, gate, seen } = setup();
    expect(gate.state()).toBe('closed');
    fc.ctx.state.setFlag(M06_GUARDED_FLAG, true);
    expect(gate.state()).toBe('guarded');
    fc.ctx.state.setFlag(M06_ROUTE_FLAG, 'bribe');
    expect(gate.state()).toBe('open');
    expect(seen).toEqual(['closed', 'guarded', 'open']);
  });

  it('stays closed while M06 has only started (Cael is still hearing the queue)', () => {
    const { fc, gate } = setup();
    fc.ctx.state.setFlag(M06_STARTED_FLAG, true);
    expect(gate.state()).toBe('closed');
  });

  it('never pushes the same state twice', () => {
    const { fc, seen } = setup();
    fc.ctx.state.setFlag(M06_GUARDED_FLAG, true);
    fc.ctx.state.setFlag(M06_GUARDED_FLAG, true);
    fc.ctx.state.setFlag('unrelated', true);
    expect(seen).toEqual(['closed', 'guarded']);
  });

  it('derives the state from a save that loads past M06, and back again', () => {
    const { fc, gate } = setup();
    fc.flags.set(M06_GUARDED_FLAG, true);
    fc.flags.set(M06_ROUTE_FLAG, 'stealth');
    fc.fire('save.loaded');
    expect(gate.state()).toBe('open');
    fc.flags.clear();
    fc.fire('save.loaded');
    expect(gate.state()).toBe('closed');
  });

  it('starts open when the save already carries the route', () => {
    const { gate, seen } = setup({ [M06_GUARDED_FLAG]: true, [M06_ROUTE_FLAG]: 'persuasion' });
    expect(gate.state()).toBe('open');
    expect(seen).toEqual(['open']);
  });

  it('lets the story gate force a state and release it back to the flags', () => {
    const { fc, gate, seen } = setup();
    gate.override('open');
    expect(gate.state()).toBe('open');
    fc.ctx.state.setFlag(M06_GUARDED_FLAG, true);
    expect(gate.state()).toBe('open');
    gate.override(null);
    expect(gate.state()).toBe('guarded');
    expect(seen).toEqual(['closed', 'open', 'guarded']);
  });

  it('stops listening after dispose', () => {
    const { fc, gate, seen } = setup();
    gate.dispose();
    fc.ctx.state.setFlag(M06_GUARDED_FLAG, true);
    expect(seen).toEqual(['closed']);
  });
});

describe('River Gate', () => {
  it('is closed with no flag, opens when Act 1 ends, closes on an Act 1 save load, and applies only on change', () => {
    const fc = createFakeCore();
    const seen: boolean[] = [];
    const gate = watchRiverGate(fc.ctx.gates, (open) => seen.push(open));
    expect(gate.open()).toBe(false);
    fc.ctx.state.setFlag(RIVER_GATE_FLAG, true);
    fc.ctx.state.setFlag(RIVER_GATE_FLAG, true);
    fc.ctx.state.setFlag('unrelated', true);
    expect(gate.open()).toBe(true);
    fc.flags.clear();
    fc.fire('save.loaded');
    expect(gate.open()).toBe(false);
    expect(seen).toEqual([false, true, false]);
    gate.dispose();
    fc.ctx.state.setFlag(RIVER_GATE_FLAG, true);
    expect(seen).toEqual([false, true, false]);
  });

  it('starts open when the save already carries the flag', () => {
    const fc = createFakeCore();
    fc.flags.set(RIVER_GATE_FLAG, true);
    const seen: boolean[] = [];
    expect(watchRiverGate(fc.ctx.gates, (o) => seen.push(o)).open()).toBe(true);
    expect(seen).toEqual([true]);
  });
});

describe('North-west Gate shutter (Act 3, K1)', () => {
  it('opens on story.gate.a3 only, re-derives on load and stops after dispose', () => {
    const fc = createFakeCore();
    const seen: boolean[] = [];
    const gate = watchNorthwestGate(fc.ctx.gates, (open) => seen.push(open));
    expect(NORTHWEST_GATE_FLAG).toBe('story.gate.a3');
    expect(gate.open()).toBe(false);
    fc.ctx.state.setFlag('story.gate.a2', true);
    expect(gate.open()).toBe(false);
    fc.ctx.state.setFlag(NORTHWEST_GATE_FLAG, true);
    expect(gate.open()).toBe(true);
    fc.flags.clear();
    fc.fire('save.loaded');
    expect(gate.open()).toBe(false);
    gate.dispose();
    fc.ctx.state.setFlag(NORTHWEST_GATE_FLAG, true);
    expect(seen).toEqual([false, true, false]);
  });
});

describe('the occupied city holds every working gate shut (Act 4, L2: closedWhen)', () => {
  const HELD = 'story.m38.complete';

  it('the state rule: held beats every M06 state', () => {
    expect(gateStateFor(true, true, true)).toBe('closed');
    expect(gateStateFor(true, false, true)).toBe('closed');
    expect(gateStateFor(true, true, false)).toBe('open');
  });

  it('the South Gate shuts on the flag, reopens on a load without it, and ignores the flag when not asked to', () => {
    const fc = createFakeCore();
    fc.flags.set(M06_ROUTE_FLAG, 'bribe');
    const seen: GateState[] = [];
    const gate = watchSouthGate(fc.ctx.gates, (s) => seen.push(s), { closedWhen: HELD });
    expect(gate.state()).toBe('open');
    fc.ctx.state.setFlag(HELD, true);
    expect(gate.state()).toBe('closed');
    fc.flags.set(HELD, false);
    fc.fire('save.loaded');
    expect(gate.state()).toBe('open');
    expect(seen).toEqual(['open', 'closed', 'open']);
    const plain = watchSouthGate(fc.ctx.gates, () => {});
    fc.ctx.state.setFlag(HELD, true);
    expect(plain.state()).toBe('open');
    gate.dispose();
    plain.dispose();
  });

  it('starts shut for a save already past M38, with one apply only', () => {
    const fc = createFakeCore();
    fc.flags.set(M06_ROUTE_FLAG, 'bribe');
    fc.flags.set(HELD, true);
    const seen: GateState[] = [];
    watchSouthGate(fc.ctx.gates, (s) => seen.push(s), { closedWhen: HELD });
    expect(seen).toEqual(['closed']);
  });

  it('the River and North-west shutters close on the flag over their own open flag, and re-derive on load', () => {
    for (const [watch, flag] of [
      [watchRiverGate, RIVER_GATE_FLAG],
      [watchNorthwestGate, NORTHWEST_GATE_FLAG],
    ] as const) {
      const fc = createFakeCore();
      fc.flags.set(flag, true);
      const seen: boolean[] = [];
      const g = watch(fc.ctx.gates, (o) => seen.push(o), { closedWhen: HELD });
      expect(g.open()).toBe(true);
      fc.ctx.state.setFlag(HELD, true);
      expect(g.open()).toBe(false);
      fc.flags.set(HELD, false);
      fc.fire('save.loaded');
      expect(g.open()).toBe(true);
      // Held but never opened (an impossible save): still shut.
      fc.flags.set(flag, false);
      fc.flags.set(HELD, true);
      fc.fire('save.loaded');
      expect(g.open()).toBe(false);
      expect(seen).toEqual([true, false, true, false]);
      g.dispose();
      fc.ctx.state.setFlag(HELD, false);
      fc.ctx.state.setFlag(flag, true);
      expect(seen).toHaveLength(4);
    }
  });
});
