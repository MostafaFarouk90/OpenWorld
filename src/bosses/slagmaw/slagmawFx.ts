import * as THREE from 'three';
import { COOLING, CYCLE, LOOK } from './tuning';

/**
 * The Slagmaw's own effects. The VFX service has no register call, so they live here and are added to the scene directly.
 * Every effect is cheap greybox geometry with one shared material per effect; nothing samples raw world position in a shader
 * (Deepdelve sits far from the origin).
 */

const CRACKS = 11;
const CRACK_WIDTH = 0.35;
const BURST_SECONDS = 0.5;

/** The pre-eruption tremor: glowing cracks that spread outward from the locked spot as progress goes 0..1. */
export class TremorCracks {
  readonly mesh: THREE.Group;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly cracks: { mesh: THREE.Mesh; length: number }[] = [];
  private fn: (() => number) | null = null;
  private progress = 0;
  private on = false;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({ color: LOOK.crackColor, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.geometry.rotateX(-Math.PI / 2);
    this.geometry.translate(0, 0, -0.5);
    this.mesh = new THREE.Group();
    this.mesh.name = 'slagmaw-tremor-cracks';
    this.mesh.visible = false;
    for (let i = 0; i < CRACKS; i++) {
      const crack = new THREE.Mesh(this.geometry, this.material);
      crack.renderOrder = 2;
      crack.rotation.y = (i / CRACKS) * Math.PI * 2;
      // A deterministic spread of lengths around the eruption radius.
      const length = CYCLE.eruptionRadius * (0.8 + 0.5 * ((i * 7) % CRACKS) / CRACKS);
      this.cracks.push({ mesh: crack, length });
      this.mesh.add(crack);
    }
  }

  get active(): boolean {
    return this.on;
  }

  /** Lays the cracks at `at`; an optional function supplies the 0..1 progress each update (else drive `setProgress`). */
  show(at: THREE.Vector3Like, progress01Fn?: () => number): void {
    this.mesh.position.set(at.x, at.y + 0.04, at.z);
    this.fn = progress01Fn ?? null;
    this.on = true;
    this.mesh.visible = true;
    this.setProgress(this.fn ? this.fn() : 0);
  }

  /** 0..1: the cracks spread over the 1.2 s tremor. */
  setProgress(p: number): void {
    this.progress = THREE.MathUtils.clamp(Number.isFinite(p) ? p : 0, 0, 1);
    for (const c of this.cracks) c.mesh.scale.set(CRACK_WIDTH, 1, Math.max(1e-3, c.length * this.progress));
    this.material.opacity = 0.35 + 0.6 * this.progress;
  }

  update(dt: number): void {
    if (!this.on || !(dt >= 0)) return;
    if (this.fn) this.setProgress(this.fn());
  }

  stop(): void {
    this.on = false;
    this.fn = null;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

/** The valve's doused disc: a cool blue-grey pool that fades over COOLING.seconds. */
export class DouseDisc {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private t = 0;
  private on = false;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({ color: LOOK.cooledColor, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const geometry = new THREE.CircleGeometry(1, 32);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'slagmaw-douse-disc';
    this.mesh.visible = false;
    this.mesh.renderOrder = 1;
  }

  get active(): boolean {
    return this.on;
  }

  show(at: THREE.Vector3Like, radius: number): void {
    this.mesh.position.set(at.x, at.y + 0.03, at.z);
    this.mesh.scale.setScalar(Math.max(0.1, Number.isFinite(radius) ? radius : COOLING.radius));
    this.t = 0;
    this.on = true;
    this.mesh.visible = true;
    this.material.opacity = 0.5;
  }

  update(dt: number): void {
    if (!this.on || !(dt > 0)) return;
    this.t += dt;
    if (this.t >= COOLING.seconds) {
      this.stop();
      return;
    }
    this.material.opacity = 0.5 * (1 - this.t / COOLING.seconds);
  }

  stop(): void {
    this.on = false;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

/** The eruption: an orange ring that expands to the blast radius over about half a second. */
export class EruptionBurst {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private t = 0;
  private radius = 1;
  private on = false;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({ color: LOOK.lavaHot, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const geometry = new THREE.RingGeometry(0.7, 1, 40);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'slagmaw-eruption-burst';
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
  }

  get active(): boolean {
    return this.on;
  }

  show(at: THREE.Vector3Like, radius: number): void {
    this.mesh.position.set(at.x, at.y + 0.05, at.z);
    this.radius = Math.max(0.1, Number.isFinite(radius) ? radius : CYCLE.eruptionRadius);
    this.t = 0;
    this.on = true;
    this.mesh.visible = true;
    this.apply();
  }

  update(dt: number): void {
    if (!this.on || !(dt > 0)) return;
    this.t += dt;
    if (this.t >= BURST_SECONDS) {
      this.on = false;
      this.mesh.visible = false;
      return;
    }
    this.apply();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }

  private apply(): void {
    const k = this.t / BURST_SECONDS;
    this.mesh.scale.setScalar(Math.max(0.05, this.radius * (0.3 + 0.7 * k)));
    this.material.opacity = 0.9 * (1 - k);
  }
}
