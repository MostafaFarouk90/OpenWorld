import * as THREE from 'three';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Procedural greybox for the six wayside shrines: a stone niche and a candle whose flame shows when lit. No lights. */
export class WaysideVisuals {
  readonly root = new THREE.Group();
  private readonly flames = new Map<number, THREE.Mesh>();
  private readonly flameMat = new THREE.MeshBasicMaterial({ color: 0xffc46a });
  private t = 0;

  constructor() {
    this.root.name = 'wayside-shrines';
  }

  has(index: number): boolean {
    return this.flames.has(index);
  }

  build(index: number, at: Vec3): void {
    if (this.flames.has(index)) return;
    const stone = new THREE.MeshStandardMaterial({ color: 0x4b4845, roughness: 0.95 });
    const wax = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 });
    const g = new THREE.Group();
    g.name = `wayside-${index}`;
    g.position.set(at.x, at.y, at.z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.7), stone);
    post.position.y = 0.65;
    const niche = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1816 }));
    niche.position.set(0, 0.95, 0.36);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 8), wax);
    candle.position.set(0, 0.86, 0.4);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), this.flameMat);
    flame.scale.y = 1.6;
    flame.position.set(0, 1.04, 0.4);
    flame.visible = false;
    g.add(post, niche, candle, flame);
    this.root.add(g);
    this.flames.set(index, flame);
  }

  setLit(index: number, lit: boolean): void {
    const f = this.flames.get(index);
    if (f) f.visible = lit;
  }

  update(frameTime: number): void {
    this.t += frameTime;
    const s = 1.6 + 0.2 * Math.sin(this.t * 9);
    for (const f of this.flames.values()) f.scale.y = s;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        if (m.material !== this.flameMat) (m.material as THREE.Material).dispose();
      }
    });
    this.flameMat.dispose();
  }
}
