import * as THREE from 'three';
import { LOOK, POUNCE } from './tuning';

/**
 * Grimtooth's own effects (vfx-and-feedback.md section 7). The VFX service has no register call, so they live here and are
 * added to the scene directly. Every effect is cheap greybox geometry with one shared material per effect.
 */

const DECAL_WIDTH = 0.9;
/** A decal never collapses to nothing, so a zero-length leap still shows a mark. */
const MIN_LENGTH = 0.05;

/** The pounce line decal: a red strip on the floor from take-off to the aim point that fills along the leap (design 11 "Pounce crouch"). */
export class PounceDecal {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private length = 1;
  private t = 0;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: LOOK.collarFlash,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // A unit strip lying flat that runs from the origin along -Z (the mesh yaw 0 heading), so scale.z is its length.
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -0.5);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'grimtooth-pounce-decal';
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
  }

  get active(): boolean {
    return this.mesh.visible;
  }

  /** Lays the strip from `from` (take-off) to `to` (the actual leap end) and starts the fill. Heights are taken from `from`. */
  start(from: THREE.Vector3Like, to: THREE.Vector3Like): void {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    this.length = Math.max(MIN_LENGTH, Number.isFinite(dist) ? dist : 0);
    this.mesh.position.set(from.x, from.y + 0.03, from.z);
    // Yaw 0 faces -Z: a heading (dx, dz) is yaw atan2(-dx, -dz).
    this.mesh.rotation.y = dist > 1e-6 ? Math.atan2(-dx, -dz) : 0;
    this.t = 0;
    this.mesh.visible = true;
    this.apply();
  }

  /** Moves the strip to a new end (the aim lock) without restarting the fill (review nit: it used to refill). */
  retarget(from: THREE.Vector3Like, to: THREE.Vector3Like): void {
    if (!this.mesh.visible) {
      this.start(from, to);
      return;
    }
    const t = this.t;
    this.start(from, to);
    this.t = t;
    this.apply();
  }

  /** Fills 0 to full length over `POUNCE.decalFillSeconds`, then stays until `stop()`. */
  update(dt: number): void {
    if (!this.mesh.visible || !(dt > 0)) return;
    this.t += dt;
    this.apply();
  }

  stop(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }

  private apply(): void {
    const k = Math.min(1, this.t / POUNCE.decalFillSeconds);
    this.mesh.scale.set(DECAL_WIDTH, 1, Math.max(1e-3, this.length * k));
  }
}

/** Effect 31, the calm shell: an additive ellipsoid around the hound that turns from orange to gold, then holds. */
export class CalmShell {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly from = new THREE.Color(LOOK.calmShellFrom);
  private readonly to = new THREE.Color(LOOK.calmShellTo);
  private t = 0;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: LOOK.calmShellFrom,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.material);
    // A unit sphere to about 1.3 x 1.1 x 2.0 m (the 1.8x hound body, long along Z).
    this.mesh.scale.set(0.65, 0.55, 1);
    this.mesh.name = 'grimtooth-calm-shell';
    this.mesh.visible = false;
  }

  get active(): boolean {
    return this.mesh.visible;
  }

  /** 0..1 through the orange to gold change; 1 holds until `stop()`. */
  get progress(): number {
    return Math.min(1, this.t / LOOK.calmShellSeconds);
  }

  start(): void {
    this.t = 0;
    this.mesh.visible = true;
    this.material.color.copy(this.from);
  }

  stop(): void {
    this.mesh.visible = false;
  }

  /** Follows the hound: `centre` is the middle of the body, `yaw` his heading. */
  update(dt: number, centre: THREE.Vector3Like, yaw: number): void {
    if (!this.mesh.visible) return;
    if (dt > 0) this.t += dt;
    this.mesh.position.set(centre.x, centre.y, centre.z);
    this.mesh.rotation.y = Number.isFinite(yaw) ? yaw : 0;
    this.material.color.copy(this.from).lerp(this.to, this.progress);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
