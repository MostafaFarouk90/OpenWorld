import * as THREE from 'three';
import type { Vec3 } from './ports';
import { CAPS } from './tuning';

const GRID = 4; // vertices per side

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float d = length(vUv - vec2(0.5)) * 2.0;
  float a = uOpacity * smoothstep(1.0, 0.55, d);
  gl_FragColor = vec4(uColor, a);
}
`;

interface Decal {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  born: number;
  active: boolean;
}

export class DecalPool {
  private readonly decals: Decal[] = [];
  private order: Decal[] = []; // live, oldest first
  private liveMax: number;
  private readonly hardCap: number;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly heightAt?: (x: number, z: number) => number,
    max: number = CAPS.decals,
  ) {
    this.hardCap = Math.max(CAPS.decals, Math.floor(max) || 0);
    this.liveMax = Math.max(0, Math.floor(max) || 0);
  }

  get liveCount(): number {
    return this.order.length;
  }

  setMax(n: number): void {
    const v = Number.isFinite(n) ? Math.max(0, Math.min(this.hardCap, Math.floor(n))) : this.liveMax;
    this.liveMax = v;
    while (this.order.length > v) this.hide(this.order.shift() as Decal);
  }

  place(pos: Vec3, normal: Vec3 | undefined, radius: number, color: number, now: number): boolean {
    if (this.disposed || this.liveMax <= 0) return false;
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(now)) return false;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return false;
    let d: Decal;
    if (this.order.length >= this.liveMax) {
      d = this.order.shift() as Decal;
    } else {
      d = this.decals.find((x) => !x.active) ?? this.make();
    }
    this.fill(d, pos, normal, radius);
    d.material.uniforms.uColor.value.set(color);
    d.material.uniforms.uOpacity.value = 0.7;
    d.born = now;
    d.active = true;
    d.mesh.visible = true;
    this.order.push(d);
    return true;
  }

  update(now: number): void {
    if (this.disposed || !Number.isFinite(now)) return;
    const fade = CAPS.decalFadeSeconds;
    const keep: Decal[] = [];
    for (const d of this.order) {
      const age = now - d.born;
      if (age >= fade) this.hide(d);
      else {
        d.material.uniforms.uOpacity.value = 0.7 * (1 - Math.max(0, age) / fade);
        keep.push(d);
      }
    }
    this.order = keep;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const d of this.decals) {
      this.scene.remove(d.mesh);
      d.geometry.dispose();
      d.material.dispose();
    }
    this.decals.length = 0;
    this.order = [];
  }

  private make(): Decal {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GRID * GRID * 3), 3));
    const uv = new Float32Array(GRID * GRID * 2);
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        uv[(j * GRID + i) * 2] = i / (GRID - 1);
        uv[(j * GRID + i) * 2 + 1] = j / (GRID - 1);
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let j = 0; j < GRID - 1; j++) {
      for (let i = 0; i < GRID - 1; i++) {
        const a = j * GRID + i;
        idx.push(a, a + GRID, a + 1, a + 1, a + GRID, a + GRID + 1);
      }
    }
    geometry.setIndex(idx);
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.name = 'decal';
    this.scene.add(mesh);
    const d: Decal = { mesh, geometry, material, born: 0, active: false };
    this.decals.push(d);
    return d;
  }

  private hide(d: Decal): void {
    d.active = false;
    d.mesh.visible = false;
  }

  private fill(d: Decal, pos: Vec3, normal: Vec3 | undefined, radius: number): void {
    const arr = (d.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    let n: THREE.Vector3 | null = null;
    if (normal && Number.isFinite(normal.x) && Number.isFinite(normal.y) && Number.isFinite(normal.z)) {
      const v = new THREE.Vector3(normal.x, normal.y, normal.z);
      if (v.lengthSq() > 1e-8) {
        v.normalize();
        if (v.y < 0.5) n = v; // wall or steep surface: flat plane facing the normal
      }
    }
    const tangent = new THREE.Vector3();
    const bitan = new THREE.Vector3();
    if (n) {
      tangent.crossVectors(new THREE.Vector3(0, 1, 0), n);
      if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
      tangent.normalize();
      bitan.crossVectors(n, tangent).normalize();
    }
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const u = (i / (GRID - 1)) * 2 - 1;
        const v = (j / (GRID - 1)) * 2 - 1;
        const o = (j * GRID + i) * 3;
        if (n) {
          arr[o] = pos.x + (tangent.x * u + bitan.x * v) * radius + n.x * 0.02;
          arr[o + 1] = pos.y + (tangent.y * u + bitan.y * v) * radius + n.y * 0.02;
          arr[o + 2] = pos.z + (tangent.z * u + bitan.z * v) * radius + n.z * 0.02;
        } else {
          const x = pos.x + u * radius;
          const z = pos.z + v * radius;
          let y = this.heightAt ? this.heightAt(x, z) : NaN;
          if (!Number.isFinite(y)) y = pos.y;
          arr[o] = x;
          arr[o + 1] = y + 0.03;
          arr[o + 2] = z;
        }
      }
    }
    (d.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
