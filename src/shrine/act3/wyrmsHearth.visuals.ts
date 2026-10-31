import * as THREE from 'three';
import { WYRMS_HEARTH as H } from './tuning';

/**
 * Procedural greybox for the Wyrm's Hearth: a nest of cooling slag (a ring of lumpy dark mounds round a basin) that glows
 * and steams once the shrine is lit. Everything is built in local coordinates about the group origin (the site sits near
 * (13600, 15600) at about 600 m, so no noise or pattern uses world positions). The light exists from the start and only its
 * intensity changes (adding a PointLight recompiles every lit material).
 */
export class WyrmsHearthVisuals {
  readonly root = new THREE.Group();
  private readonly light: THREE.PointLight;
  private readonly glowMat = new THREE.MeshStandardMaterial({ color: 0x2a1a14, emissive: H.glow.color, emissiveIntensity: 0.05, roughness: 0.7 });
  private readonly steamMat = new THREE.MeshBasicMaterial({ color: 0xd9d4cc, transparent: true, opacity: 0, depthWrite: false });
  private readonly steam: THREE.Mesh[] = [];
  private lit = false;
  private t = 0;
  private built = false;

  constructor() {
    this.root.name = 'wyrms-hearth';
    this.light = new THREE.PointLight(H.glow.color, H.glow.unlit, H.glow.distance);
    this.light.position.y = 1.4;
    this.root.add(this.light);
  }

  get hasSite(): boolean {
    return this.built;
  }

  build(site: { x: number; y: number; z: number }): void {
    if (this.built) return;
    this.built = true;
    this.root.position.set(site.x, site.y, site.z);
    const slag = new THREE.MeshStandardMaterial({ color: 0x1e1b19, roughness: 0.95 });
    const count = 11;
    for (let i = 0; i < count; i++) {
      // Deterministic lumpiness from the index only (local, never from world position).
      const a = (i / count) * Math.PI * 2 + Math.sin(i * 2.7) * 0.12;
      const r = 5.2 + Math.sin(i * 1.9) * 0.7;
      const h = 0.9 + ((i * 7) % 5) * 0.28;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 + (i % 3) * 0.3, 0), slag);
      m.scale.set(1.3, h / 1.2, 1);
      m.position.set(Math.cos(a) * r, h * 0.4, Math.sin(a) * r);
      m.rotation.y = a * 1.7;
      m.name = `wyrms-hearth-slag-${i + 1}`;
      this.root.add(m);
    }
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 0.4, 16), this.glowMat);
    basin.position.y = 0.2;
    basin.name = 'wyrms-hearth-basin';
    this.root.add(basin);
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), this.steamMat);
      puff.name = `wyrms-hearth-steam-${i + 1}`;
      puff.userData.phase = i / 4;
      puff.userData.dx = Math.cos(i * 1.6) * 1.4;
      puff.userData.dz = Math.sin(i * 1.6) * 1.4;
      this.steam.push(puff);
      this.root.add(puff);
    }
  }

  setLit(lit: boolean): void {
    this.lit = lit;
  }

  update(frameTime: number): void {
    this.t += frameTime;
    const target = this.lit ? H.glow.lit : H.glow.unlit;
    const wobble = this.lit ? 0.25 * Math.sin(this.t * 2.3) + 0.1 * Math.sin(this.t * 5.1) : 0;
    this.light.intensity += (target + wobble - this.light.intensity) * Math.min(1, frameTime * 3);
    this.glowMat.emissiveIntensity = this.lit ? 1.1 + wobble : 0.05;
    this.steamMat.opacity = this.lit ? 0.22 : 0;
    if (!this.lit) return;
    for (const p of this.steam) {
      const k = (this.t * 0.25 + (p.userData.phase as number)) % 1;
      p.position.set((p.userData.dx as number) * (1 + k), 0.6 + k * 4.5, (p.userData.dz as number) * (1 + k));
      p.scale.setScalar(0.6 + k * 1.8);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material;
        if (mat !== this.glowMat && mat !== this.steamMat) mat.dispose();
      }
    });
    this.glowMat.dispose();
    this.steamMat.dispose();
  }
}
