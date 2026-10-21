import * as THREE from 'three';
import { LOOK, MOVES, TRAP } from './tuning';

/**
 * Redmane's own effects. The VFX service has no register call, so they live here and are added to the scene directly. Every
 * effect is cheap greybox geometry with one shared material per effect; nothing samples raw world position in a shader
 * (the keep floats 150 m up at far coordinates).
 */

const LANE_WIDTH = 2;
const MIN_LENGTH = 0.05;

/** The charge lane: a red strip on the floor from his feet along the locked lane, filling over the couch. */
export class LaneDecal {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private length = 1;
  private t = 0;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({ color: LOOK.laneColor, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -0.5);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'redmane-charge-lane';
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
  }

  get active(): boolean {
    return this.mesh.visible;
  }

  /** Lays the strip from `from` toward `to` (heights from `from`); a retarget keeps the fill. */
  show(from: THREE.Vector3Like, to: THREE.Vector3Like, keepFill = false): void {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    this.length = Math.max(MIN_LENGTH, Number.isFinite(dist) ? dist : 0);
    this.mesh.position.set(from.x, from.y + 0.03, from.z);
    this.mesh.rotation.y = dist > 1e-6 ? Math.atan2(-dx, -dz) : 0;
    if (!keepFill || !this.mesh.visible) this.t = 0;
    this.mesh.visible = true;
    this.apply();
  }

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
    const k = Math.min(1, this.t / MOVES.charge.windup);
    this.mesh.scale.set(LANE_WIDTH, 1, Math.max(1e-3, this.length * k));
  }
}

export interface TrapView {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Seconds since it was planted. */
  age: number;
  sprung: boolean;
}

/** A pool of harpoon traps: a glowing disc that fills while it arms, then barbed spikes while it stands. */
export class TrapField {
  readonly group = new THREE.Group();
  private readonly disc: THREE.CircleGeometry;
  private readonly spike: THREE.ConeGeometry;
  private readonly discMat: THREE.MeshBasicMaterial;
  private readonly spikeMat: THREE.MeshStandardMaterial;
  private readonly slots: { root: THREE.Group; disc: THREE.Mesh; spikes: THREE.Group }[] = [];

  constructor(capacity: number) {
    this.group.name = 'redmane-traps';
    this.disc = new THREE.CircleGeometry(TRAP.radius, 20);
    this.disc.rotateX(-Math.PI / 2);
    this.spike = new THREE.ConeGeometry(0.09, 0.9, 5);
    this.spike.translate(0, 0.45, 0);
    this.discMat = new THREE.MeshBasicMaterial({ color: LOOK.trapGlow, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    this.spikeMat = new THREE.MeshStandardMaterial({ color: LOOK.trapColor, metalness: 0.6, roughness: 0.5 });
    for (let i = 0; i < capacity; i++) {
      const root = new THREE.Group();
      const disc = new THREE.Mesh(this.disc, this.discMat);
      disc.renderOrder = 2;
      const spikes = new THREE.Group();
      const n = 8;
      for (let k = 0; k < n; k++) {
        const s = new THREE.Mesh(this.spike, this.spikeMat);
        const a = (k / n) * Math.PI * 2;
        s.position.set(Math.cos(a) * TRAP.radius * 0.6, 0, Math.sin(a) * TRAP.radius * 0.6);
        s.rotation.z = Math.cos(a) * 0.35;
        s.rotation.x = Math.sin(a) * 0.35;
        spikes.add(s);
      }
      root.add(disc, spikes);
      root.visible = false;
      this.group.add(root);
      this.slots.push({ root, disc, spikes });
    }
  }

  /** Draws the live traps (up to the capacity). */
  sync(traps: readonly TrapView[]): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const t = traps[i];
      if (!t) {
        slot.root.visible = false;
        continue;
      }
      slot.root.visible = true;
      slot.root.position.set(t.x, t.y + 0.03, t.z);
      const fill = Math.min(1, t.age / TRAP.armSeconds);
      slot.disc.scale.setScalar(Math.max(0.05, t.sprung ? 1 : fill));
      slot.spikes.visible = t.sprung;
    }
  }

  dispose(): void {
    this.disc.dispose();
    this.spike.dispose();
    this.discMat.dispose();
    this.spikeMat.dispose();
    this.group.removeFromParent();
  }
}
