import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { DamageResult } from '../actors/DamageResolver';
import { InteractionSystem, type Interactable } from './InteractionSystem';
import { fakeActions, fakeContexts, makeWorld, v3 } from './testkit';

const DT = 1 / 60;

function setup(opts: { cameraForward?: () => THREE.Vector3Like | null } = {}) {
  const { events, actors } = makeWorld();
  const actor = actors.spawn({ id: 'player', kind: 'player', team: 'player', maxHealth: 10 });
  const input = fakeActions();
  const ctx = fakeContexts();
  const me = { feet: v3(0, 0, 0), facingYaw: 0, moving: true };
  const warn = vi.fn();
  const sys = new InteractionSystem({
    events,
    actions: () => input.actions,
    contexts: ctx.stack,
    player: () => ({ actor, ...me }),
    cameraForward: opts.cameraForward,
    warn,
  });
  const log: { type: string; payload: unknown }[] = [];
  events.onAny((type, payload) => log.push({ type, payload }));
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) sys.fixedUpdate(DT);
  };
  const item = (id: string, z: number, extra: Partial<Interactable> = {}): Interactable => ({
    id,
    kind: 'use',
    position: (out) => out.set(0, 0, z),
    onInteract: vi.fn(),
    ...extra,
  });
  const of = (t: string) => log.filter((l) => l.type === t).map((l) => l.payload);
  return { events, actors, actor, input, ctx, me, sys, tick, item, log, of, warn };
}

describe('InteractionSystem focus', () => {
  it('picks the nearest in front (forward is -Z at yaw 0)', () => {
    const t = setup();
    const near = t.item('use:near', -1);
    const far = t.item('use:far', -1.8);
    t.sys.register(far);
    t.sys.register(near);
    t.tick();
    expect(t.sys.focus).toBe(near);
  });
  it('priority beats distance', () => {
    const t = setup();
    const a = t.item('use:a', -0.5);
    const b = t.item('use:b', -1.5, { priority: 2 });
    t.sys.register(a);
    t.sys.register(b);
    t.tick();
    expect(t.sys.focus).toBe(b);
  });
  it('ties go to the lower id', () => {
    const t = setup();
    t.sys.register(t.item('use:b', -1));
    const a = t.item('use:a', -1);
    t.sys.register(a);
    t.tick();
    expect(t.sys.focus).toBe(a);
  });
  it('ignores disabled, out-of-range and behind', () => {
    const t = setup();
    t.sys.register(t.item('use:off', -1, { enabled: () => false }));
    t.sys.register(t.item('use:far', -3));
    t.sys.register(t.item('use:behind', 1));
    t.tick();
    expect(t.sys.focus).toBeNull();
  });
  it('respects custom radius and vertical distance', () => {
    const t = setup();
    const wide = t.item('use:wide', -4, { radius: 5 });
    t.sys.register(wide);
    t.sys.register(t.item('use:high', -1, { position: (o) => o.set(0, 3, -1) }));
    t.tick();
    expect(t.sys.focus).toBe(wide);
  });
  it('75 degree cone boundary', () => {
    const t = setup();
    const at = (deg: number) => (o: THREE.Vector3) => {
      const r = (deg * Math.PI) / 180;
      return o.set(Math.sin(r), 0, -Math.cos(r));
    };
    const edge = t.item('use:edge', 0, { position: at(74) });
    t.sys.register(edge);
    t.tick();
    expect(t.sys.focus).toBe(edge);
    const t2 = setup();
    t2.sys.register(t2.item('use:out', 0, { position: at(76) }));
    t2.tick();
    expect(t2.sys.focus).toBeNull();
  });
  it('uses facing yaw: turned player sees +X', () => {
    const t = setup();
    t.me.facingYaw = -Math.PI / 2; // forward = (1, 0, 0)
    const e = t.item('use:east', 0, { position: (o) => o.set(1, 0, 0) });
    t.sys.register(e);
    t.tick();
    expect(t.sys.focus).toBe(e);
  });
  it('uses cameraForward when standing still, facing when moving', () => {
    const t = setup({ cameraForward: () => ({ x: 1, y: 0, z: 0 }) });
    const east = t.item('use:east', 0, { position: (o) => o.set(1, 0, 0) });
    t.sys.register(east);
    t.tick();
    expect(t.sys.focus).toBeNull(); // moving: facing -Z
    t.me.moving = false;
    t.tick();
    expect(t.sys.focus).toBe(east);
  });
  it('falls back to facing when cameraForward is null', () => {
    const t = setup({ cameraForward: () => null });
    t.me.moving = false;
    const n = t.item('use:n', -1);
    t.sys.register(n);
    t.tick();
    expect(t.sys.focus).toBe(n);
  });
  it('no focus outside gameplay or when dead', () => {
    const t = setup();
    t.sys.register(t.item('use:a', -1));
    t.ctx.set('menu');
    t.tick();
    expect(t.sys.focus).toBeNull();
    t.ctx.set('gameplay');
    t.tick();
    expect(t.sys.focus).not.toBeNull();
    t.actor._dead = true;
    t.tick();
    expect(t.sys.focus).toBeNull();
  });
  it('a throwing enabled() is treated as disabled and warned', () => {
    const t = setup();
    t.sys.register(t.item('use:a', -1, { enabled: () => { throw new Error('x'); } }));
    t.tick();
    expect(t.sys.focus).toBeNull();
    expect(t.warn).toHaveBeenCalled();
  });
});

describe('InteractionSystem register', () => {
  it('duplicate id throws, bad id throws, unregister frees the id', () => {
    const t = setup();
    const off = t.sys.register(t.item('use:a', -1));
    expect(() => t.sys.register(t.item('use:a', -1))).toThrow(/duplicate/);
    expect(() => t.sys.register(t.item('bad id', -1))).toThrow(/Invalid interactable id/);
    off();
    expect(() => t.sys.register(t.item('use:a', -1))).not.toThrow();
  });
  it('a stale unregister does not remove a newer registration', () => {
    const t = setup();
    const off = t.sys.register(t.item('use:a', -1));
    off();
    const b = t.item('use:a', -1);
    t.sys.register(b);
    off();
    t.tick();
    expect(t.sys.focus).toBe(b);
  });
});

describe('InteractionSystem press', () => {
  it('fires onInteract and the event once', () => {
    const t = setup();
    const a = t.item('use:a', -1);
    t.sys.register(a);
    t.input.press();
    t.tick();
    t.input.hold();
    t.tick(5);
    expect(a.onInteract).toHaveBeenCalledTimes(1);
    expect(a.onInteract).toHaveBeenCalledWith(t.actor);
    expect(t.of('interact')).toEqual([{ interactableId: 'use:a', kind: 'use', actorId: 'player' }]);
  });
  it('does nothing without focus', () => {
    const t = setup();
    t.input.press();
    t.tick();
    expect(t.of('interact')).toEqual([]);
  });
  it('does not fire outside gameplay', () => {
    const t = setup();
    const a = t.item('use:a', -1);
    t.sys.register(a);
    t.ctx.set('dialogue');
    t.input.press();
    t.tick();
    expect(a.onInteract).not.toHaveBeenCalled();
  });
  it('a throwing onInteract is logged, no event, system keeps working', () => {
    const t = setup();
    const a = t.item('use:a', -1, { onInteract: () => { throw new Error('boom'); } });
    t.sys.register(a);
    t.input.press();
    t.tick();
    expect(t.warn).toHaveBeenCalledTimes(1);
    expect(t.of('interact')).toEqual([]);
    t.input.release();
    t.input.press();
    t.tick();
    expect(t.warn).toHaveBeenCalledTimes(2);
  });
  it('dispose clears registrations', () => {
    const t = setup();
    t.sys.register(t.item('use:a', -1));
    t.sys.dispose();
    t.tick();
    expect(t.sys.focus).toBeNull();
  });
});

describe('InteractionSystem hold', () => {
  const holdItem = (t: ReturnType<typeof setup>, s = 1) => {
    const a = t.item('use:kneel', -1, { kind: 'kneel', holdSeconds: s });
    t.sys.register(a);
    return a;
  };
  const start = (t: ReturnType<typeof setup>) => {
    t.input.press();
    t.tick();
    t.input.hold();
  };

  it('completes after holdSeconds, exactly once, with progress', () => {
    const t = setup();
    const a = holdItem(t, 1);
    start(t);
    expect(t.sys.holdProgress).toBeGreaterThan(0);
    t.tick(29);
    expect(t.sys.holdProgress).toBeCloseTo(0.5, 1);
    expect(a.onInteract).not.toHaveBeenCalled();
    t.tick(40);
    expect(a.onInteract).toHaveBeenCalledTimes(1);
    expect(t.sys.holdProgress).toBe(0);
    expect(t.of('interact')).toHaveLength(1);
    expect(t.of('interact.cancelled')).toEqual([]);
  });
  it('completes on the tick elapsed reaches holdSeconds (60 ticks of 1/60)', () => {
    const t = setup();
    const a = holdItem(t, 1);
    start(t); // tick 1
    t.tick(58);
    expect(a.onInteract).not.toHaveBeenCalled();
    t.tick(1);
    expect(a.onInteract).toHaveBeenCalledTimes(1);
  });
  it('cancels on early release', () => {
    const t = setup();
    const a = holdItem(t);
    start(t);
    t.tick(10);
    t.input.release();
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'released' }]);
    expect(t.sys.holdProgress).toBe(0);
    expect(a.onInteract).not.toHaveBeenCalled();
  });
  it('a fresh press after an early release starts again', () => {
    const t = setup();
    const a = holdItem(t, 0.1);
    start(t);
    t.input.release();
    t.tick();
    t.input.press();
    t.tick();
    t.input.hold();
    t.tick(10);
    expect(a.onInteract).toHaveBeenCalledTimes(1);
  });
  it('cancels when focus is lost by walking away', () => {
    const t = setup();
    holdItem(t);
    start(t);
    t.me.feet.set(0, 0, 5);
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'focus-lost' }]);
  });
  it('cancels when another interactable takes focus', () => {
    const t = setup();
    holdItem(t);
    start(t);
    t.sys.register(t.item('use:closer', -0.2));
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'focus-lost' }]);
  });
  it('cancels when unregistered mid-hold', () => {
    const t = setup();
    const a = t.item('use:kneel', -1, { holdSeconds: 1 });
    const off = t.sys.register(a);
    start(t);
    off();
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'focus-lost' }]);
  });
  it('cancels when disabled mid-hold', () => {
    const t = setup();
    let on = true;
    t.sys.register(t.item('use:kneel', -1, { holdSeconds: 1, enabled: () => on }));
    start(t);
    on = false;
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'focus-lost' }]);
  });
  const hit = (t: ReturnType<typeof setup>, outcome: DamageResult['outcome'], targetId = 'player') =>
    t.events.emit('damage.dealt', {
      attackerId: 'x', targetId, amount: 1, kind: 'melee', poise: 1, outcome, dealt: 1, poiseDealt: 1,
      healthAfter: 9, killed: false, saved: false, staggered: false,
    });
  it('cancels on a hit on the player', () => {
    const t = setup();
    holdItem(t);
    start(t);
    hit(t, 'hit');
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'damaged' }]);
    expect(t.sys.holdProgress).toBe(0);
  });
  it.each(['blocked', 'parried', 'immune'] as const)('does NOT cancel on %s damage', (o) => {
    const t = setup();
    holdItem(t);
    start(t);
    hit(t, o);
    expect(t.of('interact.cancelled')).toEqual([]);
    expect(t.sys.holdProgress).toBeGreaterThan(0);
  });
  it('does not cancel when someone else is hit, or when not holding', () => {
    const t = setup();
    holdItem(t);
    hit(t, 'hit');
    start(t);
    hit(t, 'hit', 'wolf#1');
    expect(t.of('interact.cancelled')).toEqual([]);
  });
  it('cancels on context change', () => {
    const t = setup();
    holdItem(t);
    start(t);
    t.ctx.set('menu');
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'context' }]);
  });
  it('cancels on player death', () => {
    const t = setup();
    holdItem(t);
    start(t);
    t.actor._dead = true;
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'dead' }]);
  });
  it('after a cancel the key must be released before a new hold starts', () => {
    const t = setup();
    const a = holdItem(t, 0.1);
    start(t);
    hit(t, 'hit');
    // a (faked) fresh pressed edge while the key is still down is ignored
    t.input.press();
    t.tick(10);
    expect(t.sys.holdProgress).toBe(0);
    expect(a.onInteract).not.toHaveBeenCalled();
    t.input.release();
    t.tick();
    t.input.press();
    t.tick();
    expect(t.sys.holdProgress).toBeGreaterThan(0);
  });
  it('after a cancel a press-type interactable also waits for release', () => {
    const t = setup();
    const kneel = holdItem(t, 1);
    const door = t.item('use:door', -0.5, { priority: 5 });
    start(t);
    hit(t, 'hit');
    t.sys.register(door);
    t.input.press();
    t.tick();
    expect(door.onInteract).not.toHaveBeenCalled();
    expect(kneel.onInteract).not.toHaveBeenCalled();
  });
  it('a throwing onInteract at hold completion resets the hold', () => {
    const t = setup();
    t.sys.register(t.item('use:kneel', -1, { holdSeconds: 0.05, onInteract: () => { throw new Error('boom'); } }));
    start(t);
    t.tick(10);
    expect(t.warn).toHaveBeenCalledTimes(1);
    expect(t.sys.holdProgress).toBe(0);
    expect(t.of('interact')).toEqual([]);
  });
  it('skipped ticks (hit-stop, pause) neither advance nor cancel', () => {
    const t = setup();
    const a = holdItem(t, 1);
    start(t);
    t.tick(10);
    const p = t.sys.holdProgress;
    // 120 simulated-skipped ticks: fixedUpdate is simply not called
    expect(t.sys.holdProgress).toBe(p);
    expect(t.of('interact.cancelled')).toEqual([]);
    t.tick(50);
    expect(a.onInteract).toHaveBeenCalledTimes(1);
  });
});
