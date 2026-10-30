import * as THREE from 'three';
import { LAST_ANVIL as A } from './tuning';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Procedural greybox for the Last Anvil: a low stone shrine, an iron anvil and a lamp. The lamp light
 * exists from the start and only its intensity changes.
 */
export class LastAnvilVisuals {
  readonly root = new THREE.Group();
  private readonly lamp: THREE.PointLight;
  private readonly lampMat = new THREE.MeshStandardMaterial({ color: 0x3a2a14, emissive: 0xffa040, emissiveIntensity: 0.1 });
  private lit = false;
  private t = 0;
  private built = false;

  constructor() {
    this.root.name = 'last-anvil';
    this.lamp = new THREE.PointLight(A.lamp.color, A.lamp.unlit, A.lamp.distance);
    this.root.add(this.lamp);
  }

  get hasSite(): boolean {
    return this.built;
  }

  /** Carved stones (added to the scene by the plugin, not under the site root) are placed in world space as K4's carving anchors appear, independent of the site. */
  readonly carvings = new THREE.Group();
  private readonly carvingStone = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.9 });

  addCarving(n: number, at: Vec3): void {
    // K4 builds the carving stones; K9 adds only a small pale cloth mark where the rubbing is taken.
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.02), this.carvingStone);
    s.position.set(at.x, at.y + 1.1, at.z);
    s.name = `last-anvil-rubbing-mark-${n}`;
    this.carvings.add(s);
  }

  build(site: Vec3): void {
    if (this.built) return;
    this.built = true;
    this.root.position.set(site.x, site.y, site.z);
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.95 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x1f1f23, roughness: 0.55, metalness: 0.6 });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 3), stone);
    plinth.position.y = 0.3;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), iron);
    foot.position.y = 1;
    const face = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.9), iron);
    face.position.y = 1.55;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 8), iron);
    horn.rotation.z = -Math.PI / 2;
    horn.position.set(1.6, 1.55, 0);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), stone);
    post.position.set(-1.8, 1.5, 1.1);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), this.lampMat);
    bulb.position.set(-1.8, 2.5, 1.1);
    this.lamp.position.copy(bulb.position);
    this.root.add(plinth, foot, face, horn, post, bulb);
  }

  setLit(lit: boolean): void {
    this.lit = lit;
  }

  update(frameTime: number): void {
    this.t += frameTime;
    const target = this.lit ? A.lamp.lit : A.lamp.unlit;
    const flicker = this.lit ? 0.2 * Math.sin(this.t * 7) : 0;
    this.lamp.intensity += (target + flicker - this.lamp.intensity) * Math.min(1, frameTime * 3);
    this.lampMat.emissiveIntensity = this.lit ? 1.4 + flicker : 0.1;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.carvings.removeFromParent();
    this.carvings.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.carvingStone.dispose();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material;
        if (mat !== this.lampMat) mat.dispose();
      }
    });
    this.lampMat.dispose();
  }
}
