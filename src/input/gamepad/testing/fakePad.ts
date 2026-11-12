import { vi } from 'vitest';
import type { GamepadLike } from '../GamepadInput';
import { PAD_BUTTON_COUNT } from '../padLayout';

/** A scriptable standard-mapping pad for tests and the real-game run. */
export class FakePad implements GamepadLike {
  id = 'Fake Xbox Controller (STANDARD GAMEPAD)';
  mapping = 'standard';
  connected = true;
  buttons = Array.from({ length: PAD_BUTTON_COUNT }, () => ({ pressed: false, value: 0 }));
  axes = [0, 0, 0, 0];
  vibrationActuator = { playEffect: vi.fn(async () => 'complete') };
  constructor(public index = 0) {}
  set(button: number, down: boolean): this {
    this.buttons[button] = { pressed: down, value: down ? 1 : 0 };
    return this;
  }
  /** Left stick: x right, y forward (the API's y is down, so it is negated here). */
  left(x: number, y: number): this {
    this.axes[0] = x;
    this.axes[1] = -y;
    return this;
  }
  right(x: number, y: number): this {
    this.axes[2] = x;
    this.axes[3] = -y;
    return this;
  }
}

/** A `getGamepads` stand-in over a mutable list. */
export function padList(...pads: (GamepadLike | null)[]): { pads: (GamepadLike | null)[]; get: () => (GamepadLike | null)[] } {
  const list = { pads, get: () => list.pads };
  return list;
}
