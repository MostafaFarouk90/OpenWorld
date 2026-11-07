// Archwraith Eormen's effects (plans/act4-L6.md "PR 2", A): the spirit blades in flight, the toll's ring, and the nave going
// dark from phase 2. Plain colours and transparent basic materials; nothing samples world position.
import * as THREE from 'three';
import { BLADES, DARK, LOOK, TOLL } from './tuning';

interface Blade {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  travelled: number;
  live: boolean;
  /** The blade's own hit id (one hit per blade). */
  id: number;
}

const BLADE_GEO = new THREE.BoxGeometry(0.12, 0.5, 1.1);

/** The spirit blades (pooled): a fan of four flying flat from his shoulders at where Cael stood. */
export class SpiritBlades {
  readonly group = new THREE.Group();
  private readonly blades: Blade[] = [];
  private readonly mat = new THREE.MeshBasicMaterial({ color: LOOK.blade, transparent: true, opacity: 0.85, depthWrite: false });
  private nextId = 1;

  constructor() {
    this.group.name = 'eormen-blades';
  }

  get liveCount(): number {
    return this.blades.filter((b) => b.live).length;
  }

  /** Fires a fan from `from` toward `to` (horizontal), `count` blades `spread` radians apart, centred on the line. */
  fire(from: THREE.Vector3Like, to: THREE.Vector3Like, count: number = BLADES.count, spread: number = BLADES.spread): void {
    const base = Math.atan2(to.x - from.x, to.z - from.z);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * spread;
      let b = this.blades.find((x) => !x.live);
      if (!b) {
        const mesh = new THREE.Mesh(BLADE_GEO, this.mat);
        this.group.add(mesh);
        b = { mesh, dir: new THREE.Vector3(), travelled: 0, live: false, id: 0 };
        this.blades.push(b);
      }
      b.dir.set(Math.sin(a), 0, Math.cos(a));
      b.travelled = 0;
      b.live = true;
      b.id = this.nextId++;
      b.mesh.visible = true;
      b.mesh.position.set(from.x, from.y, from.z);
      b.mesh.rotation.set(0, a, 0);
    }
  }

  /**
   * Moves the blades; `hits(at)` says whether a blade at `at` touches Cael (the encounter tests the player's feet and height).
   * A blade that hits stops; `landed(id)` reports it once.
   */
  update(dt: number, hits: (at: THREE.Vector3) => boolean, landed: (id: number) => void): void {
    for (const b of this.blades) {
      if (!b.live) continue;
      const step = BLADES.speed * dt;
      b.mesh.position.addScaledVector(b.dir, step);
      b.travelled += step;
      if (hits(b.mesh.position)) {
        this.kill(b);
        landed(b.id);
      } else if (b.travelled >= BLADES.range) this.kill(b);
    }
  }

  clear(): void {
    for (const b of this.blades) this.kill(b);
  }

  dispose(): void {
    this.clear();
    this.mat.dispose();
    this.group.removeFromParent();
  }

  private kill(b: Blade): void {
    b.live = false;
    b.mesh.visible = false;
  }
}

/** The toll: a ring on the floor round him that tightens over the 1.2 s telegraph, then a bright pulse outward on the toll. */
export class TollRing {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.RingGeometry;
  private readonly material = new THREE.MeshBasicMaterial({ color: LOOK.ring, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  private t = 0;
  private lead: number = TOLL.windup;
  private mode: 'off' | 'charge' | 'pulse' = 'off';

  constructor() {
    this.geometry = new THREE.RingGeometry(TOLL.radius * 0.9, TOLL.radius, 48);
    this.geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'eormen-toll-ring';
    this.mesh.visible = false;
  }

  get active(): boolean {
    return this.mode !== 'off';
  }

  charge(at: THREE.Vector3Like, lead: number): void {
    this.mesh.position.set(at.x, at.y + 0.05, at.z);
    this.lead = lead > 0 ? lead : TOLL.windup;
    this.t = 0;
    this.mode = 'charge';
    this.mesh.visible = true;
  }

  pulse(at: THREE.Vector3Like): void {
    this.mesh.position.set(at.x, at.y + 0.05, at.z);
    this.t = 0;
    this.mode = 'pulse';
    this.mesh.visible = true;
  }

  stop(): void {
    this.mode = 'off';
    this.mesh.visible = false;
    this.material.opacity = 0;
  }

  update(dt: number): void {
    if (this.mode === 'off') return;
    this.t += dt;
    if (this.mode === 'charge') {
      const k = Math.min(1, this.t / this.lead);
      this.material.opacity = 0.25 + 0.5 * k;
      this.mesh.scale.setScalar(1);
      return;
    }
    const k = Math.min(1, this.t / 0.5);
    this.material.opacity = 0.9 * (1 - k);
    this.mesh.scale.setScalar(1 + 0.3 * k);
    if (k >= 1) this.stop();
  }

  dispose(): void {
    this.stop();
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

interface Dimmed {
  light: THREE.Light;
  base: number;
  /** The value this class last wrote (a light someone else changed since is left alone on restore). */
  wrote: number;
}

/**
 * Phase 2 and 3 darken the nave (design): the interior's hemisphere and its follow light (`interior-light`, SceneEnvironment)
 * fade to DARK.share of their values, and come back when the fight ends or resets. The gong's glow light is then the light.
 * Only the intensities are touched, and only on lights still holding the value this class wrote, so leaving the interior (whose
 * own restore runs on the same lights) is never undone.
 */
export class NaveDark {
  private readonly dimmed: Dimmed[] = [];
  private k = 0;
  private goal = 0;

  constructor(private readonly scene: THREE.Object3D) {}

  /** 0 (lit) to 1 (dark). */
  get level(): number {
    return this.k;
  }

  get lights(): number {
    return this.dimmed.length;
  }

  dim(): void {
    if (this.goal === 1) return;
    this.goal = 1;
    if (this.dimmed.length === 0) {
      for (const child of this.scene.children) {
        const light = child as THREE.Light;
        if (!light.isLight) continue;
        if ((light as THREE.HemisphereLight).isHemisphereLight || light.name === 'interior-light') {
          this.dimmed.push({ light, base: light.intensity, wrote: light.intensity });
        }
      }
    }
  }

  /** Back to the lights' own values at once (fight end, reset, teardown). */
  restore(): void {
    this.goal = 0;
    this.k = 0;
    for (const d of this.dimmed) {
      if (Math.abs(d.light.intensity - d.wrote) < 1e-6) d.light.intensity = d.base;
    }
    this.dimmed.length = 0;
  }

  update(dt: number): void {
    if (this.k === this.goal || this.dimmed.length === 0) return;
    const step = dt / DARK.fadeSeconds;
    this.k = this.goal > this.k ? Math.min(this.goal, this.k + step) : Math.max(this.goal, this.k - step);
    const scale = 1 - (1 - DARK.share) * this.k;
    for (const d of this.dimmed) {
      // A light someone else changed since (the interior exited, a quality change) is dropped, never fought over.
      if (Math.abs(d.light.intensity - d.wrote) > 1e-6) continue;
      d.wrote = d.base * scale;
      d.light.intensity = d.wrote;
    }
  }
}
