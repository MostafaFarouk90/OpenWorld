// Ulthred's ground effects (procedural, headless-safe): glowing slam and chain lines on the floor (the slam's 1.2 s tell, the
// chains' 0.9 s glow), and the geometry tests the hits use. Circles reuse Vey's GroundRing.
import * as THREE from 'three';
import { LOOK } from './tuning';

/** A flat strip on the floor from `a` to `b`, `halfWidth` either side; `show(t)` brightens with the tell. */
export class GroundLine {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private disposed = false;

  constructor(name: string, colour: number = LOOK.line) {
    this.mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.name = name;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  show(a: THREE.Vector3Like, b: THREE.Vector3Like, halfWidth: number, t: number): void {
    if (this.disposed) return;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.max(0.1, Math.hypot(dx, dz));
    this.mesh.position.set((a.x + b.x) / 2, Math.max(a.y, b.y) + 0.05, (a.z + b.z) / 2);
    this.mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, dz));
    this.mesh.scale.set(halfWidth * 2, len, 1);
    this.mat.opacity = 0.15 + 0.6 * THREE.MathUtils.clamp(t, 0, 1);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** Distance in the ground plane from `p` to the segment `a`-`b`. */
export function distToSegment(p: THREE.Vector3Like, a: THREE.Vector3Like, b: THREE.Vector3Like): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? THREE.MathUtils.clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / len2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/** The end of a line of `length` from `from` along yaw (yaw 0 faces -Z). */
export function lineEnd(from: THREE.Vector3Like, yaw: number, length: number): THREE.Vector3 {
  return new THREE.Vector3(from.x - Math.sin(yaw) * length, from.y, from.z - Math.cos(yaw) * length);
}
