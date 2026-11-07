// Act 5 N9 (plans/act5-N9.md section 2): the lava flash. Pure timer; the plugin draws it and toasts.
export const LAVA_FLASH_S = 0.6;
/** One pulse at most this often, so a player held at the 10% floor does not strobe. */
export const LAVA_PULSE_GAP_S = 1;

export class LavaFlash {
  private left = 0;
  private gap = 0;

  /** `lava.entered`: returns whether a pulse started. */
  entered(reduced = false): boolean {
    if (this.gap > 0) return false;
    this.gap = LAVA_PULSE_GAP_S;
    this.left = reduced ? 0 : LAVA_FLASH_S;
    return true;
  }

  tick(dt: number): void {
    if (!(dt > 0)) return;
    this.left = Math.max(0, this.left - dt);
    this.gap = Math.max(0, this.gap - dt);
  }

  /** 0..1 for the vignette's opacity. */
  get strength(): number {
    return this.left / LAVA_FLASH_S;
  }

  reset(): void {
    this.left = 0;
    this.gap = 0;
  }
}
