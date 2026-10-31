import * as THREE from 'three';
import { LOOK } from './tuning';

const DISC = new THREE.CircleGeometry(1, 28);
const RING = new THREE.RingGeometry(0.86, 1, 40);
const DOME = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);

function waterMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
}

/** The 1.0 s telegraph: a dome of water swelling at the surfacing point with a foam ring round it. */
export class WaterBulge {
  readonly mesh = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly foam: THREE.Mesh;
  private readonly domeMat = waterMat(LOOK.water, 0.7);
  private readonly foamMat = waterMat(LOOK.foam, 0.6);
  private t = 0;
  private total = 1;
  private on = false;

  constructor() {
    this.mesh.name = 'murkjaw-bulge';
    this.dome = new THREE.Mesh(DOME, this.domeMat);
    this.foam = new THREE.Mesh(RING, this.foamMat);
    this.foam.rotation.x = -Math.PI / 2;
    this.mesh.add(this.dome, this.foam);
    this.mesh.visible = false;
  }

  get showing(): boolean {
    return this.on;
  }

  show(at: THREE.Vector3Like, seconds: number): void {
    this.mesh.position.set(at.x, at.y, at.z);
    this.t = 0;
    this.total = Math.max(0.05, seconds);
    this.on = true;
    this.mesh.visible = true;
    this.update(0);
  }

  stop(): void {
    this.on = false;
    this.mesh.visible = false;
  }

  update(dt: number): void {
    if (!this.on) return;
    this.t += Math.max(0, dt);
    const k = Math.min(1, this.t / this.total);
    const wobble = 1 + 0.08 * Math.sin(this.t * 22);
    this.dome.scale.set(0.6 + 1.6 * k, (0.15 + 0.9 * k) * wobble, 0.6 + 1.6 * k);
    this.foam.scale.setScalar(1 + 2.4 * k);
    this.foamMat.opacity = 0.35 + 0.4 * k;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.domeMat.dispose();
    this.foamMat.dispose();
  }
}

/** The water wave: a foam ring spreading from the surfacing point to `radius` over `seconds`. */
export class WaveRing {
  readonly mesh: THREE.Mesh;
  private readonly mat = waterMat(LOOK.foam, 0.75);
  private t = 0;
  private total = 1;
  private radius = 1;

  constructor() {
    this.mesh = new THREE.Mesh(RING, this.mat);
    this.mesh.name = 'murkjaw-wave';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
  }

  show(at: THREE.Vector3Like, radius: number, seconds: number): void {
    this.mesh.position.set(at.x, at.y + 0.35, at.z);
    this.radius = radius;
    this.total = Math.max(0.05, seconds);
    this.t = 0;
    this.mesh.visible = true;
    this.update(0);
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.t += Math.max(0, dt);
    const k = this.t / this.total;
    if (k >= 1.3) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.scale.setScalar(Math.max(0.2, this.radius * Math.min(1, k)));
    this.mat.opacity = 0.75 * Math.max(0, 1 - Math.max(0, k - 1) / 0.3);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mat.dispose();
  }
}

/** Splash and foam where he breaks the surface or sinks (a short fading disc). */
export class Splash {
  readonly mesh: THREE.Mesh;
  private readonly mat = waterMat(LOOK.foam, 0.6);
  private t = 0;

  constructor() {
    this.mesh = new THREE.Mesh(DISC, this.mat);
    this.mesh.name = 'murkjaw-splash';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
  }

  show(at: THREE.Vector3Like, size: number): void {
    this.mesh.position.set(at.x, at.y + 0.02, at.z);
    this.mesh.scale.setScalar(size);
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.t += Math.max(0, dt);
    this.mat.opacity = 0.6 * Math.max(0, 1 - this.t / 0.8);
    if (this.t >= 0.8) this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mat.dispose();
  }
}

/** Phase 2's crumbling crossing: dust motes jittering over it until it drops. */
export class CrumbleDust {
  readonly mesh = new THREE.Group();
  private readonly mat = new THREE.MeshBasicMaterial({ color: 0x8a8070, transparent: true, opacity: 0.6, depthWrite: false });
  private readonly geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
  private readonly motes: THREE.Mesh[] = [];
  private t = 0;
  private on = false;

  constructor() {
    this.mesh.name = 'murkjaw-crumble';
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(this.geo, this.mat);
      this.motes.push(m);
      this.mesh.add(m);
    }
    this.mesh.visible = false;
  }

  get showing(): boolean {
    return this.on;
  }

  /** Over the world rect x0..x1, z0..z1 at height y. */
  show(r: { x0: number; z0: number; x1: number; z1: number }, y: number): void {
    this.mesh.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    this.motes.forEach((m, i) => {
      m.userData.base = new THREE.Vector3(((i * 0.37) % 1 - 0.5) * w, 0.1, ((i * 0.61) % 1 - 0.5) * d);
    });
    this.t = 0;
    this.on = true;
    this.mesh.visible = true;
    this.update(0);
  }

  stop(): void {
    this.on = false;
    this.mesh.visible = false;
  }

  update(dt: number): void {
    if (!this.on) return;
    this.t += Math.max(0, dt);
    this.motes.forEach((m, i) => {
      const b = m.userData.base as THREE.Vector3;
      const rise = (this.t * 0.8 + i * 0.13) % 1;
      m.position.set(b.x + Math.sin(this.t * 17 + i) * 0.05, b.y + rise * 1.2, b.z);
    });
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mat.dispose();
    this.geo.dispose();
  }
}

/** A rack spear: a shaft with an iron head, +Z toward the point. */
export function spearMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'murkjaw-spear';
  const shaft = new THREE.Mesh(SHAFT_GEO, SHAFT_MAT);
  shaft.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(HEAD_GEO, HEAD_MAT);
  head.rotation.x = Math.PI / 2;
  head.position.z = 1.15;
  g.add(shaft, head);
  return g;
}
const SHAFT_GEO = new THREE.CylinderGeometry(0.03, 0.03, 2.1, 6);
const HEAD_GEO = new THREE.ConeGeometry(0.07, 0.3, 6);
const SHAFT_MAT = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.8 });
const HEAD_MAT = new THREE.MeshStandardMaterial({ color: 0x8a8e94, roughness: 0.4, metalness: 0.6 });
