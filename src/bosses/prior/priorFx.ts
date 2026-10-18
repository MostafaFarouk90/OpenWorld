import * as THREE from 'three';
import { CENSER_RADIUS } from './tuning';

/**
 * The Prior's own effects (vfx-and-feedback.md section 7 ids `censer-telegraph` and `boss-shield`). The VFX service has no
 * register call, so they live here and are added to the scene directly; the slice 1 `telegraph` flash still plays from the
 * normal event. Every effect is cheap greybox geometry with one shared material per effect.
 */

/** `censer-telegraph`: a 5 m ring decal that fills outward over the lift (design 11.6). */
export class CenserRing {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private t = 0;
  private lead = 0;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: 0xf4f0ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.name = 'censer-telegraph';
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
  }

  get active(): boolean {
    return this.mesh.visible;
  }

  /** Starts the fill at `at` (feet), over `leadSeconds`. */
  start(at: THREE.Vector3Like, leadSeconds: number): void {
    this.mesh.position.set(at.x, at.y + 0.03, at.z);
    this.t = 0;
    this.lead = Math.max(0.05, Number.isFinite(leadSeconds) ? leadSeconds : 0.9);
    this.mesh.visible = true;
    this.apply();
  }

  stop(): void {
    this.mesh.visible = false;
  }

  update(dt: number): void {
    if (!this.mesh.visible || !(dt > 0)) return;
    this.t += dt;
    if (this.t >= this.lead + 0.15) this.stop();
    else this.apply();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }

  private apply(): void {
    const k = Math.min(1, this.t / this.lead);
    const r = Math.max(0.05, k) * CENSER_RADIUS;
    this.mesh.scale.set(r, r, 1);
    this.material.opacity = 0.35 + 0.5 * k;
  }
}

/** `boss-shield`: a pale gold fresnel-ish shell around the Prior while `boss.shield` is up. */
export class ShieldShell {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private t = 0;

  constructor(radius = 1.4) {
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffe2a0,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), this.material);
    this.mesh.name = 'boss-shield';
    this.mesh.visible = false;
  }

  set(up: boolean): void {
    this.mesh.visible = up;
  }

  update(dt: number, centre: THREE.Vector3Like): void {
    if (!this.mesh.visible) return;
    this.t += dt > 0 ? dt : 0;
    this.mesh.position.set(centre.x, centre.y + 1.3, centre.z);
    this.material.opacity = 0.18 + 0.06 * Math.sin(this.t * 4);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

/** The ash veil drawn across the arena gate while thread 3a's `vault.arena.gate` blocker is closed (the collider is 3a's). */
export class AshVeil {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private t = 0;

  constructor(width = 3.2, height = 4) {
    this.material = new THREE.MeshBasicMaterial({
      color: 0x9a9690,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(width, height);
    geo.translate(0, height / 2, 0);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'prior-ash-veil';
    this.mesh.visible = false;
  }

  /** Shows the veil at `at` (floor point), facing along `yaw`. */
  show(at: THREE.Vector3Like, yaw: number): void {
    this.mesh.position.set(at.x, at.y, at.z);
    this.mesh.rotation.set(0, yaw, 0);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  get shown(): boolean {
    return this.mesh.visible;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.t += dt > 0 ? dt : 0;
    this.material.opacity = 0.5 + 0.08 * Math.sin(this.t * 2.3);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
