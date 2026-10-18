import type { SightBlocker } from './perceptionPort';

/**
 * Quiet Soles and Ash Cloud hooks (Ashblade Smokecloak 1 and 2, design 9.4; thread 15 calls them). They apply
 * everywhere, not only in stealth sections (should-fix 8). Sim time comes from `tick(dt)`.
 */
export class StealthEffects {
  private readonly noise = new Map<number, number>();
  private readonly clouds: { id: number; b: SightBlocker; left: number }[] = [];
  private readonly live: SightBlocker[] = [];
  private seq = 0;

  /** Multiplies footstep noise (Quiet Soles: 0). Out-of-range scales clamp to 0..1. Returns an idempotent release. */
  addNoiseScale(source: string, scale: number): () => void {
    if (typeof source !== 'string' || source === '') throw new Error('stealth.addNoiseScale: source must be a non-empty string');
    const id = ++this.seq;
    this.noise.set(id, Number.isFinite(scale) ? Math.max(0, Math.min(1, scale)) : 1);
    return () => void this.noise.delete(id);
  }

  /** A smoke cloud that blocks sight through a radius for `seconds` (Ash Cloud: 6 s). Returns an early release. */
  addSightBlocker(b: { x: number; z: number; r: number; seconds: number }): () => void {
    if (![b.x, b.z, b.r, b.seconds].every(Number.isFinite) || !(b.r > 0) || !(b.seconds > 0)) return () => {};
    const id = ++this.seq;
    this.clouds.push({ id, b: { x: b.x, z: b.z, r: b.r }, left: b.seconds });
    this.rebuild();
    return () => {
      const i = this.clouds.findIndex((c) => c.id === id);
      if (i >= 0) {
        this.clouds.splice(i, 1);
        this.rebuild();
      }
    };
  }

  noiseScale(): number {
    let s = 1;
    for (const v of this.noise.values()) s *= v;
    return s;
  }

  /** Live blockers; the same array until a cloud is added or expires. */
  blockers(): readonly SightBlocker[] {
    return this.live;
  }

  tick(dt: number): void {
    if (!(dt > 0) || this.clouds.length === 0) return;
    let changed = false;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      this.clouds[i].left -= dt;
      if (this.clouds[i].left <= 0) {
        this.clouds.splice(i, 1);
        changed = true;
      }
    }
    if (changed) this.rebuild();
  }

  private rebuild(): void {
    this.live.length = 0;
    for (const c of this.clouds) this.live.push(c.b);
  }

  clear(): void {
    this.noise.clear();
    this.clouds.length = 0;
    this.live.length = 0;
  }
}
