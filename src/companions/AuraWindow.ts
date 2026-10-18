/** A timed passive window (Battle-song): started by a trigger, refreshed by another, ended by time or a cancel. */
export class AuraWindow {
  private remaining = 0;

  constructor(private readonly seconds: number) {
    if (!(seconds > 0)) throw new Error('AuraWindow: seconds must be > 0');
  }

  get active(): boolean {
    return this.remaining > 0;
  }

  get secondsLeft(): number {
    return this.remaining;
  }

  /** 'started' from inactive, 'refreshed' while active (the window restarts at full length). */
  trigger(): 'started' | 'refreshed' {
    const was = this.active;
    this.remaining = this.seconds;
    return was ? 'refreshed' : 'started';
  }

  /** True on the tick the window runs out. */
  tick(dt: number): boolean {
    if (!this.active || !(dt > 0)) return false;
    this.remaining = Math.max(0, this.remaining - dt);
    return this.remaining === 0;
  }

  /** True when a running window was cut short. */
  cancel(): boolean {
    const was = this.active;
    this.remaining = 0;
    return was;
  }
}
