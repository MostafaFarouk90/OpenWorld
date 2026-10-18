import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from './InputManager';

type FakeDoc = EventTarget & { pointerLockElement: Element | null };

function setup() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null }) as FakeDoc;
  const requestPointerLock = vi.fn<() => unknown>();
  const element = Object.assign(new EventTarget(), { requestPointerLock }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc);
  const lock = (): void => {
    doc.pointerLockElement = element as unknown as Element;
  };
  return { win, doc, element, requestPointerLock, input, lock };
}

function key(win: EventTarget, type: 'keydown' | 'keyup', code: string, repeat = false) {
  const preventDefault = vi.fn();
  win.dispatchEvent(Object.assign(new Event(type), { code, repeat, preventDefault }));
  return preventDefault;
}
const down = (w: EventTarget, c: string, repeat = false) => key(w, 'keydown', c, repeat);
const up = (w: EventTarget, c: string) => key(w, 'keyup', c);

function move(doc: EventTarget, movementX: number, movementY: number): void {
  doc.dispatchEvent(Object.assign(new Event('mousemove'), { movementX, movementY }));
}
function wheel(el: EventTarget, deltaY: number): void {
  el.dispatchEvent(Object.assign(new Event('wheel'), { deltaY }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InputManager keys', () => {
  it('samples all zero/false with no keys', () => {
    const { input } = setup();
    expect(input.sample()).toEqual({ moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 });
  });

  it.each([
    ['KeyW', 'moveForward', 1],
    ['ArrowUp', 'moveForward', 1],
    ['KeyS', 'moveForward', -1],
    ['ArrowDown', 'moveForward', -1],
    ['KeyD', 'moveRight', 1],
    ['ArrowRight', 'moveRight', 1],
    ['KeyA', 'moveRight', -1],
    ['ArrowLeft', 'moveRight', -1],
  ] as const)('maps %s to %s %i', (code, axis, value) => {
    const { win, input } = setup();
    down(win, code);
    const s = input.sample();
    expect(s[axis]).toBe(value);
    expect(s[axis === 'moveForward' ? 'moveRight' : 'moveForward']).toBe(0);
  });

  it('cancels opposite keys and restores the other on release', () => {
    const { win, input } = setup();
    down(win, 'KeyW');
    down(win, 'KeyS');
    down(win, 'KeyA');
    down(win, 'KeyD');
    expect(input.sample()).toMatchObject({ moveForward: 0, moveRight: 0 });
    up(win, 'KeyS');
    up(win, 'KeyA');
    expect(input.sample()).toMatchObject({ moveForward: 1, moveRight: 1 });
    up(win, 'KeyW');
    up(win, 'KeyD');
    expect(input.sample()).toMatchObject({ moveForward: 0, moveRight: 0 });
  });

  it('keeps a key held across samples and ignores keyup of unpressed keys', () => {
    const { win, input } = setup();
    up(win, 'KeyW');
    down(win, 'KeyW');
    expect(input.sample().moveForward).toBe(1);
    expect(input.sample().moveForward).toBe(1);
  });

  it.each(['ShiftLeft', 'ShiftRight'])('sets sprint with %s and clears on release', (code) => {
    const { win, input } = setup();
    down(win, code);
    expect(input.sample().sprint).toBe(true);
    up(win, code);
    expect(input.sample().sprint).toBe(false);
  });

  it('keeps sprint while the other shift is still held', () => {
    const { win, input } = setup();
    down(win, 'ShiftLeft');
    down(win, 'ShiftRight');
    up(win, 'ShiftLeft');
    expect(input.sample().sprint).toBe(true);
  });
});

describe('InputManager jump', () => {
  it('is true for exactly one sample while held', () => {
    const { win, input } = setup();
    down(win, 'Space');
    expect(input.sample().jump).toBe(true);
    expect(input.sample().jump).toBe(false);
  });

  it('does not queue another jump on a repeat keydown', () => {
    const { win, input } = setup();
    down(win, 'Space');
    input.sample();
    down(win, 'Space', true);
    expect(input.sample().jump).toBe(false);
  });

  it('ignores a repeat keydown when no initial press was seen', () => {
    const { win, input } = setup();
    down(win, 'Space', true);
    expect(input.sample().jump).toBe(false);
  });

  it('yields one jump for a press and release between two samples', () => {
    const { win, input } = setup();
    down(win, 'Space');
    up(win, 'Space');
    expect(input.sample().jump).toBe(true);
    expect(input.sample().jump).toBe(false);
  });

  it('yields another jump on a new press after release', () => {
    const { win, input } = setup();
    down(win, 'Space');
    expect(input.sample().jump).toBe(true);
    up(win, 'Space');
    down(win, 'Space');
    expect(input.sample().jump).toBe(true);
    expect(input.sample().jump).toBe(false);
  });

  it('collapses two presses between samples into one jump', () => {
    const { win, input } = setup();
    down(win, 'Space');
    up(win, 'Space');
    down(win, 'Space');
    expect(input.sample().jump).toBe(true);
    expect(input.sample().jump).toBe(false);
  });
});

describe('InputManager preventDefault', () => {
  it.each(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])('is called for %s', (code) => {
    const { win } = setup();
    expect(down(win, code)).toHaveBeenCalledTimes(1);
  });

  it('is called for a repeated Space keydown too', () => {
    const { win } = setup();
    expect(down(win, 'Space', true)).toHaveBeenCalledTimes(1);
  });

  it.each(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'])('is not called for %s', (code) => {
    const { win } = setup();
    expect(down(win, code)).not.toHaveBeenCalled();
  });
});

describe('InputManager blur', () => {
  it('clears held keys', () => {
    const { win, input } = setup();
    down(win, 'KeyW');
    down(win, 'ShiftLeft');
    win.dispatchEvent(new Event('blur'));
    expect(input.sample()).toMatchObject({ moveForward: 0, sprint: false });
  });
});

describe('InputManager mouse', () => {
  it('accumulates movement while locked and resets on consume', () => {
    const { doc, input, lock } = setup();
    lock();
    expect(input.pointerLocked).toBe(true);
    move(doc, 3, -2);
    move(doc, 4, 5);
    expect(input.consumeMouseDelta()).toEqual({ dx: 7, dy: 3 });
    expect(input.consumeMouseDelta()).toEqual({ dx: 0, dy: 0 });
  });

  it('ignores movement while unlocked', () => {
    const { doc, input } = setup();
    expect(input.pointerLocked).toBe(false);
    move(doc, 10, 10);
    expect(input.consumeMouseDelta()).toEqual({ dx: 0, dy: 0 });
  });

  it('ignores movement when a different element holds the lock', () => {
    const { doc, input } = setup();
    doc.pointerLockElement = {} as Element;
    move(doc, 10, 10);
    expect(input.consumeMouseDelta()).toEqual({ dx: 0, dy: 0 });
  });

  it('stops accumulating when the lock is released', () => {
    const { doc, input, lock } = setup();
    lock();
    move(doc, 1, 1);
    doc.pointerLockElement = null;
    move(doc, 5, 5);
    expect(input.consumeMouseDelta()).toEqual({ dx: 1, dy: 1 });
  });
});

describe('InputManager wheel', () => {
  it('sums the sign of deltaY and resets', () => {
    const { element, input } = setup();
    wheel(element, 120);
    wheel(element, 120);
    wheel(element, -3);
    wheel(element, 0);
    expect(input.consumeWheel()).toBe(1);
    expect(input.consumeWheel()).toBe(0);
  });

  it('counts a single large delta as one step', () => {
    const { element, input } = setup();
    wheel(element, 120);
    expect(input.consumeWheel()).toBe(1);
    wheel(element, -3);
    expect(input.consumeWheel()).toBe(-1);
  });
});

describe('InputManager wheel claims (v0.5)', () => {
  it('unclaimed: the no-owner consumer gets the wheel; a named owner gets 0 and drains nothing', () => {
    const { element, input } = setup();
    wheel(element, 120);
    expect(input.consumeWheel('calm')).toBe(0);
    expect(input.consumeWheel()).toBe(1);
  });

  it('a claim routes the wheel to the owner only; others get 0 and drain nothing', () => {
    const { element, input } = setup();
    const release = input.claimWheel('calm');
    expect(input.wheelOwner).toBe('calm');
    wheel(element, 120);
    expect(input.consumeWheel()).toBe(0);
    expect(input.consumeWheel('other')).toBe(0);
    expect(input.consumeWheel('calm')).toBe(1);
    expect(input.consumeWheel('calm')).toBe(0);
    release();
    expect(input.wheelOwner).toBeNull();
  });

  it('releasing drops unread scroll so it never reaches the camera; releasing twice is a no-op', () => {
    const { element, input } = setup();
    const release = input.claimWheel('calm');
    wheel(element, 120);
    release();
    release();
    expect(input.consumeWheel()).toBe(0);
    wheel(element, -3);
    expect(input.consumeWheel()).toBe(-1);
  });

  it('claims stack: the top wins, releasing a lower one keeps the top and its scroll', () => {
    const { element, input } = setup();
    const lower = input.claimWheel('a');
    const upper = input.claimWheel('b');
    wheel(element, 120);
    expect(input.consumeWheel('a')).toBe(0);
    lower();
    expect(input.wheelOwner).toBe('b');
    expect(input.consumeWheel('b')).toBe(1);
    wheel(element, 120);
    upper();
    expect(input.wheelOwner).toBeNull();
    expect(input.consumeWheel()).toBe(0);
  });
});

describe('InputManager pressedAtMs (v0.5)', () => {
  const at = (win: EventTarget, code: string, t: number) => {
    const e = Object.assign(new Event('keydown'), { code, repeat: false, preventDefault: () => {} });
    Object.defineProperty(e, 'timeStamp', { value: t });
    win.dispatchEvent(e);
  };

  it('is the first press latched since the last sample, and null otherwise', () => {
    const { win, input } = setup();
    expect(input.pressedAtMs('jump')).toBeNull();
    at(win, 'Space', 100);
    up(win, 'Space');
    at(win, 'Space', 140);
    input.sampleTick();
    expect(input.pressedAtMs('jump')).toBe(100);
    input.sampleTick();
    expect(input.pressedAtMs('jump')).toBeNull();
  });

  it('a repeat or a held key does not reset the time; an untimed event uses now', () => {
    const { win, input } = setup();
    at(win, 'Space', 50);
    down(win, 'Space', true);
    input.sampleTick();
    expect(input.pressedAtMs('jump')).toBe(50);
    up(win, 'Space');
    input.sampleTick();
    const before = performance.now();
    win.dispatchEvent(Object.assign(new Event('keydown'), { code: 'Space', repeat: false, preventDefault: () => {} }));
    input.sampleTick();
    const t = input.pressedAtMs('jump');
    expect(t).not.toBeNull();
    expect(Number.isFinite(t)).toBe(true);
    expect(t! >= 0).toBe(true);
    expect(before).toBeGreaterThanOrEqual(0);
  });
});

describe('InputManager click / pointer lock', () => {
  it('requests pointer lock when not locked', () => {
    const { element, requestPointerLock } = setup();
    element.dispatchEvent(new Event('click'));
    expect(requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it('does not request pointer lock when already locked', () => {
    const { element, requestPointerLock, lock } = setup();
    lock();
    element.dispatchEvent(new Event('click'));
    expect(requestPointerLock).not.toHaveBeenCalled();
  });

  it('swallows a rejected requestPointerLock promise (vitest fails the run on unhandled rejections)', async () => {
    const { element, requestPointerLock } = setup();
    requestPointerLock.mockReturnValue(Promise.reject(new Error('refused')));
    expect(() => element.dispatchEvent(new Event('click'))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when requestPointerLock returns undefined', () => {
    const { element, requestPointerLock } = setup();
    requestPointerLock.mockReturnValue(undefined);
    expect(() => element.dispatchEvent(new Event('click'))).not.toThrow();
    expect(requestPointerLock).toHaveBeenCalledTimes(1);
  });
});

describe('InputManager dispose', () => {
  it('removes every listener', () => {
    const { win, doc, element, requestPointerLock, input, lock } = setup();
    lock();
    down(win, 'KeyW');
    input.dispose();

    // Held key from before dispose stays untouched by later events.
    up(win, 'KeyW');
    win.dispatchEvent(new Event('blur'));
    expect(input.sample().moveForward).toBe(1);

    down(win, 'KeyD');
    down(win, 'Space');
    expect(input.sample()).toMatchObject({ moveRight: 0, jump: false });

    move(doc, 5, 5);
    expect(input.consumeMouseDelta()).toEqual({ dx: 0, dy: 0 });

    wheel(element, 120);
    expect(input.consumeWheel()).toBe(0);

    doc.pointerLockElement = null;
    element.dispatchEvent(new Event('click'));
    expect(requestPointerLock).not.toHaveBeenCalled();
  });

  it('can be called twice without error', () => {
    const { input } = setup();
    input.dispose();
    expect(() => input.dispose()).not.toThrow();
  });
});

describe('InputManager attacks', () => {
  const mouseDown = (el: EventTarget, button = 0): void => {
    el.dispatchEvent(Object.assign(new Event('mousedown'), { button }));
  };

  it('left mouse button while pointer-locked queues the primary attack for exactly one tick', () => {
    const { element, input, lock } = setup();
    lock();
    mouseDown(element);
    expect(input.sample().attack).toBe(1);
    expect(input.sample().attack).toBe(0);
  });

  it('ignores the click that requests pointer lock and other mouse buttons', () => {
    const { element, input, lock } = setup();
    mouseDown(element);
    expect(input.sample().attack).toBe(0);
    lock();
    mouseDown(element, 2);
    expect(input.sample().attack).toBe(0);
  });

  it('keys 1-4 select the attack slot; key repeat does not re-trigger', () => {
    const { win, input } = setup();
    ['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((code, i) => {
      key(win, 'keydown', code);
      expect(input.sample().attack).toBe(i + 1);
      key(win, 'keydown', code, true);
      expect(input.sample().attack).toBe(0);
      key(win, 'keyup', code);
    });
  });

  it('a press between ticks is not lost and the latest press wins', () => {
    const { win, input } = setup();
    key(win, 'keydown', 'Digit2');
    key(win, 'keyup', 'Digit2');
    key(win, 'keydown', 'Digit3');
    expect(input.sample().attack).toBe(3);
  });

  it('dispose removes the mousedown listener', () => {
    const { element, input, lock } = setup();
    lock();
    input.dispose();
    mouseDown(element);
    expect(input.sample().attack).toBe(0);
  });
});
