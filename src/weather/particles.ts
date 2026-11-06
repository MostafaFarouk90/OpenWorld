// Act 4 L3: a box of CPU-moved ash particles that follows the camera (the spike's prototype: one THREE.Points, 60 m box).
// Used by the storm (wind-driven) and by Harrowmark's ash-fall (slow, near vertical). Render only.
import * as THREE from 'three';
import { makeRng } from '../world/poi/rng';

export interface AshParticleOptions {
  count: number;
  /** Half-size of the box around the camera (m). */
  half: number;
  /** Wind (m/s) in x and z, and fall speed (m/s, positive down). */
  wind: { x: number; z: number };
  fall: number;
  /** Random sway (m/s). */
  sway: number;
  color: number;
  size: number;
  seed: string;
}

export class AshParticles {
  readonly object: THREE.Points;
  private readonly pos: Float32Array;
  private readonly local: Float32Array;
  private readonly geom: THREE.BufferGeometry;
  private readonly mat: THREE.PointsMaterial;
  private t = 0;

  constructor(private readonly o: AshParticleOptions) {
    const n = Math.max(0, Math.floor(o.count));
    this.pos = new Float32Array(n * 3);
    this.local = new Float32Array(n * 3);
    const rng = makeRng(o.seed);
    for (let i = 0; i < n * 3; i++) this.local[i] = rng.range(-o.half, o.half);
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({ color: o.color, size: o.size, transparent: true, opacity: 0, depthWrite: false, fog: true });
    this.object = new THREE.Points(this.geom, this.mat);
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.object.name = `ash-particles:${o.seed}`;
  }

  get count(): number {
    return this.pos.length / 3;
  }

  /** Moves the particles on and shows `fraction` of them at `opacity` around `cam`; 0 hides the object. */
  update(cam: THREE.Vector3Like, dt: number, fraction: number, opacity: number): void {
    const n = this.count;
    const shown = Math.round(n * Math.min(1, Math.max(0, fraction)));
    this.object.visible = shown > 0 && opacity > 0;
    if (!this.object.visible) return;
    this.t += dt;
    const { half, wind, fall, sway } = this.o;
    const span = half * 2;
    const wrap = (v: number) => ((((v + half) % span) + span) % span) - half;
    for (let i = 0; i < shown; i++) {
      const k = i * 3;
      const ph = i * 0.37;
      this.local[k] = wrap(this.local[k] + (wind.x + Math.sin(this.t * 1.3 + ph) * sway) * dt);
      this.local[k + 1] = wrap(this.local[k + 1] - fall * dt);
      this.local[k + 2] = wrap(this.local[k + 2] + (wind.z + Math.cos(this.t * 1.1 + ph) * sway) * dt);
      this.pos[k] = cam.x + this.local[k];
      this.pos[k + 1] = cam.y + this.local[k + 1];
      this.pos[k + 2] = cam.z + this.local[k + 2];
    }
    this.geom.setDrawRange(0, shown);
    (this.geom.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.mat.opacity = opacity;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.geom.dispose();
    this.mat.dispose();
  }
}
