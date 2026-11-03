import * as THREE from 'three';
import type { Vec3 } from '../../vfx/ports';
import { PF } from './tuning';
import type { TrapKind } from './Traps';

const BOLT_COLOR = 0xffc060;
const WIRE_COLOR = 0xb8a070;
const CINDER_COLOR = 0xff6a20;
const MARK_COLOR = 0xffe27a;
const KESTREL_COLOR = 0x7a5232;

interface Timed {
  obj: THREE.Object3D;
  left: number;
  total: number;
}

/**
 * Greybox visuals owned by this class, built from local meshes (the vfx service has no tracer or mark ids): bolt tracers,
 * trap markers, mark glyphs and the Kestrel. Headless (no scene) every call is a no-op.
 */
export class SceneFx {
  private readonly timed: Timed[] = [];
  private readonly traps = new Map<number, THREE.Object3D>();
  private readonly glyphs = new Map<string, THREE.Object3D>();
  private kestrel: { group: THREE.Group; left: number; wings: THREE.Object3D[] } | null = null;
  private clock = 0;

  constructor(
    private readonly scene: THREE.Object3D | null,
    /** Head position of an actor, or null when it is gone. */
    private readonly headOf: (id: string) => Vec3 | null,
    private readonly anchor: () => Vec3,
  ) {}

  tracer(from: Vec3, to: Vec3): void {
    if (!this.scene) return;
    const a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const len = a.distanceTo(b);
    if (!(len > 0.05)) return;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.035, len),
      new THREE.MeshBasicMaterial({ color: BOLT_COLOR, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.lookAt(b);
    this.scene.add(mesh);
    this.timed.push({ obj: mesh, left: PF.bolt.tracerSeconds, total: PF.bolt.tracerSeconds });
  }

  burst(at: Vec3, radius: number): void {
    if (!this.scene) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.9, radius, 32),
      new THREE.MeshBasicMaterial({ color: CINDER_COLOR, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, at.y + 0.1, at.z);
    this.scene.add(ring);
    this.timed.push({ obj: ring, left: 0.4, total: 0.4 });
  }

  trapAdded(id: number, kind: TrapKind, at: Vec3): void {
    if (!this.scene) return;
    const mesh = new THREE.Mesh(
      kind === 'wire' ? new THREE.BoxGeometry(1.6, 0.03, 0.03) : new THREE.CylinderGeometry(0.35, 0.4, 0.12, 12),
      new THREE.MeshBasicMaterial({ color: kind === 'wire' ? WIRE_COLOR : CINDER_COLOR }),
    );
    mesh.position.set(at.x, at.y + 0.08, at.z);
    this.scene.add(mesh);
    this.traps.set(id, mesh);
  }

  trapRemoved(id: number): void {
    const m = this.traps.get(id);
    if (!m) return;
    this.traps.delete(id);
    dispose(m);
  }

  markAdded(id: string): void {
    if (!this.scene || this.glyphs.has(id)) return;
    const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: MARK_COLOR, depthTest: false, transparent: true }));
    g.renderOrder = 10;
    this.scene.add(g);
    this.glyphs.set(id, g);
  }

  markRemoved(id: string): void {
    const g = this.glyphs.get(id);
    if (!g) return;
    this.glyphs.delete(id);
    dispose(g);
  }

  /** The Kestrel circles the player for `seconds`; a second call extends it. */
  hawk(seconds: number): void {
    if (!this.scene) return;
    if (this.kestrel) {
      this.kestrel.left = Math.max(this.kestrel.left, seconds);
      return;
    }
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: KESTREL_COLOR });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat);
    body.scale.set(1, 0.8, 1.6);
    const wings = [-1, 1].map((s) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.18), mat);
      w.position.x = s * 0.28;
      group.add(w);
      return w;
    });
    group.add(body);
    group.scale.setScalar(0.5 * 2);
    this.scene.add(group);
    this.kestrel = { group, left: seconds, wings };
  }

  get hawkActive(): boolean {
    return this.kestrel !== null;
  }

  update(dt: number): void {
    this.clock += dt;
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const t = this.timed[i];
      t.left -= dt;
      const mat = (t.obj as THREE.Mesh).material as THREE.Material;
      mat.opacity = Math.max(0, t.left / t.total);
      if (t.left <= 0) {
        dispose(t.obj);
        this.timed.splice(i, 1);
      }
    }
    for (const [id, g] of this.glyphs) {
      const p = this.headOf(id);
      if (!p) {
        this.markRemoved(id);
        continue;
      }
      g.position.set(p.x, p.y + 0.5 + Math.sin(this.clock * 4) * 0.05, p.z);
      g.rotation.y += dt * 2;
    }
    const k = this.kestrel;
    if (k) {
      k.left -= dt;
      if (k.left <= 0) {
        dispose(k.group);
        this.kestrel = null;
      } else {
        const a = this.anchor();
        const ang = this.clock * 1.6;
        k.group.position.set(a.x + Math.cos(ang) * 2.5, a.y + 3.5, a.z + Math.sin(ang) * 2.5);
        k.group.rotation.y = -ang;
        k.wings.forEach((w, i) => (w.rotation.z = Math.sin(this.clock * 14) * 0.5 * (i === 0 ? -1 : 1)));
      }
    }
  }

  clear(): void {
    for (const t of this.timed.splice(0)) dispose(t.obj);
    for (const id of [...this.traps.keys()]) this.trapRemoved(id);
    for (const id of [...this.glyphs.keys()]) this.markRemoved(id);
    if (this.kestrel) dispose(this.kestrel.group);
    this.kestrel = null;
  }
}

function dispose(o: THREE.Object3D): void {
  o.removeFromParent();
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | undefined;
    mat?.dispose();
  });
}
