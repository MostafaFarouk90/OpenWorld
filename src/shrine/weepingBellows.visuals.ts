import * as THREE from 'three';
import { BELLOWS as B } from './weepingBellows.tuning';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Positions of the cavern's parts relative to its centre anchor (also used by the plugin for interactables). */
export function bellowsLayout(center: Vec3) {
  const at = (r: number, i: number, y = 0): Vec3 => {
    const a = (i / 6) * Math.PI * 2;
    return { x: center.x + Math.cos(a) * r, y: center.y + y, z: center.z + Math.sin(a) * r };
  };
  return {
    braziers: Array.from({ length: 6 }, (_, i) => at(B.ringRadius, i)),
    valves: Array.from({ length: 6 }, (_, i) => at(B.valveRadius, i)),
    plaque: { x: center.x + B.plaqueOffset.x, y: center.y, z: center.z + B.plaqueOffset.z },
  };
}

/**
 * Greybox for the Weeping Bellows: four leather-and-bronze bellows hung in the roof, six braziers in a ring, six valve
 * wheels and the wall plaque. Brazier flames are emissive; one shared light (created once, intensity 0 when dark) sits
 * on the last lit brazier, because every extra PointLight costs every lit material.
 */
export class BellowsVisuals {
  readonly root = new THREE.Group();
  private readonly light = new THREE.PointLight(0xff8a3a, 0, 12);
  private readonly flames: THREE.MeshStandardMaterial[] = [];
  private readonly bellows: THREE.Mesh[] = [];
  private readonly wheels: THREE.Mesh[] = [];
  private brazierPos: Vec3[] = [];
  private built = false;
  private t = 0;
  private pressure = 0;

  constructor() {
    this.root.name = 'weeping-bellows';
    this.root.add(this.light);
  }

  get hasSite(): boolean {
    return this.built;
  }

  build(center: Vec3, layout: ReturnType<typeof bellowsLayout>): void {
    if (this.built) return;
    this.built = true;
    this.brazierPos = layout.braziers;
    const leather = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x7a5a2a, metalness: 0.5, roughness: 0.5 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x3b3935, roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 2.4, 8), leather);
      m.position.set(center.x + Math.cos(a) * B.bellowsRadius, center.y + B.bellowsHeight, center.z + Math.sin(a) * B.bellowsRadius);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 8), bronze);
      cap.position.y = 1.3;
      m.add(cap);
      this.bellows.push(m);
      this.root.add(m);
    }
    layout.braziers.forEach((p, i) => {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.4, 0.9, 8), stone);
      bowl.position.set(p.x, p.y + 0.9, p.z);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.9, 6), stone);
      stem.position.set(p.x, p.y + 0.45, p.z);
      const flameMat = new THREE.MeshStandardMaterial({ color: 0x221510, emissive: 0xff7a2a, emissiveIntensity: 0 });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 6), flameMat);
      flame.position.set(p.x, p.y + 1.7, p.z);
      this.flames[i] = flameMat;
      this.root.add(stem, bowl, flame);
    });
    layout.valves.forEach((p, i) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.3, 6), bronze);
      post.position.set(p.x, p.y + 0.65, p.z);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 14), bronze);
      wheel.position.set(p.x, p.y + 1.3, p.z);
      wheel.name = `bellows-valve-${i + 1}`;
      this.wheels.push(wheel);
      this.root.add(post, wheel);
    });
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.3), stone);
    plaque.position.set(layout.plaque.x, layout.plaque.y + 1.6, layout.plaque.z);
    this.root.add(plaque);
  }

  /** `positions` is each valve's notch (0..3); `lit` the lit brazier indices in order; `pressure` 0..1 of the clock left. */
  set(positions: readonly number[], lit: readonly number[], pressure: number): void {
    positions.forEach((p, i) => {
      if (this.wheels[i]) this.wheels[i].rotation.z = (p / B.positions) * Math.PI * 2;
    });
    this.flames.forEach((m, i) => (m.emissiveIntensity = lit.includes(i) ? 1.8 : 0));
    const last = lit.length ? this.brazierPos[lit[lit.length - 1]] : undefined;
    if (last) this.light.position.set(last.x, last.y + 2.2, last.z);
    this.light.intensity = lit.length ? 1.4 + 0.1 * lit.length : 0;
    this.pressure = pressure;
  }

  update(dt: number): void {
    this.t += dt;
    const breath = 1 + Math.sin(this.t * (1 + this.pressure * 2)) * 0.08 * (0.3 + this.pressure);
    for (const b of this.bellows) b.scale.y = breath;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }
}
