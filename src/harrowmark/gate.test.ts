import { describe, expect, it } from 'vitest';
import { createFakeCore } from '../region/testing/fakeCore';
import { M06_ROUTE_FLAG, M06_GUARDED_FLAG, M06_STARTED_FLAG, gateStateFor, watchSouthGate, type GateState } from './gate';

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
