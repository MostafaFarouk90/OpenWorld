import * as THREE from 'three';
import { MERE } from './tuning';

/**
 * Procedural greybox for Hathren's Mere: a ring of shore stones with a dragon-song band cut into each, and a basin of
 * water that glows when the shrine is lit. The light exists from the start and only its intensity changes (adding a
 * PointLight recompiles every lit material).
 */
export class HathrensMereVisuals {
  readonly root = new THREE.Group();
  private readonly light: THREE.PointLight;
  private readonly glowMat = new THREE.MeshStandardMaterial({ color: 0x1d3a44, emissive: MERE.glow.color, emissiveIntensity: 0.05, roughness: 0.3 });
  private lit = false;
  private t = 0;
  private built = false;

  constructor() {
    this.root.name = 'hathrens-mere';
    this.light = new THREE.PointLight(MERE.glow.color, MERE.glow.unlit, MERE.glow.distance);
    this.light.position.y = 1.2;
    this.root.add(this.light);
  }

  get hasSite(): boolean {
    return this.built;
  }

  build(site: { x: number; y: number; z: number }): void {
    if (this.built) return;
    this.built = true;
    this.root.position.set(site.x, site.y, site.z);
    const stone = new THREE.MeshStandardMaterial({ color: 0x4b4d4a, roughness: 0.95 });
    const song = new THREE.MeshStandardMaterial({ color: 0x2c3a3c, emissive: MERE.glow.color, emissiveIntensity: 0.1, roughness: 0.8 });
    const count = 7;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const h = 1.6 + (i % 3) * 0.5;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.6), stone);
      s.position.set(Math.cos(a) * 4.5, h / 2, Math.sin(a) * 4.5);
      s.rotation.y = -a + Math.PI / 2;
      s.name = `hathrens-mere-stone-${i + 1}`;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.04), song);
      band.position.set(0, h * 0.15, 0.31);
      s.add(band);
      this.root.add(s);
    }
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.3, 14), this.glowMat);
    basin.position.y = 0.15;
    basin.name = 'hathrens-mere-basin';
    this.root.add(basin);
  }

  setLit(lit: boolean): void {
    this.lit = lit;
  }

  update(frameTime: number): void {
    this.t += frameTime;
    const target = this.lit ? MERE.glow.lit : MERE.glow.unlit;
    const wobble = this.lit ? 0.15 * Math.sin(this.t * 1.7) : 0;
    this.light.intensity += (target + wobble - this.light.intensity) * Math.min(1, frameTime * 3);
    this.glowMat.emissiveIntensity = this.lit ? 0.9 + wobble : 0.05;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material;
        if (mat !== this.glowMat) mat.dispose();
      }
    });
    this.glowMat.dispose();
  }
}
