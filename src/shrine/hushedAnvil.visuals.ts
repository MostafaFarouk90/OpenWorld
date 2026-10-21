import * as THREE from 'three';
import { HUSHED_ANVIL as H } from './hushedAnvil.tuning';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Procedural greybox for the Hushed Anvil: a natural basalt anvil with a hollow horn, a keeper's lantern, three
 * carved mural slabs and the work-stone. The lantern light exists from the start and only its intensity changes
 * (adding or removing a PointLight recompiles every lit material). No shader samples world-space noise.
 */
export class HushedAnvilVisuals {
  readonly root = new THREE.Group();
  private readonly lantern: THREE.PointLight;
  private readonly lanternMat = new THREE.MeshStandardMaterial({ color: 0x3a2a14, emissive: 0xffa040, emissiveIntensity: 0.3 });
  private lit = false;
  private t = 0;
  private built = false;

  constructor() {
    this.root.name = 'hushed-anvil';
    this.lantern = new THREE.PointLight(H.lantern.color, H.lantern.unlit, H.lantern.distance);
    this.root.add(this.lantern);
    this.root.visible = false;
  }

  get hasSite(): boolean {
    return this.built;
  }

  build(site: Vec3, stationAt: Vec3, muralAt: Vec3[]): void {
    if (this.built) return;
    this.built = true;
    this.root.position.set(site.x, site.y, site.z);
    const basalt = new THREE.MeshStandardMaterial({ color: 0x25242a, roughness: 0.95 });
    const slab = new THREE.MeshStandardMaterial({ color: 0x3b3935, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 2.6, 6), basalt);
    body.position.y = 1.3;
    const face = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.2, 2.2), basalt);
    face.position.y = 3.2;
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.9, 3, 6, 1, true), basalt);
    horn.rotation.z = Math.PI / 2;
    horn.position.set(3.9, 3.2, 0);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), basalt);
    hook.position.set(-2, 2.4, 1.3);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), this.lanternMat);
    lamp.position.set(-2, 1.6, 1.3);
    this.lantern.position.copy(lamp.position);
    this.root.add(body, face, horn, hook, lamp);
    const station = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), slab);
    station.position.set(stationAt.x - site.x, 0.45, stationAt.z - site.z);
    this.root.add(station);
    muralAt.forEach((m, i) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 0.4), slab);
      s.position.set(m.x - site.x, 1.2, m.z - site.z);
      s.rotation.y = (i - 1) * 0.5;
      s.name = `hushed-anvil-mural-${i + 1}`;
      this.root.add(s);
    });
    this.root.visible = true;
  }

  setLit(on: boolean): void {
    if (on === this.lit) return;
    this.lit = on;
    this.apply(0);
  }

  update(dt: number): void {
    this.t += dt;
    this.apply(this.lit ? Math.sin(this.t * 3.1) * 0.12 : Math.sin(this.t * 5.3) * 0.2);
  }

  private apply(flicker: number): void {
    const base = this.lit ? H.lantern.lit : H.lantern.unlit;
    this.lantern.intensity = base * (1 + flicker);
    this.lanternMat.emissiveIntensity = this.lit ? 1.6 : 0.3;
  }

  /** The lantern's light intensity, for tests. */
  lanternIntensity(): number {
    return this.lantern.intensity;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
    this.lanternMat.dispose();
  }
}
