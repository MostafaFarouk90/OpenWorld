import * as THREE from 'three';

interface Shake {
  amplitude: number;
  seconds: number;
  age: number;
  seed: number;
}
interface Punch {
  degrees: number;
  seconds: number;
  age: number;
}

/**
 * Camera shake and FOV punch. The follow camera is never edited: `restore` removes last frame's
 * offset in the `world` render phase (before the camera system lerps from its own state), and
 * `apply` adds the new offset in `afterCamera`, so a camera that lerps from its previous position
 * never accumulates the shake.
 */
export class CameraFx {
  private shakes: Shake[] = [];
  private punches: Punch[] = [];
  private readonly offset = new THREE.Vector3();
  private fovDelta = 0;
  private seedCounter = 1;

  shake(amplitude: number, seconds: number): void {
    if (!(amplitude > 0) || !(seconds > 0) || !Number.isFinite(amplitude) || !Number.isFinite(seconds)) return;
    this.shakes.push({ amplitude, seconds, age: 0, seed: this.seedCounter++ * 12.9898 });
  }

  fovPunch(degrees: number, seconds = 0.15): void {
    if (!Number.isFinite(degrees) || degrees === 0 || !(seconds > 0) || !Number.isFinite(seconds)) return;
    this.punches.push({ degrees, seconds, age: 0 });
  }

  get active(): boolean {
    return this.shakes.length > 0 || this.punches.length > 0;
  }

  /** Undo the offsets applied last frame. Safe to call without a camera or twice. */
  restore(camera: THREE.PerspectiveCamera | null): void {
    if (!camera) {
      this.offset.set(0, 0, 0);
      this.fovDelta = 0;
      return;
    }
    if (this.offset.lengthSq() > 0) camera.position.sub(this.offset);
    this.offset.set(0, 0, 0);
    if (this.fovDelta !== 0) {
      camera.fov -= this.fovDelta;
      this.fovDelta = 0;
      camera.updateProjectionMatrix();
    }
  }

  /** Age the effects by `dt` (0 while paused) and apply them on top of the camera's own pose. */
  apply(camera: THREE.PerspectiveCamera | null, dt: number): void {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    for (const s of this.shakes) s.age += step;
    for (const p of this.punches) p.age += step;
    this.shakes = this.shakes.filter((s) => s.age < s.seconds);
    this.punches = this.punches.filter((p) => p.age < p.seconds);
    if (!camera) return;

    if (this.shakes.length > 0) {
      // Overlapping shakes keep the strongest, not the sum.
      let best: Shake | null = null;
      let bestAmp = 0;
      for (const s of this.shakes) {
        const k = 1 - s.age / s.seconds;
        const amp = s.amplitude * k * k;
        if (amp > bestAmp) {
          bestAmp = amp;
          best = s;
        }
      }
      if (best) {
        const t = best.age * 60 + best.seed;
        const x = Math.sin(t * 1.7) * Math.cos(t * 0.9);
        const y = Math.sin(t * 2.3 + 1.3) * Math.cos(t * 1.1);
        camera.updateMatrixWorld();
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        this.offset.copy(right).multiplyScalar(x * bestAmp).addScaledVector(up, y * bestAmp);
        camera.position.add(this.offset);
      }
    }

    let delta = 0;
    for (const p of this.punches) {
      const k = 1 - p.age / p.seconds;
      const d = p.degrees * k;
      if (Math.abs(d) > Math.abs(delta)) delta = d;
    }
    if (delta !== 0) {
      camera.fov += delta;
      this.fovDelta = delta;
      camera.updateProjectionMatrix();
    }
    if (this.offset.lengthSq() > 0) camera.updateMatrixWorld();
  }

  clear(camera: THREE.PerspectiveCamera | null): void {
    this.restore(camera);
    this.shakes = [];
    this.punches = [];
  }
}
