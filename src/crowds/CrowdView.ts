// Draws the crowd with two instanced meshes (LOD0 near with a vertex-shader walk, LOD1 far) plus a blob shadow under LOD0
// figures: three draw calls at most. Instances are packed per frame into buckets by camera distance; figures shrink to
// nothing between fadeStart and drawDistance so nothing pops on the long Keep road.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CrowdSim } from './CrowdSim';
import { CROWD_TUNING } from './tuning';

export const CROWD_SHADER_CACHE_KEY = 'crowd-walk-v1';
const HIP_Y = 0.82;

function withLimb(g: THREE.BufferGeometry, limb: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const n = ng.getAttribute('position').count;
  ng.setAttribute('aLimb', new THREE.BufferAttribute(new Float32Array(n).fill(limb), 1));
  ng.deleteAttribute('uv');
  return ng;
}

/** Placeholder townsperson: two legs, a capsule body and a head; about 1.85 m, feet at the origin. */
export function buildLod0Geometry(): THREE.BufferGeometry {
  const legL = new THREE.BoxGeometry(0.13, HIP_Y, 0.15).translate(0.1, HIP_Y / 2, 0);
  const legR = new THREE.BoxGeometry(0.13, HIP_Y, 0.15).translate(-0.1, HIP_Y / 2, 0);
  const body = new THREE.CapsuleGeometry(0.22, 0.45, 2, 7).translate(0, 1.15, 0);
  const head = new THREE.SphereGeometry(0.13, 7, 5).translate(0, 1.72, 0);
  const parts = [withLimb(legL, 1), withLimb(legR, -1), withLimb(body, 0), withLimb(head, 0)];
  const merged = mergeGeometries(parts);
  for (const p of [legL, legR, body, head, ...parts]) p.dispose();
  if (!merged) throw new Error('crowds: could not merge the figure geometry');
  return merged;
}

export function buildLod1Geometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.2, 0.24, 1.6, 6).translate(0, 0.8, 0);
  const head = new THREE.SphereGeometry(0.13, 5, 3).translate(0, 1.72, 0);
  const parts = [body.toNonIndexed(), head.toNonIndexed()];
  for (const p of parts) p.deleteAttribute('uv');
  const merged = mergeGeometries(parts);
  for (const p of [body, head, ...parts]) p.dispose();
  if (!merged) throw new Error('crowds: could not merge the far figure geometry');
  return merged;
}

interface ShaderLike {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
}

/** Leg swing about the hip and a small bob, from a per-instance (phase, frequency, amplitude) and one time uniform. */
export function patchWalkShader(shader: ShaderLike, uTime: { value: number }): void {
  shader.uniforms.uTime = uTime;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aLimb;\nattribute vec3 aWalk;\nuniform float uTime;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
float crowdSw = sin(uTime * aWalk.y + aWalk.x) * aWalk.z;
if (abs(aLimb) > 0.5) {
  float ca = cos(aLimb * crowdSw * 0.5);
  float sa = sin(aLimb * crowdSw * 0.5);
  float py = transformed.y - ${HIP_Y.toFixed(2)};
  transformed.y = ${HIP_Y.toFixed(2)} + py * ca - transformed.z * sa;
  transformed.z = py * sa + transformed.z * ca;
} else {
  transformed.y += abs(crowdSw) * 0.035;
}`,
    );
}

export interface CrowdViewStats {
  lod0: number;
  lod1: number;
}

export class CrowdView {
  readonly group = new THREE.Group();
  readonly lod0: THREE.InstancedMesh;
  readonly lod1: THREE.InstancedMesh;
  readonly blobs: THREE.InstancedMesh;
  readonly uTime = { value: 0 };
  lod0Range: number = CROWD_TUNING.lod0Range;
  readonly stats: CrowdViewStats = { lod0: 0, lod1: 0 };
  private readonly walk: THREE.InstancedBufferAttribute;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly colours: THREE.Color[];
  private disposed = false;

  constructor(capacity: number) {
    const cap = Math.max(1, capacity);
    const mat0 = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat0.onBeforeCompile = (shader) => patchWalkShader(shader as unknown as ShaderLike, this.uTime);
    mat0.customProgramCacheKey = () => CROWD_SHADER_CACHE_KEY;
    const geo0 = buildLod0Geometry();
    this.walk = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.walk.setUsage(THREE.DynamicDrawUsage);
    geo0.setAttribute('aWalk', this.walk);
    this.lod0 = new THREE.InstancedMesh(geo0, mat0, cap);
    this.lod1 = new THREE.InstancedMesh(buildLod1Geometry(), new THREE.MeshLambertMaterial({ color: 0xffffff }), cap);
    const blobGeo = new THREE.CircleGeometry(0.42, 10).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
    this.blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }), cap);
    this.blobs.renderOrder = -1;
    for (const mesh of [this.lod0, this.lod1, this.blobs]) {
      mesh.name = `crowd-${mesh === this.lod0 ? 'lod0' : mesh === this.lod1 ? 'lod1' : 'blobs'}`;
      // r168 caches the instanced bounding sphere; instances move every frame.
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      this.group.add(mesh);
    }
    // Allocate instance colour buffers up front.
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < cap; i++) {
      this.lod0.setColorAt(i, white);
      this.lod1.setColorAt(i, white);
    }
    this.lod0.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.lod1.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.colours = CROWD_TUNING.palette.map((c) => new THREE.Color(c));
    this.group.name = 'crowds';
  }

  /** Packs every live figure into its LOD bucket. `eye` is the camera (or the player when there is no camera). */
  write(sim: CrowdSim, eye: { x: number; y: number; z: number }, time: number): void {
    this.uTime.value = time;
    let n0 = 0;
    let n1 = 0;
    const r0 = this.lod0Range * this.lod0Range;
    const t = CROWD_TUNING;
    const far = t.drawDistance * t.drawDistance;
    const put = (x: number, y: number, z: number, yaw: number, colour: number, phase: number, freq: number, amp: number): void => {
      const dx = x - eye.x;
      const dy = y - eye.y;
      const dz = z - eye.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= far) return;
      const d = Math.sqrt(d2);
      const s = d > t.fadeStart ? Math.max(0, (t.drawDistance - d) / (t.drawDistance - t.fadeStart)) : 1;
      if (s <= 0) return;
      this.q.setFromAxisAngle(this.up, yaw);
      this.scl.setScalar(s);
      if (d2 < r0) {
        this.pos.set(x, y, z);
        this.m.compose(this.pos, this.q, this.scl);
        this.lod0.setMatrixAt(n0, this.m);
        this.blobs.setMatrixAt(n0, this.m);
        this.lod0.setColorAt(n0, this.colours[colour]);
        this.walk.setXYZ(n0, phase, freq, amp);
        n0++;
      } else {
        // Far figures bob on the CPU (no legs to swing).
        this.pos.set(x, y + (amp > 0 ? Math.abs(Math.sin(time * freq + phase)) * 0.035 : 0), z);
        this.m.compose(this.pos, this.q, this.scl);
        this.lod1.setMatrixAt(n1, this.m);
        this.lod1.setColorAt(n1, this.colours[colour]);
        n1++;
      }
    };
    for (const w of sim.walkers) if (w.active) put(w.x, w.y, w.z, w.yaw, w.colour, w.phase, w.freq, w.walking ? 1 : 0);
    for (const m of sim.idle) if (m.active) put(m.x, m.y, m.z, m.yaw, m.colour, m.phase, 1.2, 0);
    this.lod0.count = n0;
    this.blobs.count = n0;
    this.lod1.count = n1;
    if (n0) {
      this.lod0.instanceMatrix.needsUpdate = true;
      this.blobs.instanceMatrix.needsUpdate = true;
      this.lod0.instanceColor!.needsUpdate = true;
      this.walk.needsUpdate = true;
    }
    if (n1) {
      this.lod1.instanceMatrix.needsUpdate = true;
      this.lod1.instanceColor!.needsUpdate = true;
    }
    this.stats.lod0 = n0;
    this.stats.lod1 = n1;
  }

  /** Draw calls this frame (0 to 3). */
  get drawCalls(): number {
    return (this.lod0.count ? 2 : 0) + (this.lod1.count ? 1 : 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    for (const mesh of [this.lod0, this.lod1, this.blobs]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
  }
}
