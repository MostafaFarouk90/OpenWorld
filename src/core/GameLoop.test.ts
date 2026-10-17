import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXED_TIMESTEP, MAX_FRAME_TIME } from '../config/constants';
import { GameLoop } from './GameLoop';

// Drives requestAnimationFrame by hand so frame times are exact.
let pending: FrameRequestCallback | null = null;
function frame(now: number): void {
  const cb = pending;
  pending = null;
  cb?.(now);
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = null;
  });
  vi.spyOn(performance, 'now').mockReturnValue(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GameLoop', () => {
  it('runs one fixed step per elapsed timestep and reports the interpolation alpha', () => {
    const fixedUpdate = vi.fn();
    const render = vi.fn();
    new GameLoop({ fixedUpdate, render }).start();

    frame(FIXED_TIMESTEP * 2.5 * 1000);

    expect(fixedUpdate).toHaveBeenCalledTimes(2);
    expect(fixedUpdate).toHaveBeenCalledWith(FIXED_TIMESTEP);
    expect(render.mock.calls[0][0]).toBeCloseTo(0.5);
  });

  it('clamps a stalled frame to MAX_FRAME_TIME instead of spiralling', () => {
    const fixedUpdate = vi.fn();
    new GameLoop({ fixedUpdate, render: vi.fn() }).start();

    frame(10_000);

    expect(fixedUpdate).toHaveBeenCalledTimes(Math.floor(MAX_FRAME_TIME / FIXED_TIMESTEP));
  });

  it('stops scheduling frames after stop()', () => {
    const render = vi.fn();
    const loop = new GameLoop({ fixedUpdate: vi.fn(), render });
    loop.start();
    loop.stop();

    frame(16);

    expect(render).not.toHaveBeenCalled();
  });
});
