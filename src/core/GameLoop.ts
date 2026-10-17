import { FIXED_TIMESTEP, MAX_FRAME_TIME } from '../config/constants';

export interface LoopCallbacks {
  /** Advances simulation state by exactly `dt` seconds (always FIXED_TIMESTEP). */
  fixedUpdate(dt: number): void;
  /** Renders a frame; `alpha` in [0, 1) blends the previous and current simulation states. */
  render(alpha: number, frameTime: number): void;
}

/**
 * Fixed-timestep loop with an interpolation accumulator ("Fix Your Timestep").
 * Simulation runs at a deterministic 1/60 s regardless of display refresh rate;
 * rendering interpolates between the last two simulation states.
 */
export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  constructor(
    private readonly callbacks: LoopCallbacks,
    private readonly step = FIXED_TIMESTEP,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const frameTime = Math.min((now - this.lastTime) / 1000, MAX_FRAME_TIME);
    this.lastTime = now;
    this.accumulator += frameTime;

    while (this.accumulator >= this.step) {
      this.callbacks.fixedUpdate(this.step);
      this.accumulator -= this.step;
    }

    this.callbacks.render(this.accumulator / this.step, frameTime);
  };
}
