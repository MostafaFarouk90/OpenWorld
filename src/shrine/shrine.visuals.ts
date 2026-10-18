import * as THREE from 'three';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const STEAM_COUNT = 20;

/**
 * Procedural greybox for the Quenchstone basin, the wardstones and the beat pip (design 14.4:
 * stacked primitives plus emissive materials, no art needed). Everything is built once and animated
 * without allocating per frame. Steam and rim light live here rather than in the vfx service, which
 * has no registration API.
 */
export class ShrineVisuals {
  readonly root = new THREE.Group();
  private basin: THREE.Group | null = null;
  private rim: THREE.PointLight | null = null;
  private rimMat: THREE.MeshStandardMaterial | null = null;
  private steam: THREE.Points | null = null;
  private steamAge = new Float32Array(STEAM_COUNT);
  private readonly stones = new Map<number, { group: THREE.Group; glyph: THREE.MeshStandardMaterial }>();
  private readonly pip: THREE.Mesh;
  private lit = false;

  constructor() {
    this.root.name = 'shrine';
    this.pip = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 }),
    );
    this.pip.visible = false;
    this.pip.name = 'wardstone-beat-pip';
    this.root.add(this.pip);
  }

  get hasBasin(): boolean {
    return this.basin !== null;
  }

  hasStone(index: number): boolean {
    return this.stones.has(index);
  }

  buildBasin(at: Vec3): void {
    if (this.basin) return;
    const g = new THREE.Group();
    g.name = 'quenchstone-basin';
    g.position.set(at.x, at.y, at.z);
    const stone = new THREE.MeshStandardMaterial({ color: 0x2b2a2e, roughness: 0.9 });
    const water = new THREE.MeshStandardMaterial({ color: 0x3a6f8a, roughness: 0.2, transparent: true, opacity: 0.8 });
    this.rimMat = new THREE.MeshStandardMaterial({ color: 0x331a0c, emissive: 0xff7a2a, emissiveIntensity: 0, roughness: 0.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 8, 28), stone);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.1, 28), water);
    pool.position.y = 0.1;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 3.2, 6), stone);
    pillar.position.y = 1.6;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 6), this.rimMat);
    band.position.y = 2.6;
    this.rim = new THREE.PointLight(0xff8a3a, 0, 9);
    this.rim.position.y = 2.4;
    const pos = new Float32Array(STEAM_COUNT * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.steam = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xdfe8ee, size: 0.5, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.steam.frustumCulled = false;
    for (let i = 0; i < STEAM_COUNT; i++) this.steamAge[i] = i / STEAM_COUNT;
    g.add(ring, pool, pillar, band, this.rim, this.steam);
    this.basin = g;
    this.root.add(g);
    this.setLit(this.lit);
  }

  setLit(on: boolean): void {
    this.lit = on;
    if (this.rimMat) this.rimMat.emissiveIntensity = on ? 1.4 : 0;
    if (this.rim) this.rim.intensity = on ? 1.6 : 0;
    if (this.steam) this.steam.visible = on;
  }

  buildStone(index: number, at: Vec3): void {
    if (this.stones.has(index)) return;
    const group = new THREE.Group();
    group.name = `wardstone-${index}`;
    group.position.set(at.x, at.y, at.z);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.9, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.95 }),
    );
    body.position.y = 0.95;
    const glyph = new THREE.MeshStandardMaterial({ color: 0x221510, emissive: 0xffa040, emissiveIntensity: 0 });
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.06), glyph);
    mark.position.set(0, 1.25, 0.28);
    group.add(body, mark);
    this.stones.set(index, { group, glyph });
    this.root.add(group);
  }

  /** `progress` is the phrase hits so far (0..3); a finished stone burns steady. */
  setStone(index: number, struck: boolean, progress: number): void {
    const s = this.stones.get(index);
    if (s) s.glyph.emissiveIntensity = struck ? 1.6 : progress * 0.35;
  }

  /** `pulse` is 1 on the beat and falls to 0; the pip floats over `index`, or hides for null. */
  setPip(index: number | null, pulse: number): void {
    const s = index === null ? undefined : this.stones.get(index);
    if (!s) {
      this.pip.visible = false;
      return;
    }
    this.pip.visible = true;
    this.pip.position.set(s.group.position.x, s.group.position.y + 2.6, s.group.position.z);
    this.pip.scale.setScalar(0.7 + 0.8 * pulse);
    (this.pip.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.6 * pulse;
  }

  update(dt: number): void {
    if (!this.steam || !this.lit) return;
    const attr = this.steam.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < STEAM_COUNT; i++) {
      const age = (this.steamAge[i] = (this.steamAge[i] + dt * 0.35) % 1);
      const a = i * 2.399;
      attr.setXYZ(i, Math.cos(a) * (0.4 + age * 1.2), 0.3 + age * 3.6, Math.sin(a) * (0.4 + age * 1.2));
    }
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
  }
}
