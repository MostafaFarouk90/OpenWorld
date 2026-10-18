import * as THREE from 'three';
import type { ParticleBudget } from './ParticleBudget';
import type { Vec3 } from './ports';
import { CAPS } from './tuning';

export type PointKind = 'ember' | 'ash' | 'smoke';
export interface PointOpts {
  color?: number;
  velocity?: Vec3;
  spread?: number;
  life?: number;
  size?: number;
  rise?: number;
}

const DEFAULTS: Record<PointKind, { color: number; life: number; size: number; rise: number; spread: number }> = {
  ember: { color: 0xff8a30, life: 2.5, size: 0.1, rise: 0.8, spread: 0.6 },
  ash: { color: 0x9a948a, life: 4, size: 0.07, rise: -0.2, spread: 0.4 },
  smoke: { color: 0x666666, life: 3, size: 0.35, rise: 0.5, spread: 0.3 },
};
const KIND_ID: Record<PointKind, number> = { ember: 0, ash: 1, smoke: 2 };

const VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute vec3 aVel;
attribute vec3 aColor;
attribute vec4 aTime; // start, life, rise, size
attribute float aKind;
uniform float uTime;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float t = uTime - aTime.x;
  float k = t / max(aTime.y, 0.0001);
  if (aTime.y <= 0.0 || t < 0.0 || k > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    vAlpha = 0.0;
    return;
  }
  vec3 p = aOrigin + aVel * t + vec3(0.0, aTime.z * t, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float grow = aKind > 1.5 ? 1.0 + 2.0 * k : (1.0 - 0.5 * k);
  gl_PointSize = aTime.w * grow * uScale / max(-mv.z, 0.1);
  float base = aKind > 1.5 ? 0.35 : 1.0;
  vAlpha = base * (1.0 - k) * min(1.0, t * 8.0);
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float a = vAlpha * clamp(1.0 - d, 0.0, 1.0);
  gl_FragColor = vec4(vColor * a, a);
}
`;

export class PointsPool {
  readonly points: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly origin: Float32Array;
  private readonly vel: Float32Array;
  private readonly color: Float32Array;
  private readonly time: Float32Array;
  private readonly kind: Float32Array;
  private readonly end: Float64Array;
  private readonly free: number[] = [];
  private order: number[] = [];
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly budget: ParticleBudget,
    private readonly capacity: number = CAPS.pointSlots,
  ) {
    const n = capacity;
    this.origin = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.color = new Float32Array(n * 3);
    this.time = new Float32Array(n * 4);
    this.kind = new Float32Array(n);
    this.end = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) this.free.push(i);
    const mk = (arr: Float32Array, size: number) => {
      const a = new THREE.BufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geometry.setAttribute('aOrigin', mk(this.origin, 3));
    this.geometry.setAttribute('aVel', mk(this.vel, 3));
    this.geometry.setAttribute('aColor', mk(this.color, 3));
    this.geometry.setAttribute('aTime', mk(this.time, 4));
    this.geometry.setAttribute('aKind', mk(this.kind, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'points';
    scene.add(this.points);
  }

  get liveCount(): number {
    return this.order.length;
  }

  emit(kind: PointKind, pos: Vec3, count: number, opts: PointOpts | undefined, now: number): number {
    if (this.disposed || !Number.isFinite(count) || count <= 0 || !Number.isFinite(now)) return 0;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return 0;
    const d = DEFAULTS[kind] ?? DEFAULTS.ember;
    const o = opts ?? {};
    const life = Math.max(0.01, fin(o.life, d.life));
    const size = fin(o.size, d.size);
    const rise = fin(o.rise, d.rise);
    const spread = fin(o.spread, d.spread);
    const col = new THREE.Color(o.color ?? d.color);
    const v = o.velocity;
    const vx = v && Number.isFinite(v.x) ? v.x : 0;
    const vy = v && Number.isFinite(v.y) ? v.y : 0;
    const vz = v && Number.isFinite(v.z) ? v.z : 0;
    const granted = this.budget.request(Math.min(Math.floor(count), this.capacity));
    for (let i = 0; i < granted; i++) {
      let slot = this.free.pop();
      if (slot === undefined) {
        slot = this.order.shift() as number;
        this.budget.release(1);
      }
      const b = slot * 3;
      this.origin[b] = pos.x; this.origin[b + 1] = pos.y; this.origin[b + 2] = pos.z;
      this.vel[b] = vx + (Math.random() * 2 - 1) * spread;
      this.vel[b + 1] = vy + (Math.random() * 2 - 1) * spread * 0.5;
      this.vel[b + 2] = vz + (Math.random() * 2 - 1) * spread;
      this.color[b] = col.r; this.color[b + 1] = col.g; this.color[b + 2] = col.b;
      const l = life * (0.75 + Math.random() * 0.5);
      const t = slot * 4;
      this.time[t] = now; this.time[t + 1] = l; this.time[t + 2] = rise; this.time[t + 3] = size * (0.7 + Math.random() * 0.6);
      this.kind[slot] = KIND_ID[kind] ?? 0;
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
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }

  private markDirty(): void {
    for (const k of ['aOrigin', 'aVel', 'aColor', 'aTime', 'aKind']) {
      (this.geometry.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

function fin(v: number | undefined, d: number): number {
  return v !== undefined && Number.isFinite(v) ? v : d;
}
