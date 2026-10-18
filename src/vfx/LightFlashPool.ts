import * as THREE from 'three';
import type { Vec3 } from './ports';
import { CAPS } from './tuning';

interface Slot {
  light: THREE.PointLight;
  start: number;
  peak: number;
  rise: number;
  decay: number;
  active: boolean;
}

/** Pool of unshadowed PointLights with a rise then linear decay intensity envelope. */
export class LightFlashPool {
  private readonly slots: Slot[] = [];
  private disposed = false;

  constructor(private readonly scene: THREE.Scene, count: number = CAPS.pointLights) {
    for (let i = 0; i < Math.max(1, count); i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      light.castShadow = false;
      light.name = 'flash-light';
      scene.add(light);
      this.slots.push({ light, start: 0, peak: 0, rise: 0, decay: 0, active: false });
    }
  }

  flash(pos: Vec3, color: number, peak: number, riseSeconds: number, decaySeconds: number, now: number): void {
    if (this.disposed || !Number.isFinite(now) || !Number.isFinite(peak) || peak <= 0) return;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return;
    let slot = this.slots.find((s) => !s.active);
    if (!slot) slot = this.slots.reduce((a, b) => (b.start < a.start ? b : a));
    slot.active = true;
    slot.start = now;
    slot.peak = peak;
    slot.rise = Number.isFinite(riseSeconds) ? Math.max(0, riseSeconds) : 0;
    slot.decay = Number.isFinite(decaySeconds) ? Math.max(0, decaySeconds) : 0;
    slot.light.color.set(color);
    slot.light.position.set(pos.x, pos.y, pos.z);
    this.apply(slot, now);
  }

  update(now: number): void {
    if (this.disposed || !Number.isFinite(now)) return;
    for (const s of this.slots) if (s.active) this.apply(s, now);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.slots) {
      this.scene.remove(s.light);
      s.light.dispose();
      s.active = false;
    }
  }

  private apply(s: Slot, now: number): void {
    const t = now - s.start;
    let i: number;
    if (t < 0) i = 0;
    else if (t < s.rise) i = s.peak * (t / s.rise);
    else if (t < s.rise + s.decay) i = s.peak * (1 - (t - s.rise) / s.decay);
    else i = 0;
    if (t >= s.rise + s.decay) {
      s.active = false;
      i = 0;
    }
    s.light.intensity = i;
  }
}
