import { describe, expect, it, vi } from 'vitest';
import { GameEvents } from '../core/events';
import { FlagGates, type GateCause } from './FlagGates';
import { WorldState } from './WorldState';

function make() {
  const events = new GameEvents(() => {});
  const state = new WorldState(events, () => {});
  const report = vi.fn();
  const gates = new FlagGates(state, events, report);
  const calls: [boolean, GateCause][] = [];
  const listener = (open: boolean, cause: GateCause) => calls.push([open, cause]);
  const load = (flags: Record<string, unknown>) => {
    state.load({ flags });
    events.emit('save.loaded', { slot: 'test' });
  };
  return { events, state, gates, report, calls, listener, load };
}

describe('FlagGates.watch', () => {
  it('calls at once with the current value, cause init', () => {
    const t = make();
    t.state.setFlag('test.gate.flag', true);
    t.gates.flag('test.gate.flag', t.listener);
    expect(t.calls).toEqual([[true, 'init']]);
  });

  it('calls once per change and not when the result is unchanged', () => {
    const t = make();
    t.gates.flag('world.brightwater.barley', t.listener);
    t.state.setFlag('world.brightwater.barley', 'scorched');
    t.state.setFlag('world.brightwater.barley', 'saved');
    t.state.clearFlag('world.brightwater.barley');
    expect(t.calls).toEqual([[false, 'init'], [true, 'flag'], [false, 'flag']]);
  });

  it('ignores flags outside its keys', () => {
    const t = make();
    const test = vi.fn((s: WorldState) => s.getBool('a.b'));
    t.gates.watch(test, t.listener, { keys: ['a.b'] });
    test.mockClear();
    t.state.setFlag('a.c', true);
    expect(test).not.toHaveBeenCalled();
    t.state.setFlag('a.b', true);
    expect(t.calls.at(-1)).toEqual([true, 'flag']);
  });

  it('matches prefix keys written with .*', () => {
    const t = make();
    const lit = (s: WorldState) => ['quenchstone', 'hushed-anvil'].filter((id) => s.getBool(`shrine.${id}.lit`)).length >= 2;
    t.gates.watch(lit, t.listener, { keys: ['shrine.*'] });
    t.state.setFlag('shrine.hushed-anvil.lit', true);
    t.state.setFlag('shrine.quenchstone.lit', true);
    t.state.setFlag('shrinex.other', true);
    expect(t.calls).toEqual([[false, 'init'], [true, 'flag']]);
  });

  it('without keys every flag change re-evaluates', () => {
    const t = make();
    const test = vi.fn(() => false);
    t.gates.watch(test, t.listener);
    t.state.setFlag('any.thing', 1);
    expect(test).toHaveBeenCalledTimes(2);
  });

  it('re-derives on save.loaded, which emits no flag.changed', () => {
    const t = make();
    t.gates.flag('story.m05.tobbJoined', t.listener);
    t.load({ 'story.m05.tobbJoined': true });
    expect(t.calls).toEqual([[false, 'init'], [true, 'load']]);
    t.load({});
    expect(t.calls.at(-1)).toEqual([false, 'load']);
  });

  it('a load with unchanged state calls nothing, and a double save.loaded at most once', () => {
    const t = make();
    t.state.setFlag('a.b', true);
    t.gates.flag('a.b', t.listener);
    t.load({ 'a.b': true });
    expect(t.calls).toEqual([[true, 'init']]);
    t.state.load({ flags: {} });
    t.events.emit('save.loaded', { slot: 'x' });
    t.events.emit('save.loaded', { slot: 'x' });
    expect(t.calls).toEqual([[true, 'init'], [false, 'load']]);
  });

  it('a load with partial flags re-derives each gate from what is there', () => {
    const t = make();
    const a: boolean[] = [];
    const b: boolean[] = [];
    t.gates.flag('a.one', (o) => a.push(o));
    t.gates.flag('a.two', (o) => b.push(o));
    t.load({ 'a.one': true, 'bad key': true });
    expect(a).toEqual([false, true]);
    expect(b).toEqual([false]);
  });

  it('a flag set by another save.loaded handler reaches the gate', () => {
    const t = make();
    t.events.on('save.loaded', () => t.state.setFlag('a.migrated', true));
    t.gates.flag('a.migrated', t.listener);
    t.load({});
    expect(t.calls).toEqual([[false, 'init'], [true, 'flag']]);
  });

  it('a throwing test counts as closed and is reported once', () => {
    const t = make();
    let boom = true;
    t.gates.watch(() => {
      if (boom) throw new Error('x');
      return true;
    }, t.listener);
    t.state.setFlag('a.b', 1);
    expect(t.report).toHaveBeenCalledTimes(1);
    expect(t.calls).toEqual([[false, 'init']]);
    boom = false;
    t.state.setFlag('a.b', 2);
    expect(t.calls.at(-1)).toEqual([true, 'flag']);
  });

  it('a throwing listener is reported and other gates still run', () => {
    const t = make();
    t.gates.flag('a.b', (_o, cause) => {
      if (cause !== 'init') throw new Error('x');
    });
    t.gates.flag('a.b', t.listener);
    t.state.setFlag('a.b', true);
    expect(t.report).toHaveBeenCalled();
    expect(t.calls.at(-1)).toEqual([true, 'flag']);
  });

  it('unsubscribe stops calls, also when done during a dispatch', () => {
    const t = make();
    const off1 = t.gates.flag('a.b', () => off2());
    const off2 = t.gates.flag('a.b', t.listener);
    t.state.setFlag('a.b', true);
    expect(t.calls).toEqual([[false, 'init']]);
    off1();
    off1();
    expect(t.gates.size).toBe(0);
  });

  it('recheck re-evaluates tests that read more than flags', () => {
    const t = make();
    let external = false;
    t.gates.watch(() => external, t.listener, { keys: [] });
    external = true;
    t.gates.recheck();
    t.gates.recheck();
    expect(t.calls).toEqual([[false, 'init'], [true, 'recheck']]);
  });

  it('flag() treats truthy values as open', () => {
    const t = make();
    const seen: boolean[] = [];
    t.gates.flag('a.b', (o) => seen.push(o));
    t.state.setFlag('a.b', 0);
    t.state.setFlag('a.b', 'scorched');
    t.state.setFlag('a.b', '');
    t.state.setFlag('a.b', 1);
    expect(seen).toEqual([false, true, false, true]);
  });

  it('dispose detaches from the bus', () => {
    const t = make();
    t.gates.flag('a.b', t.listener);
    t.gates.dispose();
    t.state.setFlag('a.b', true);
    t.load({});
    expect(t.calls).toEqual([[false, 'init']]);
  });
});
