import * as THREE from 'three';

/**
 * The dive's ground marks (plans/act2-A6a.md 1.3, change 4): a red circle at the locked landing point and a shadow
 * that grows and darkens as the wyrm comes down. Two draw calls, only while a dive is telegraphed or falling. Shared
 * geometry and materials per `DiveMarkers`; one pair of meshes per diving wyrm.
 */
export const DIVE_MARKER = {
  /** Circle radius (the dive's impact reach). */
  radius: 2.6,
  /** The shadow starts this fraction of the circle and grows to fill it. */
  shadowStart: 0.25,
  lift: 0.05,
} as const;

interface Mark {
  ring: THREE.Mesh;
  shadow: THREE.Mesh;
  t: number;
  seconds: number;
}

export class DiveMarkers {
  private readonly marks = new Map<string, Mark>();
  private readonly ringGeometry = new THREE.RingGeometry(DIVE_MARKER.radius * 0.88, DIVE_MARKER.radius, 40, 1).rotateX(-Math.PI / 2);
  private readonly shadowGeometry = new THREE.CircleGeometry(DIVE_MARKER.radius, 28).rotateX(-Math.PI / 2);
  private readonly ringMaterial = new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.85, depthWrite: false });
  private readonly shadowMaterials: THREE.MeshBasicMaterial[] = [];

  constructor(private readonly parent: THREE.Object3D) {}

  /** Shows (or moves) the marks of `id` at `at` for a fall of `seconds`. */
  show(id: string, at: { x: number; y: number; z: number }, seconds: number): void {
    this.hide(id);
    const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
    this.shadowMaterials.push(shadowMaterial);
    const shadow = new THREE.Mesh(this.shadowGeometry, shadowMaterial);
    for (const m of [ring, shadow]) {
      m.position.set(at.x, at.y + DIVE_MARKER.lift, at.z);
      m.renderOrder = 2;
      m.name = 'wyrm-dive-marker';
      this.parent.add(m);
    }
    shadow.scale.setScalar(DIVE_MARKER.shadowStart);
    this.marks.set(id, { ring, shadow, t: 0, seconds: Math.max(0.05, seconds) });
  }

  hide(id: string): void {
    const m = this.marks.get(id);
    if (!m) return;
    this.marks.delete(id);
    m.ring.removeFromParent();
    m.shadow.removeFromParent();
    const mat = m.shadow.material as THREE.MeshBasicMaterial;
    const i = this.shadowMaterials.indexOf(mat);
    if (i >= 0) this.shadowMaterials.splice(i, 1);
    mat.dispose();
  }

  /** Grows the shadows (render or fixed tick). */
  update(dt: number): void {
    for (const m of this.marks.values()) {
      m.t = Math.min(m.seconds, m.t + dt);
      const k = m.t / m.seconds;
      m.shadow.scale.setScalar(DIVE_MARKER.shadowStart + (1 - DIVE_MARKER.shadowStart) * k);
      (m.shadow.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.4 * k;
    }
  }

  /** The circle's centre of `id` (tests), or null. */
  centre(id: string): THREE.Vector3 | null {
    return this.marks.get(id)?.ring.position ?? null;
  }

  get size(): number {
    return this.marks.size;
  }

  dispose(): void {
    for (const id of [...this.marks.keys()]) this.hide(id);
    this.ringGeometry.dispose();
    this.shadowGeometry.dispose();
    this.ringMaterial.dispose();
  }
}
