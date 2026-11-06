// The Bellows-Engine's effects (plans/act4-L6.md section 5): the coal-shot ground rings and the falling lumps, the steam jet's
// cone, and the live valve's plume. Plain colours and transparent basic materials; nothing samples world position.
import * as THREE from 'three';
import { COAL, LOOK, STEAM } from './tuning';

/** One coal shot in the air: a ring on the floor that fills as the lump falls to it. */
interface Shot {
  ring: THREE.Mesh;
  lump: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  live: boolean;
}

const RING_GEO = new THREE.RingGeometry(COAL.radius * 0.86, COAL.radius, 28);
RING_GEO.rotateX(-Math.PI / 2);
const LUMP_GEO = new THREE.DodecahedronGeometry(0.35, 0);

/** The coal shots (pooled). `fire` returns the shot's index; `update` reports landings. */
export class CoalShots {
  readonly group = new THREE.Group();
  private readonly shots: Shot[] = [];
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: LOOK.ring, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
  private readonly lumpMat = new THREE.MeshStandardMaterial({ color: LOOK.coal, emissive: LOOK.glow, emissiveIntensity: 0.6, roughness: 0.9 });

  constructor() {
    this.group.name = 'bellows-coal';
  }

  get liveCount(): number {
    return this.shots.filter((s) => s.live).length;
  }

  fire(from: THREE.Vector3Like, to: THREE.Vector3Like): void {
    let s = this.shots.find((x) => !x.live);
    if (!s) {
      const ring = new THREE.Mesh(RING_GEO, this.ringMat);
      const lump = new THREE.Mesh(LUMP_GEO, this.lumpMat);
      this.group.add(ring, lump);
      s = { ring, lump, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, live: false };
      this.shots.push(s);
    }
    s.from.set(from.x, from.y, from.z);
    s.to.set(to.x, to.y, to.z);
    s.t = 0;
    s.live = true;
    s.ring.visible = s.lump.visible = true;
    s.ring.position.set(to.x, to.y + 0.05, to.z);
    s.lump.position.copy(s.from);
  }

  /** Advances the lumps; calls `landed` with each shot's target as it lands. */
  update(dt: number, landed: (at: THREE.Vector3) => void): void {
    for (const s of this.shots) {
      if (!s.live) continue;
      s.t += dt;
      const k = Math.min(1, s.t / COAL.flightSeconds);
      s.lump.position.lerpVectors(s.from, s.to, k);
      s.lump.position.y += Math.sin(k * Math.PI) * 6;
      s.ring.scale.setScalar(0.4 + 0.6 * k);
      if (k >= 1) {
        s.live = false;
        s.ring.visible = s.lump.visible = false;
        landed(s.to);
      }
    }
  }

  clear(): void {
    for (const s of this.shots) {
      s.live = false;
      s.ring.visible = s.lump.visible = false;
    }
  }

  dispose(): void {
    this.clear();
    this.ringMat.dispose();
    this.lumpMat.dispose();
    this.group.removeFromParent();
  }
}

/** The steam jet: a soft white cone from the nozzles along the head's facing. */
export class SteamCone {
  readonly mesh: THREE.Mesh;
  private readonly material = new THREE.MeshBasicMaterial({ color: LOOK.steam, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  private readonly geometry: THREE.ConeGeometry;
  private t = 0;
  private on = false;

  constructor() {
    const r = Math.tan(STEAM.halfArc) * STEAM.range;
    this.geometry = new THREE.ConeGeometry(r, STEAM.range, 16, 1, true);
    // Tip at the origin, opening along -Z (yaw 0 faces -Z).
    this.geometry.translate(0, -STEAM.range / 2, 0);
    this.geometry.rotateX(Math.PI / 2);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'bellows-steam';
    this.mesh.visible = false;
  }

  get active(): boolean {
    return this.on;
  }

  show(at: THREE.Vector3Like, yaw: number): void {
    this.mesh.position.set(at.x, at.y, at.z);
    this.mesh.rotation.set(0, yaw, 0);
    this.on = true;
    this.t = 0;
    this.mesh.visible = true;
  }

  stop(): void {
    this.on = false;
  }

  update(dt: number): void {
    if (this.on) this.t += dt;
    const target = this.on ? 0.42 : 0;
    const o = this.material.opacity + (target - this.material.opacity) * Math.min(1, dt * 8);
    this.material.opacity = o;
    this.mesh.visible = o > 0.01;
    this.mesh.scale.set(1 + 0.05 * Math.sin(this.t * 20), 1 + 0.05 * Math.sin(this.t * 17), 1);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

/** The live valve's mark: an orange gauge light and a steam plume above the wheel. */
export class ValvePlume {
  readonly group = new THREE.Group();
  private readonly lampMat = new THREE.MeshBasicMaterial({ color: LOOK.valveLive });
  private readonly puffMat = new THREE.MeshBasicMaterial({ color: LOOK.steam, transparent: true, opacity: 0.35, depthWrite: false });
  private readonly lampGeo = new THREE.SphereGeometry(0.16, 8, 6);
  private readonly puffGeo = new THREE.SphereGeometry(0.4, 8, 6);
  private readonly puffs: THREE.Mesh[] = [];
  private t = 0;

  constructor() {
    this.group.name = 'bellows-valve-plume';
    const lamp = new THREE.Mesh(this.lampGeo, this.lampMat);
    lamp.position.y = 1.75;
    this.group.add(lamp);
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(this.puffGeo, this.puffMat);
      this.puffs.push(p);
      this.group.add(p);
    }
    this.group.visible = false;
  }

  show(at: THREE.Vector3Like): void {
    this.group.position.set(at.x, at.y, at.z);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    this.t += dt;
    this.puffs.forEach((p, i) => {
      const k = (this.t * 0.6 + i / this.puffs.length) % 1;
      p.position.set(Math.sin(i * 2.1) * 0.15, 1.9 + k * 2.2, Math.cos(i * 1.7) * 0.15);
      p.scale.setScalar(0.5 + k * 1.2);
    });
  }

  dispose(): void {
    this.lampMat.dispose();
    this.puffMat.dispose();
    this.lampGeo.dispose();
    this.puffGeo.dispose();
    this.group.removeFromParent();
  }
}
