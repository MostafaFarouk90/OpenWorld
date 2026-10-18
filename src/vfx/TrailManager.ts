import * as THREE from 'three';
import type { Vec3 } from './ports';
import { TrailBuffer } from './TrailBuffer';
import { CAPS } from './tuning';

export interface RibbonTrail {
  push(hilt: Vec3, tip: Vec3, now: number): void;
  setEmitting(on: boolean): void;
  readonly emitting: boolean;
  dispose(): void;
  readonly alive: boolean;
}

const VERTS = CAPS.trailSegments * 2;

const VERT = /* glsl */ `
attribute float age;
varying float vAge;
void main() {
  vAge = age;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FRAG = /* glsl */ `
uniform vec3 uColorTail;
uniform vec3 uColorMid;
uniform vec3 uColorHot;
varying float vAge;
void main() {
  float f = clamp(1.0 - vAge, 0.0, 1.0);
  vec3 c = f < 0.5 ? mix(uColorTail, uColorMid, f * 2.0) : mix(uColorMid, uColorHot, (f - 0.5) * 2.0);
  float a = f * f;
  gl_FragColor = vec4(c * a, a);
}
`;

class Trail implements RibbonTrail {
  readonly buffer: TrailBuffer;
  readonly mesh: THREE.Mesh;
  private readonly positions = new Float32Array(VERTS * 3);
  private readonly ages = new Float32Array(VERTS);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private _emitting = true;
  private _alive = true;

  constructor(
    readonly id: string,
    private readonly scene: THREE.Scene,
    private readonly width: number,
    tail: number,
    colors: [number, number, number],
    private readonly onDispose: (t: Trail) => void,
  ) {
    this.buffer = new TrailBuffer(tail);
    const pos = new THREE.BufferAttribute(this.positions, 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    const age = new THREE.BufferAttribute(this.ages, 1);
    age.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', pos);
    this.geometry.setAttribute('age', age);
    const idx: number[] = [];
    for (let s = 0; s < CAPS.trailSegments - 1; s++) {
      const a = s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(idx);
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColorTail: { value: new THREE.Color(colors[0]) },
        uColorMid: { value: new THREE.Color(colors[1]) },
        uColorHot: { value: new THREE.Color(colors[2]) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = `trail:${id}`;
    scene.add(this.mesh);
  }

  get alive(): boolean {
    return this._alive;
  }
  get emitting(): boolean {
    return this._emitting;
  }

  setEmitting(on: boolean): void {
    this._emitting = !!on;
  }

  push(hilt: Vec3, tip: Vec3, now: number): void {
    if (!this._alive || !this._emitting) return;
    const w = this.width;
    if (w !== 1 && Number.isFinite(w)) {
      // Scale the pair's extent about its midpoint to apply the trail width.
      const mx = (hilt.x + tip.x) / 2, my = (hilt.y + tip.y) / 2, mz = (hilt.z + tip.z) / 2;
      const hx = ((hilt.x - tip.x) / 2) * w, hy = ((hilt.y - tip.y) / 2) * w, hz = ((hilt.z - tip.z) / 2) * w;
      this.buffer.push({ x: mx + hx, y: my + hy, z: mz + hz }, { x: mx - hx, y: my - hy, z: mz - hz }, now);
    } else {
      this.buffer.push(hilt, tip, now);
    }
  }

  update(now: number): void {
    if (!this._alive) return;
    this.buffer.age(now);
    const verts = this.buffer.write(this.positions, this.ages);
    const segs = verts / 2;
    this.geometry.setDrawRange(0, Math.max(0, segs - 1) * 6);
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('age') as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = segs >= 2 || (this._emitting && segs > 0);
  }

  dispose(): void {
    if (!this._alive) return;
    this._alive = false;
    this._emitting = false;
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.onDispose(this);
  }
}

export class TrailManager {
  private trails: Trail[] = []; // oldest first

  constructor(private readonly scene: THREE.Scene, private readonly maxTrails: number = CAPS.trails) {}

  get liveCount(): number {
    return this.trails.length;
  }

  create(id: string, opts: { colors: [number, number, number]; tail: number; width: number }): RibbonTrail {
    const existing = this.trails.find((t) => t.id === id);
    if (existing) {
      existing.setEmitting(true);
      return existing;
    }
    while (this.trails.length >= Math.max(1, this.maxTrails)) this.trails[0].dispose();
    const t = new Trail(id, this.scene, opts.width, opts.tail, opts.colors, (d) => {
      const i = this.trails.indexOf(d);
      if (i >= 0) this.trails.splice(i, 1);
    });
    this.trails.push(t);
    return t;
  }

  update(now: number): void {
    for (const t of [...this.trails]) t.update(now);
  }

  dispose(): void {
    for (const t of [...this.trails]) t.dispose();
    this.trails = [];
  }
}
