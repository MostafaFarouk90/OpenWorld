// Vey's ground effects (procedural, headless-safe): the shockwave's tell disc and its growing ring, and the surge's 6 m fire ring.
// One mesh each, reused; no lights (the arena's glow pool is N2's).
import * as THREE from 'three';
import { LOOK } from './tuning';

/** A flat ring on the floor: `tell(r)` shows the warning disc, `wave(r, band)` the travelling band, `hide()` both. */
export class GroundRing {
  readonly group = new THREE.Group();
  private readonly disc: THREE.Mesh;
  private readonly band: THREE.Mesh;
  private readonly discMat: THREE.MeshBasicMaterial;
  private readonly bandMat: THREE.MeshBasicMaterial;
  private disposed = false;

  constructor(name: string, colour: number = LOOK.ring) {
    this.group.name = name;
    this.discMat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
    this.bandMat = new THREE.MeshBasicMaterial({ color: LOOK.shock, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), this.discMat);
    this.band = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), this.bandMat);
    for (const m of [this.disc, this.band]) {
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 2;
      this.group.add(m);
    }
  }

  get visible(): boolean {
    return this.disc.visible || this.band.visible;
  }

  /** The warning disc of radius `r` at `at`, pulsing with `t` (0..1). */
  tell(at: THREE.Vector3Like, r: number, t: number): void {
    if (this.disposed) return;
    this.group.position.set(at.x, at.y + 0.04, at.z);
    this.disc.scale.setScalar(Math.max(0.1, r));
    this.discMat.opacity = 0.15 + 0.35 * THREE.MathUtils.clamp(t, 0, 1);
    this.disc.visible = true;
  }

  /** The travelling band at radius `r` (outer edge). */
  wave(at: THREE.Vector3Like, r: number): void {
    if (this.disposed) return;
    this.group.position.set(at.x, at.y + 0.05, at.z);
    this.band.scale.setScalar(Math.max(0.1, r));
    this.band.visible = true;
    this.disc.visible = false;
  }

  hide(): void {
    this.disc.visible = false;
    this.band.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    for (const m of [this.disc, this.band]) m.geometry.dispose();
    this.discMat.dispose();
    this.bandMat.dispose();
  }
}

/** Is `p` inside the band of a ring of outer radius `r` and width `band` round `c` (and within 2.5 m of its height)? */
export function inBand(c: THREE.Vector3Like, p: THREE.Vector3Like, r: number, band: number): boolean {
  if (Math.abs(p.y - c.y) > 2.5) return false;
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  return d <= r && d >= r - band;
}
