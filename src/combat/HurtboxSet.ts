import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { COMBAT } from '../config/constants';
import { KNIGHT_HURTBOX_DEFS } from './hurtboxLayout';
import type { HurtboxDef } from './types';

export interface HurtboxCapsule {
  name: string;
  /** World-space axis endpoints, refreshed by update(). */
  a: THREE.Vector3;
  b: THREE.Vector3;
  radius: number;
}

interface Binding {
  bone: THREE.Object3D;
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
}

const BASE_COLOR = new THREE.Color(0.1, 0.9, 0.3);
const FLASH_COLOR = new THREE.Color(1, 0.15, 0.1);

function findBone(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  return (
    root.getObjectByName(name) ??
    (name.includes('.') ? root.getObjectByName(name.replace(/\./g, '')) : undefined)
  );
}

/**
 * Skeleton-following capsule hurtboxes merged into one world-space triangle mesh with a MeshBVH.
 * Call update() after the skeleton's world matrices are current (it does not update them itself).
 */
export class HurtboxSet {
  readonly count: number;
  readonly owner: unknown;
  readonly geometry: THREE.BufferGeometry;
  readonly bvh: MeshBVH;
  readonly capsules: HurtboxCapsule[] = [];
  readonly missing: string[] = [];
  readonly debugMesh: THREE.Mesh;

  private readonly bindings: Binding[] = [];
  private readonly radial: number;
  private readonly rings: number;
  private readonly vertsPer: number;
  private readonly trisPer: number;
  private triToCapsule = new Uint16Array(0);
  private readonly flashLeft: Float32Array;
  private readonly flashTotal: Float32Array;
  private readonly cosT: Float32Array;
  private readonly sinT: Float32Array;
  private disposed = false;

  private readonly axis = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(
    root: THREE.Object3D,
    defs: HurtboxDef[] = KNIGHT_HURTBOX_DEFS,
    owner?: unknown,
  ) {
    this.owner = owner;
    this.radial = Math.max(3, Math.floor(COMBAT.hurtboxRadialSegments));
    this.rings = Math.max(1, Math.floor(COMBAT.hurtboxHemisphereRings));

    for (const d of defs) {
      const bone = findBone(root, d.bone);
      if (!bone) {
        this.missing.push(d.name);
        continue;
      }
      this.bindings.push({
        bone,
        start: new THREE.Vector3(d.start.x, d.start.y, d.start.z),
        end: new THREE.Vector3(d.end.x, d.end.y, d.end.z),
        radius: d.radius,
      });
      this.capsules.push({
        name: d.name,
        a: new THREE.Vector3(),
        b: new THREE.Vector3(),
        radius: d.radius,
      });
    }
    this.count = this.capsules.length;

    const n = this.radial;
    const r = this.rings;
    this.vertsPer = 2 + 2 * r * n;
    this.trisPer = 2 * n + (2 * r - 1) * n * 2;
    this.cosT = new Float32Array(n);
    this.sinT = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      this.cosT[k] = Math.cos((k / n) * Math.PI * 2);
      this.sinT[k] = Math.sin((k / n) * Math.PI * 2);
    }
    this.flashLeft = new Float32Array(this.count);
    this.flashTotal = new Float32Array(this.count);

    this.geometry = this.buildGeometry();
    this.update();
    this.bvh = new MeshBVH(this.geometry, { maxLeafTris: 4 });
    this.buildTriMap();

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      wireframe: true,
      depthTest: false,
      transparent: true,
    });
    this.debugMesh = new THREE.Mesh(this.geometry, mat);
    this.debugMesh.matrixAutoUpdate = false;
    this.debugMesh.frustumCulled = false;
    this.debugMesh.visible = false;
    this.debugMesh.renderOrder = 999;
    this.debugMesh.name = 'HurtboxDebug';
    for (let i = 0; i < this.count; i++) this.paint(i, 0);
  }

  private buildGeometry(): THREE.BufferGeometry {
    const n = this.radial;
    const r = this.rings;
    const vp = this.vertsPer;
    const total = vp * this.count;
    const index = new Uint32Array(this.trisPer * 3 * this.count);
    let o = 0;
    for (let c = 0; c < this.count; c++) {
      const base = c * vp;
      const bottom = base; // pole at a side
      const top = base + 1; // pole at b side
      const ring = (i: number, k: number) => base + 2 + i * n + (k % n);
      for (let k = 0; k < n; k++) {
        index[o++] = bottom;
        index[o++] = ring(0, k + 1);
        index[o++] = ring(0, k);
      }
      for (let i = 0; i < 2 * r - 1; i++) {
        for (let k = 0; k < n; k++) {
          index[o++] = ring(i, k);
          index[o++] = ring(i, k + 1);
          index[o++] = ring(i + 1, k);
          index[o++] = ring(i, k + 1);
          index[o++] = ring(i + 1, k + 1);
          index[o++] = ring(i + 1, k);
        }
      }
      for (let k = 0; k < n; k++) {
        index[o++] = top;
        index[o++] = ring(2 * r - 1, k);
        index[o++] = ring(2 * r - 1, k + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    return g;
  }

  /** Triangle -> capsule map, derived after the BVH build since it may reorder the index. */
  private buildTriMap(): void {
    const idx = this.geometry.getIndex();
    const triCount = idx ? idx.count / 3 : 0;
    this.triToCapsule = new Uint16Array(triCount);
    if (!idx) return;
    for (let t = 0; t < triCount; t++) {
      this.triToCapsule[t] = Math.floor(idx.getX(t * 3) / this.vertsPer);
    }
  }

  update(): void {
    if (this.count === 0 || this.disposed) return;
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const n = this.radial;
    const r = this.rings;
    const { axis, u, v, tmp } = this;
    for (let c = 0; c < this.count; c++) {
      const bd = this.bindings[c];
      const cap = this.capsules[c];
      const m = bd.bone.matrixWorld;
      cap.a.copy(bd.start).applyMatrix4(m);
      cap.b.copy(bd.end).applyMatrix4(m);
      axis.subVectors(cap.b, cap.a);
      const len = axis.length();
      if (len > 1e-8) axis.multiplyScalar(1 / len);
      else axis.set(0, 1, 0);
      // Orthonormal basis (u, v, axis) with u x v = axis.
      if (Math.abs(axis.x) < 0.9) tmp.set(1, 0, 0);
      else tmp.set(0, 1, 0);
      u.crossVectors(tmp, axis).normalize();
      v.crossVectors(axis, u);
      // Radius follows the bone's world scale (the Knight rig is scaled by its avatar root).
      const rad = bd.radius * m.getMaxScaleOnAxis();
      cap.radius = rad;
      let o = c * this.vertsPer * 3;
      // bottom pole
      arr[o++] = cap.a.x - axis.x * rad;
      arr[o++] = cap.a.y - axis.y * rad;
      arr[o++] = cap.a.z - axis.z * rad;
      // top pole
      arr[o++] = cap.b.x + axis.x * rad;
      arr[o++] = cap.b.y + axis.y * rad;
      arr[o++] = cap.b.z + axis.z * rad;
      for (let i = 0; i < 2 * r; i++) {
        const lower = i < r;
        const j = lower ? i + 1 : 2 * r - i; // 1..r, polar angle step from the pole
        const theta = (Math.PI / 2) * (j / r);
        const ct = Math.cos(theta) * rad;
        const rr = Math.sin(theta) * rad;
        const end = lower ? cap.a : cap.b;
        const sgn = lower ? -1 : 1;
        const cx = end.x + axis.x * ct * sgn;
        const cy = end.y + axis.y * ct * sgn;
        const cz = end.z + axis.z * ct * sgn;
        for (let k = 0; k < n; k++) {
          const cs = this.cosT[k] * rr;
          const sn = this.sinT[k] * rr;
          arr[o++] = cx + u.x * cs + v.x * sn;
          arr[o++] = cy + u.y * cs + v.y * sn;
          arr[o++] = cz + u.z * cs + v.z * sn;
        }
      }
    }
    pos.needsUpdate = true;
    this.bvh?.refit();
  }

  nameOfTriangle(triIndex: number): string {
    const c = this.triToCapsule[triIndex];
    return c === undefined ? '' : (this.capsules[c]?.name ?? '');
  }

  setDebugVisible(v: boolean): void {
    this.debugMesh.visible = v;
  }

  flash(name: string, seconds: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.capsules[i].name !== name) continue;
      this.flashLeft[i] = seconds;
      this.flashTotal[i] = Math.max(seconds, 1e-6);
      this.paint(i, seconds > 0 ? 1 : 0);
    }
  }

  tickFlash(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.flashLeft[i] <= 0) continue;
      this.flashLeft[i] = Math.max(0, this.flashLeft[i] - dt);
      this.paint(i, this.flashLeft[i] / this.flashTotal[i]);
    }
  }

  private paint(i: number, t: number): void {
    const col = this.geometry.getAttribute('color') as THREE.BufferAttribute;
    this.c.copy(BASE_COLOR).lerp(FLASH_COLOR, t);
    const start = i * this.vertsPer;
    for (let k = 0; k < this.vertsPer; k++) col.setXYZ(start + k, this.c.r, this.c.g, this.c.b);
    col.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geometry.dispose();
    (this.debugMesh.material as THREE.Material).dispose();
    this.debugMesh.removeFromParent();
  }
}
