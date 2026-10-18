import * as THREE from 'three';
import type { ParticleBudget } from './ParticleBudget';
import type { Vec3 } from './ports';
import { CAPS } from './tuning';

export interface SparkOpts {
  color?: number;
  speed?: number;
  gravity?: number;
  life?: number;
  spread?: number;
  lineSparks?: boolean;
}

const VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute vec3 aVel;
attribute vec3 aColor;
attribute vec4 aTime; // start, life, gravity, line stretch
uniform float uTime;
varying vec3 vColor;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float t = uTime - aTime.x;
  float k = t / max(aTime.y, 0.0001);
  vUv = position.xy * 2.0;
  if (aTime.y <= 0.0 || t < 0.0 || k > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec3(0.0);
    vAlpha = 0.0;
    return;
  }
  vec3 vel = aVel + vec3(0.0, -aTime.z, 0.0) * t;
  vec3 p = aOrigin + aVel * t + vec3(0.0, -aTime.z, 0.0) * (t * t * 0.5);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = 0.05 * (1.0 - 0.6 * k);
  vec2 corner = position.xy;
  if (aTime.w > 0.5) {
    vec3 vv = (modelViewMatrix * vec4(vel, 0.0)).xyz;
    vec2 dir = normalize(vv.xy + vec2(0.0001, 0.0));
    vec2 perp = vec2(-dir.y, dir.x);
    mv.xy += (perp * corner.x * 0.4 + dir * corner.y * (1.0 + length(vv) * 0.12)) * size;
  } else {
    mv.xy += corner * size;
  }
  vColor = aColor;
  vAlpha = 1.0 - k * k;
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float d = clamp(1.0 - length(vUv), 0.0, 1.0);
  float a = vAlpha * d;
  gl_FragColor = vec4(vColor * a, a);
}
`;

export class SparkPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly origin: Float32Array;
  private readonly vel: Float32Array;
  private readonly color: Float32Array;
  private readonly time: Float32Array;
  private readonly end: Float64Array;
  private readonly free: number[] = [];
  private order: number[] = []; // live slots, oldest first
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly budget: ParticleBudget,
    private readonly capacity: number = CAPS.sparkInstances,
  ) {
    const n = capacity;
    this.origin = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.color = new Float32Array(n * 3);
    this.time = new Float32Array(n * 4);
    this.end = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) this.free.push(i);
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
    );
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (arr: Float32Array, size: number) => {
      const a = new THREE.InstancedBufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.geometry.setAttribute('aOrigin', mk(this.origin, 3));
    this.geometry.setAttribute('aVel', mk(this.vel, 3));
    this.geometry.setAttribute('aColor', mk(this.color, 3));
    this.geometry.setAttribute('aTime', mk(this.time, 4));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, n);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sparks';
    scene.add(this.mesh);
  }

  get liveCount(): number {
    return this.order.length;
  }

  burst(pos: Vec3, normal: Vec3 | undefined, count: number, opts: SparkOpts | undefined, now: number): number {
    if (this.disposed || !Number.isFinite(count) || count <= 0 || !Number.isFinite(now)) return 0;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return 0;
    const o = opts ?? {};
    const speed = finiteOr(o.speed, 4);
    const gravity = finiteOr(o.gravity, 9);
    const life = Math.max(0.01, finiteOr(o.life, 0.5));
    const spread = finiteOr(o.spread, 0.8);
    const col = new THREE.Color(o.color ?? 0xffc060);
    let nx = 0, ny = 1, nz = 0;
    if (normal && Number.isFinite(normal.x) && Number.isFinite(normal.y) && Number.isFinite(normal.z)) {
      const l = Math.hypot(normal.x, normal.y, normal.z);
      if (l > 1e-6) { nx = normal.x / l; ny = normal.y / l; nz = normal.z / l; }
    }
    const granted = this.budget.request(Math.min(Math.floor(count), this.capacity));
    for (let i = 0; i < granted; i++) {
      let slot = this.free.pop();
      if (slot === undefined) {
        slot = this.order.shift() as number;
        this.budget.release(1);
      }
      const rx = (Math.random() * 2 - 1) * spread, ry = (Math.random() * 2 - 1) * spread, rz = (Math.random() * 2 - 1) * spread;
      const s = speed * (0.5 + Math.random() * 0.7);
      const b = slot * 3;
      this.origin[b] = pos.x; this.origin[b + 1] = pos.y; this.origin[b + 2] = pos.z;
      this.vel[b] = (nx + rx) * s; this.vel[b + 1] = (ny + ry) * s; this.vel[b + 2] = (nz + rz) * s;
      this.color[b] = col.r; this.color[b + 1] = col.g; this.color[b + 2] = col.b;
      const l = life * (0.7 + Math.random() * 0.6);
      const t = slot * 4;
      this.time[t] = now; this.time[t + 1] = l; this.time[t + 2] = gravity; this.time[t + 3] = o.lineSparks ? 1 : 0;
      this.end[slot] = now + l;
      this.order.push(slot);
    }
    if (granted > 0) this.markDirty();
    return granted;
  }

  update(now: number): void {
    if (this.disposed) return;
    this.material.uniforms.uTime.value = now;
    if (!Number.isFinite(now)) return;
    let freed = 0;
    const keep: number[] = [];
    for (const slot of this.order) {
      if (this.end[slot] <= now) {
        this.time[slot * 4 + 1] = 0;
        this.free.push(slot);
        freed++;
      } else keep.push(slot);
    }
    if (freed > 0) {
      this.order = keep;
      this.budget.release(freed);
      this.markDirty();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.budget.release(this.order.length);
    this.order = [];
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private markDirty(): void {
    for (const k of ['aOrigin', 'aVel', 'aColor', 'aTime']) {
      (this.geometry.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

function finiteOr(v: number | undefined, d: number): number {
  return v !== undefined && Number.isFinite(v) ? v : d;
}
