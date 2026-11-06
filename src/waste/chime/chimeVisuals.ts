// The Singing Slag's procedural greybox (Act 4 L1 PR 2): six glass pillars (hexagonal prisms over the layout's 1 x 1 m pole
// colliders, so the greybox poles are hidden inside), the slag mound of the shrine, and the glass drift across the foot of the
// Cinder Road North, which is removed once the shrine is lit ("the road north opens", visual only: plan section 19 point 1).
// One light, created at once; only its intensity changes (adding a PointLight recompiles lit materials). Stand-ins until
// Mostafa's glbs (env prompt list section T).
import * as THREE from 'three';
import type { XZ } from '../../terrain/shape/waste';

export interface ChimeSite {
  pillars: readonly XZ[];
  shrine: XZ;
  drift: { at: XZ; yawDeg: number };
  heightAt(x: number, z: number): number;
}

const PILLAR_HEIGHT = 5.4;
const PILLAR_COLOUR = 0x9fd6d2;
const SUNG_COLOUR = 0xffd48a;

export class ChimeVisuals {
  readonly root = new THREE.Group();
  private readonly pillarMats: THREE.MeshStandardMaterial[] = [];
  private readonly drift = new THREE.Group();
  private readonly coreMat = new THREE.MeshStandardMaterial({ color: 0x2a1c14, emissive: SUNG_COLOUR, emissiveIntensity: 0.04, roughness: 0.8 });
  private readonly light = new THREE.PointLight(SUNG_COLOUR, 0, 26);
  private lit = false;
  private t = 0;

  constructor(site: ChimeSite) {
    this.root.name = 'waste-chime';
    site.pillars.forEach((p, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: PILLAR_COLOUR, emissive: PILLAR_COLOUR, emissiveIntensity: 0.05, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
      this.pillarMats.push(mat);
      // Heights rise from west to east like a row of chimes.
      const h = PILLAR_HEIGHT - 0.9 + i * 0.35;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.8, h, 6), mat);
      m.position.set(p[0], site.heightAt(p[0], p[1]) + h / 2 - 0.1, p[1]);
      m.rotation.y = i * 0.4;
      m.name = `waste-chime-pillar-${i + 1}`;
      this.root.add(m);
    });
    const [sx, sz] = site.shrine;
    const sy = site.heightAt(sx, sz);
    const slag = new THREE.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.95 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.sin(i * 2.3) * 0.15;
      const r = 2.6 + Math.sin(i * 1.7) * 0.5;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + (i % 3) * 0.25, 0), slag);
      m.position.set(sx + Math.cos(a) * r, sy + 0.3, sz + Math.sin(a) * r);
      m.scale.y = 0.7;
      m.name = `waste-chime-slag-${i + 1}`;
      this.root.add(m);
    }
    const core = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.6, 9), this.coreMat);
    core.position.set(sx, sy + 0.7, sz);
    core.name = 'waste-chime-core';
    this.root.add(core);
    this.light.position.set(sx, sy + 3, sz);
    this.root.add(this.light);

    // The drift: a low bank of glass shards across the road, local x across, built about its own origin.
    const [dx, dz] = site.drift.at;
    this.drift.position.set(dx, site.heightAt(dx, dz), dz);
    this.drift.rotation.y = (-site.drift.yawDeg * Math.PI) / 180;
    this.drift.name = 'waste-chime-glass-drift';
    const shardMat = new THREE.MeshStandardMaterial({ color: 0x86b8b4, roughness: 0.2, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.5 + (i % 3) * 0.2, 1.6 + ((i * 5) % 4) * 0.5, 5), shardMat);
      s.position.set(-6 + i * 1.5, 0.6, Math.sin(i * 2.1) * 0.8);
      s.rotation.z = Math.sin(i * 1.3) * 0.35;
      s.name = `waste-chime-drift-${i + 1}`;
      this.drift.add(s);
    }
    this.root.add(this.drift);
  }

  /** The shrine is lit: the pillars glow for good, the core burns and the drift is gone. */
  setLit(lit: boolean): void {
    this.lit = lit;
    this.drift.visible = !lit;
    this.coreMat.emissiveIntensity = lit ? 1.2 : 0.04;
    this.light.intensity = lit ? 14 : 0;
  }

  get driftVisible(): boolean {
    return this.drift.visible;
  }

  /** Per-pillar glow 0 to 1 from the puzzle (ignored once lit: all sing). */
  setGlow(glow: readonly number[]): void {
    this.pillarMats.forEach((m, i) => {
      const g = this.lit ? 0.7 + 0.15 * Math.sin(this.t * 2 + i) : glow[i] ?? 0;
      m.emissive.setHex(this.lit ? SUNG_COLOUR : PILLAR_COLOUR);
      m.emissiveIntensity = 0.05 + g * 1.6;
    });
  }

  update(dt: number): void {
    this.t += dt;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => m.dispose());
      }
    });
  }
}
