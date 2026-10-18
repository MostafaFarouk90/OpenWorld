import { describe, expect, it, vi } from 'vitest';
import type { CombatSystem } from '../combat/CombatSystem';
import type { HurtboxSet } from '../combat/HurtboxSet';
import type { AttackWindowSource } from '../combat/types';
import type { WeaponTracer } from '../combat/WeaponTracer';
import { GameEvents } from '../core/events';
import { CombatRegistry } from './CombatRegistry';

interface FakeWindow extends AttackWindowSource {
  t: number | null;
  swingId?: number;
}

function win(over: Partial<FakeWindow> = {}): FakeWindow {
  const w: FakeWindow = {
    clipName: 'Chop',
    start: 0.2,
    end: 0.6,
    t: null,
    currentTime() {
      return w.t;
    },
    ...over,
  };
  return w;
}

function make() {
  const system = {
    addAttacker: vi.fn(),
    removeAttacker: vi.fn(),
    addTarget: vi.fn(),
    removeTarget: vi.fn(),
  };
  const events = new GameEvents(() => {});
  const reg = new CombatRegistry(system as unknown as CombatSystem, events);
  const windows: { actorId: string; attackId: string; swingId: number; phase: string }[] = [];
  events.on('attack.window', (w) => windows.push(w));
  const attacker = { name: 'owner' };
  const tracer = { attacker } as unknown as WeaponTracer;
  return { system, events, reg, windows, attacker, tracer };
}

describe('CombatRegistry add/remove', () => {
  it('addAttacker forwards to the CombatSystem and removal reverses it', () => {
    const { system, reg, tracer } = make();
    const w = win();
    const off = reg.addAttacker('a', tracer, w);
    expect(system.addAttacker).toHaveBeenCalledWith(tracer, w);
    off();
    expect(system.removeAttacker).toHaveBeenCalledWith(tracer);
  });

  it('addTarget forwards and removal reverses it', () => {
    const { system, reg } = make();
    const set = {} as HurtboxSet;
    const off = reg.addTarget(set);
    expect(system.addTarget).toHaveBeenCalledWith(set);
    off();
    expect(system.removeTarget).toHaveBeenCalledWith(set);
  });

  it('watching the same attacker twice throws; after removal it can be watched again', () => {
    const { reg, attacker } = make();
    const off = reg.watch('a', attacker, win());
    expect(() => reg.watch('b', attacker, win())).toThrow(/already watched/);
    off();
    expect(() => reg.watch('b', attacker, win())).not.toThrow();
  });

  it('a failed addAttacker (duplicate watch) still called the system first', () => {
    const { reg, system, tracer } = make();
    reg.addAttacker('a', tracer, win());
    expect(() => reg.addAttacker('a', tracer, win())).toThrow(/already watched/);
    expect(system.addAttacker).toHaveBeenCalledTimes(2);
  });
});

describe('CombatRegistry.pollWindows', () => {
  it('emits open when the window becomes active and close when it ends', () => {
    const { reg, windows, attacker } = make();
    const w = win();
    reg.watch('p', attacker, w);
    reg.pollWindows();
    expect(windows).toEqual([]);
    w.t = 0.3;
    reg.pollWindows();
    expect(windows).toEqual([{ actorId: 'p', attackId: 'Chop', swingId: 1, phase: 'open' }]);
    reg.pollWindows(); // still open: nothing new
    expect(windows).toHaveLength(1);
    w.t = 0.7;
    reg.pollWindows();
    expect(windows[1]).toEqual({ actorId: 'p', attackId: 'Chop', swingId: 1, phase: 'close' });
  });

  it('window edges are inclusive; null time means closed', () => {
    const { reg, windows, attacker } = make();
    const w = win();
    reg.watch('p', attacker, w);
    w.t = 0.2;
    reg.pollWindows();
    expect(windows.map((x) => x.phase)).toEqual(['open']);
    w.t = 0.6;
    reg.pollWindows();
    expect(windows).toHaveLength(1);
    w.t = null;
    reg.pollWindows();
    expect(windows.map((x) => x.phase)).toEqual(['open', 'close']);
  });

  it('inverted or NaN windows never open', () => {
    const { reg, windows, attacker } = make();
    const w = win({ start: 0.8, end: 0.2 });
    reg.watch('p', attacker, w);
    w.t = 0.5;
    reg.pollWindows();
    expect(windows).toEqual([]);
  });

  it('fallback swing ids count up per opening when the window reports none', () => {
    const { reg, windows, attacker } = make();
    const w = win();
    reg.watch('p', attacker, w);
    for (let i = 0; i < 3; i++) {
      w.t = 0.3;
      reg.pollWindows();
      w.t = null;
      reg.pollWindows();
    }
    expect(windows.filter((x) => x.phase === 'open').map((x) => x.swingId)).toEqual([1, 2, 3]);
  });

  it('uses the source swingId, and a changed swingId closes and re-opens in one poll', () => {
    const { reg, windows, attacker } = make();
    const w = win({ swingId: 7 });
    reg.watch('p', attacker, w);
    w.t = 0.3;
    reg.pollWindows();
    expect(windows[0].swingId).toBe(7);
    w.swingId = 8;
    reg.pollWindows();
    expect(windows.map((x) => `${x.phase}${x.swingId}`)).toEqual(['open7', 'close7', 'open8']);
  });

  it('a swingId change while the window is no longer active only closes', () => {
    const { reg, windows, attacker } = make();
    const w = win({ swingId: 1 });
    reg.watch('p', attacker, w);
    w.t = 0.3;
    reg.pollWindows();
    w.swingId = 2;
    w.t = null;
    reg.pollWindows();
    expect(windows.map((x) => x.phase)).toEqual(['open', 'close']);
  });

  it('the attackId is the clip name at open time', () => {
    const { reg, windows, attacker } = make();
    let clip = 'Chop';
    const w = win();
    Object.defineProperty(w, 'clipName', { get: () => clip });
    reg.watch('p', attacker, w);
    w.t = 0.3;
    reg.pollWindows();
    clip = 'Slice';
    w.t = null;
    reg.pollWindows();
    w.t = 0.3;
    reg.pollWindows();
    expect(windows.filter((x) => x.phase === 'open').map((x) => x.attackId)).toEqual(['Chop', 'Slice']);
    expect(windows[1].attackId).toBe('Chop'); // close names the attack that closed
  });

  it('tracks several attackers independently (player and a fake enemy)', () => {
    const { reg, windows } = make();
    const a1 = {};
    const a2 = {};
    const w1 = win();
    const w2 = win({ clipName: 'Bite' });
    reg.watch('player', a1, w1);
    reg.watch('enemy#1', a2, w2);
    w2.t = 0.4;
    reg.pollWindows();
    w1.t = 0.4;
    reg.pollWindows();
    expect(windows.map((x) => `${x.actorId}:${x.phase}:${x.attackId}`)).toEqual(['enemy#1:open:Bite', 'player:open:Chop']);
  });

  it('a listener that unwatches during the poll does not break iteration', () => {
    const { reg, events, attacker } = make();
    const other = {};
    const wOther = win();
    const off = reg.watch('p', attacker, win({ t: 0.3 } as never));
    reg.watch('q', other, wOther);
    wOther.t = 0.3;
    events.on('attack.window', () => off());
    expect(() => reg.pollWindows()).not.toThrow();
  });
});

describe('CombatRegistry.attackOf', () => {
  it('is null when not watched or the window is closed; the current attack when open', () => {
    const { reg, attacker } = make();
    expect(reg.attackOf(attacker)).toBeNull();
    const w = win({ swingId: 3 });
    reg.watch('p', attacker, w);
    expect(reg.attackOf(attacker)).toBeNull();
    w.t = 0.3;
    reg.pollWindows();
    expect(reg.attackOf(attacker)).toEqual({ attackId: 'Chop', swingId: 3 });
    w.t = null;
    reg.pollWindows();
    expect(reg.attackOf(attacker)).toBeNull();
  });
});

describe('CombatRegistry removal', () => {
  it('removal mid-window emits close', () => {
    const { reg, windows, tracer, system } = make();
    const w = win();
    const off = reg.addAttacker('enemy#1', tracer, w);
    w.t = 0.3;
    reg.pollWindows();
    off();
    expect(windows.map((x) => x.phase)).toEqual(['open', 'close']);
    expect(windows[1].actorId).toBe('enemy#1');
    expect(system.removeAttacker).toHaveBeenCalled();
    expect(reg.attackOf(tracer.attacker)).toBeNull();
  });

  it('removal when closed emits nothing; removing twice is safe; polling after removal emits nothing', () => {
    const { reg, windows, attacker } = make();
    const w = win();
    const off = reg.watch('p', attacker, w);
    off();
    off();
    w.t = 0.3;
    reg.pollWindows();
    expect(windows).toEqual([]);
  });

  it('a stale removal does not unwatch a newer watch of the same attacker', () => {
    const { reg, windows, attacker } = make();
    const off = reg.watch('p', attacker, win());
    off();
    const w2 = win();
    reg.watch('p', attacker, w2);
    off();
    w2.t = 0.3;
    reg.pollWindows();
    expect(windows).toHaveLength(1);
  });
});
