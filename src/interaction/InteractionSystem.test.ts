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
    expect(t.of('interact')).toEqual([{ interactableId: 'use:a', kind: 'use', actorId: 'player', action: 'interact' }]);
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
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'released', action: 'interact' }]);
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
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'focus-lost', action: 'interact' }]);
  });
  it('cancels when another interactable takes focus', () => {
    const t = setup();
    holdItem(t);
    start(t);
    t.sys.register(t.item('use:closer', -0.2));
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'focus-lost', action: 'interact' }]);
  });
  it('cancels when unregistered mid-hold', () => {
    const t = setup();
    const a = t.item('use:kneel', -1, { holdSeconds: 1 });
    const off = t.sys.register(a);
    start(t);
    off();
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'focus-lost', action: 'interact' }]);
  });
  it('cancels when disabled mid-hold', () => {
    const t = setup();
    let on = true;
    t.sys.register(t.item('use:kneel', -1, { holdSeconds: 1, enabled: () => on }));
    start(t);
    on = false;
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'focus-lost', action: 'interact' }]);
  });
  const hit = (t: ReturnType<typeof setup>, outcome: DamageResult['outcome'], targetId = 'player') =>
    t.events.emit('damage.dealt', {
      attackerId: 'x', targetId, amount: 1, kind: 'melee', poise: 1, outcome, dealt: 1, poiseDealt: 1,
      healthAfter: 9, killed: false, saved: false, staggered: false,
    });
  it('does NOT cancel on a status tick (bleed, ignite; v0.5)', () => {
    const t = setup();
    holdItem(t);
    start(t);
    t.events.emit('damage.dealt', {
      attackerId: 'x', targetId: 'player', amount: 1, kind: 'status', statusId: 'bite', statusKind: 'ignite', poise: 0,
      outcome: 'hit', dealt: 1, poiseDealt: 0, healthAfter: 9, killed: false, saved: false, staggered: false,
    });
    expect(t.of('interact.cancelled')).toEqual([]);
    expect(t.sys.holdProgress).toBeGreaterThan(0);
  });
  it('cancels on a hit on the player', () => {
    const t = setup();
    holdItem(t);
    start(t);
    hit(t, 'hit');
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'damaged', action: 'interact' }]);
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
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'context', action: 'interact' }]);
  });
  it('cancels on player death', () => {
    const t = setup();
    holdItem(t);
    start(t);
    t.actor._dead = true;
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:kneel', reason: 'dead', action: 'interact' }]);
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

describe('InteractionSystem per-action focus (mercy)', () => {
  const mercy = (t: ReturnType<typeof setup>, id: string, z: number, extra: Partial<Interactable> = {}) =>
    t.item(id, z, { action: 'mercy', ...extra });

  it('tracks a focus per action; focus stays the interact one', () => {
    const t = setup();
    const a = t.item('use:a', -1);
    const m = mercy(t, 'use:m', -0.5);
    t.sys.register(a);
    t.sys.register(m);
    t.tick();
    expect(t.sys.focus).toBe(a);
    expect(t.sys.focusFor('interact')).toBe(a);
    expect(t.sys.focusFor('mercy')).toBe(m);
  });
  it('mercy items are driven only by the mercy key, interact items only by interact', () => {
    const t = setup();
    const a = t.item('use:a', -1);
    const m = mercy(t, 'use:m', -1);
    t.sys.register(a);
    t.sys.register(m);
    t.input.press('interact');
    t.tick();
    expect(a.onInteract).toHaveBeenCalledTimes(1);
    expect(m.onInteract).not.toHaveBeenCalled();
    t.input.release('interact');
    t.input.press('mercy');
    t.tick();
    expect(m.onInteract).toHaveBeenCalledTimes(1);
    expect(a.onInteract).toHaveBeenCalledTimes(1);
    expect(t.of('interact')).toEqual([
      { interactableId: 'use:a', kind: 'use', actorId: 'player', action: 'interact' },
      { interactableId: 'use:m', kind: 'use', actorId: 'player', action: 'mercy' },
    ]);
  });
  it('a mercy-only item does not respond to the interact key', () => {
    const t = setup();
    const m = mercy(t, 'use:m', -1);
    t.sys.register(m);
    t.input.press('interact');
    t.tick();
    expect(m.onInteract).not.toHaveBeenCalled();
    expect(t.sys.focus).toBeNull();
  });
  it('holds are per action: a mercy hold completes while an interact hold is cancelled independently', () => {
    const t = setup();
    const k = t.item('use:k', -1, { holdSeconds: 1 });
    const m = mercy(t, 'use:m', -1, { holdSeconds: 0.5 });
    t.sys.register(k);
    t.sys.register(m);
    t.input.press('mercy');
    t.tick();
    expect(t.sys.holdProgressFor('mercy')).toBeGreaterThan(0);
    expect(t.sys.holdProgress).toBe(0);
    t.input.press('interact');
    t.tick();
    t.input.hold('interact');
    t.input.hold('mercy');
    t.tick();
    expect(t.sys.holdProgress).toBeGreaterThan(0);
    t.input.release('interact');
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:k', reason: 'released', action: 'interact' }]);
    expect(t.sys.holdProgressFor('mercy')).toBeGreaterThan(0);
    t.input.hold('mercy');
    t.tick(40);
    expect(m.onInteract).toHaveBeenCalledTimes(1);
    expect(t.of('interact')).toEqual([{ interactableId: 'use:m', kind: 'use', actorId: 'player', action: 'mercy' }]);
    expect(t.sys.holdProgressFor('mercy')).toBe(0);
  });
  it('releasing mercy mid-hold emits a cancel with action mercy', () => {
    const t = setup();
    t.sys.register(mercy(t, 'use:m', -1, { holdSeconds: 1 }));
    t.input.press('mercy');
    t.tick();
    t.input.release('mercy');
    t.tick();
    expect(t.of('interact.cancelled')).toEqual([{ interactableId: 'use:m', reason: 'released', action: 'mercy' }]);
  });
  it('a context change or damage cancels holds of both actions', () => {
    const t = setup();
    t.sys.register(t.item('use:k', -1, { holdSeconds: 1 }));
    t.sys.register(mercy(t, 'use:m', -1, { holdSeconds: 1 }));
    t.input.press('interact');
    t.input.press('mercy');
    t.tick();
    t.input.hold('interact');
    t.input.hold('mercy');
    t.ctx.set('menu');
    expect(t.of('interact.cancelled')).toHaveLength(2);
    expect(t.sys.focusFor('mercy')).toBeNull();
    expect(t.sys.focus).toBeNull();
  });
  it('mercy key must be released after a cancel before it can start again', () => {
    const t = setup();
    const m = mercy(t, 'use:m', -1, { holdSeconds: 1 });
    t.sys.register(m);
    t.input.press('mercy');
    t.tick();
    t.me.feet.set(0, 0, 5);
    t.input.hold('mercy');
    t.tick();
    t.me.feet.set(0, 0, 0);
    t.input.press('mercy');
    t.tick();
    expect(t.sys.holdProgressFor('mercy')).toBe(0);
    t.input.release('mercy');
    t.tick();
    t.input.press('mercy');
    t.tick();
    expect(t.sys.holdProgressFor('mercy')).toBeGreaterThan(0);
  });
});

describe('InteractionSystem cone and score', () => {
  it('coneDegrees narrows the cone; behind is rejected by default', () => {
    const t = setup();
    // 45 degrees off forward (-Z) at distance ~1.41.
    const side = t.item('use:side', 0, { position: (o) => o.set(1, 0, -1), coneDegrees: 30 });
    t.sys.register(side);
    t.tick();
    expect(t.sys.focus).toBeNull();
    const wide = t.item('use:wide', 0, { position: (o) => o.set(1, 0, -1), coneDegrees: 60 });
    t.sys.register(wide);
    t.tick();
    expect(t.sys.focus).toBe(wide);
  });
  it('360 or more disables the facing check (even directly behind)', () => {
    const t = setup();
    const back = t.item('use:back', 1, { coneDegrees: 360 });
    const back2 = t.item('use:back2', 1.5, { coneDegrees: 720 });
    const plain = t.item('use:plain', 0.5);
    t.sys.register(back);
    t.sys.register(back2);
    t.sys.register(plain);
    t.tick();
    expect(t.sys.focus).toBe(back);
    t.sys.register(t.item('use:near', 0.2, { coneDegrees: 359 }));
    t.tick();
    expect(t.sys.focus).toBe(back);
  });
  it('score overrides the default (lower wins) and ties still go to the lower id', () => {
    const t = setup();
    const near = t.item('use:near', -0.5);
    const far = t.item('use:far', -1.5, { score: () => -10 });
    t.sys.register(near);
    t.sys.register(far);
    t.tick();
    expect(t.sys.focus).toBe(far);
    const same = t.item('use:a', -1.9, { score: () => -10 });
    t.sys.register(same);
    t.tick();
    expect(t.sys.focus).toBe(same);
  });
  it('score receives the player feet; a throwing or non-finite score falls back to the default', () => {
    const t = setup();
    const seen = vi.fn(() => 1);
    t.sys.register(t.item('use:s', -1, { score: seen }));
    t.tick();
    expect(seen).toHaveBeenCalledWith(t.me.feet);
    const t2 = setup();
    const bad = t2.item('use:bad', -1, { score: () => { throw new Error('x'); } });
    const nan = t2.item('use:nan', -0.5, { score: () => Number.NaN });
    t2.sys.register(bad);
    t2.sys.register(nan);
    t2.tick();
    expect(t2.sys.focus).toBe(nan);
    expect(t2.warn).toHaveBeenCalled();
  });
  it('score is compared only within the same action', () => {
    const t = setup();
    const a = t.item('use:a', -1);
    const m = t.item('use:m', -1, { action: 'mercy', score: () => -100 });
    t.sys.register(a);
    t.sys.register(m);
    t.tick();
    expect(t.sys.focus).toBe(a);
    expect(t.sys.focusFor('mercy')).toBe(m);
  });
});
