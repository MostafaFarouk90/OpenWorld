// Act 4 L3 (plans/act4-L3.md 2.4): blends scene fields (fog near, far and colour, the sky colour, light intensities
// and colours) toward a target by weight without fighting anyone else who writes them. The shipped act3 fog blender
// pattern (`createFogBlender`, act3World.plugin.ts), generalised: each field is tracked on its own; a field that no
// longer holds what this last wrote was changed by someone else (a view-distance step, an interior's restore), so its
// current value becomes the new base; weight 0 puts every field back to its base exactly and lets go.
import * as THREE from 'three';

const sameColor = (a: THREE.Color, b: THREE.Color): boolean =>
  Math.abs(a.r - b.r) <= 1 / 255 && Math.abs(a.g - b.g) <= 1 / 255 && Math.abs(a.b - b.b) <= 1 / 255;

/** One numeric field: `get` and `set` on its owner, and how to mix toward the target. */
export interface NumberField {
  get(): number;
  set(v: number): void;
  /** The value at `weight` from `base`. */
  mix(base: number, weight: number): number;
}

/** One colour field, mutated in place (fog.color, a light's colour, a Color used as the scene background). */
export interface ColorField {
  get(): THREE.Color | null;
  target: THREE.Color;
}

interface NumberSlot {
  f: NumberField;
  base: number;
  written: number;
}

interface ColorSlot {
  f: ColorField;
  base: THREE.Color;
  written: THREE.Color;
  owner: THREE.Color | null;
}

export class FieldBlender {
  private readonly nums: NumberSlot[] = [];
  private readonly cols: ColorSlot[] = [];
  private active = false;

  addNumber(f: NumberField): this {
    this.nums.push({ f, base: 0, written: Number.NaN });
    return this;
  }

  addColor(f: ColorField): this {
    this.cols.push({ f, base: new THREE.Color(), written: new THREE.Color(), owner: null });
    return this;
  }

  get engaged(): boolean {
    return this.active;
  }

  apply(weight: number): void {
    if (!(weight > 0)) {
      this.restore();
      return;
    }
    const w = Math.min(1, weight);
    for (const s of this.nums) {
      const cur = s.f.get();
      if (!this.active || cur !== s.written) s.base = cur;
      const v = s.f.mix(s.base, w);
      s.f.set(v);
      s.written = s.f.get();
    }
    for (const s of this.cols) {
      const c = s.f.get();
      if (!c) {
        s.owner = null;
        continue;
      }
      // A different Color object (an interior swapped the background) or a changed value both take a new base.
      if (!this.active || s.owner !== c || !sameColor(c, s.written)) s.base.copy(c);
      c.copy(s.base).lerp(s.f.target, w);
      s.written.copy(c);
      s.owner = c;
    }
    this.active = true;
  }

  /** Puts back every field this still owns; a field someone else changed since is left alone. */
  restore(): void {
    if (!this.active) return;
    for (const s of this.nums) if (s.f.get() === s.written) s.f.set(s.base);
    for (const s of this.cols) {
      const c = s.f.get();
      if (c && c === s.owner && sameColor(c, s.written)) c.copy(s.base);
      s.owner = null;
    }
    this.active = false;
  }
}

/** Mixers. */
export const toward = (target: number) => (base: number, w: number): number => base + (target - base) * w;
/** Toward `target` but never past the base in its direction (fog far only closes in, never opens out). */
export const closeTo = (target: number) => (base: number, w: number): number => (target < base ? base + (target - base) * w : base);
export const scaled = (factor: number) => (base: number, w: number): number => base * (1 + (factor - 1) * w);
