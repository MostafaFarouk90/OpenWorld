// Idle Kettlewick villagers: scenery only (no colliders, no actors). Placed from existing anchors so the
// village is not empty during the tutorial. Built through the NPC model helpers (KayKit GLB when a loader is
// supplied, else/failing that the NPC placeholder figure). The crowds plugin is deliberately not used: its
// cluster groups are a closed union tied to Harrowmark.
import * as THREE from 'three';
import { buildPlaceholder, disposePlaceholder, pickIdleClip, prepareNpcModel } from '../npcs/npcModels';
import type { NpcDef, NpcModelId, NpcModelLoader } from '../npcs/types';

export interface TownsfolkSpot {
  id: string;
  /** Anchor the figure stands near. */
  near: string;
  /** Metres from the anchor (+X east, +Z north in layout terms). */
  dx: number;
  dz: number;
  /** Direction to face, as a world-space vector (x, z). */
  face: [number, number];
  model: NpcModelId;
  tint: number | null;
  scale: number;
}

/** Hand-picked: off the lane (|x| > 3), outside the T11 square (|x| < 12, 118 < z < 142), clear of buildings and triggers. */
export const TOWNSFOLK_SPOTS: readonly TownsfolkSpot[] = [
  { id: 'baker-queue-1', near: 'kettlewick.bakery-door', dx: -2.5, dz: 3.5, face: [1, -0.6], model: 'barbarian', tint: 0xb89a6a, scale: 0.95 },
  { id: 'baker-queue-2', near: 'kettlewick.bakery-door', dx: -3, dz: -4.5, face: [0.4, 1], model: 'rogue', tint: 0x9a7a5a, scale: 1 },
  { id: 'tavern-loiterer', near: 'kettlewick.tavern-door', dx: 1.5, dz: -6, face: [-1, 0.8], model: 'barbarian', tint: 0x7a6a8a, scale: 1.02 },
  { id: 'south-chat-1', near: 'kettlewick.square', dx: -13.5, dz: -15, face: [1, 0.3], model: 'rogueHooded', tint: 0x6a7a5a, scale: 0.98 },
  { id: 'south-chat-2', near: 'kettlewick.square', dx: 6.5, dz: -14, face: [-1, -0.2], model: 'rogue', tint: 0xa88a6a, scale: 0.92 },
  { id: 'north-chat-1', near: 'kettlewick.square', dx: 5, dz: 19, face: [-1, 0.5], model: 'mage', tint: 0x8a6a6a, scale: 0.95 },
  { id: 'north-chat-2', near: 'kettlewick.square', dx: -11, dz: 20, face: [1, -0.4], model: 'barbarian', tint: 0x8a8a5a, scale: 1 },
  { id: 'bakery-side', near: 'kettlewick.bakery-door', dx: 5, dz: 10, face: [-0.5, -1], model: 'rogueHooded', tint: 0xaa9a7a, scale: 0.96 },
];

export interface TownsfolkDeps {
  scene: THREE.Scene;
  anchors: { find(id: string): { position: { x: number; y: number; z: number }; yaw: number } | undefined };
  heightAt?: (x: number, z: number) => number;
  /** Optional GLB loader (same shape the NPCs use); without it, or if it fails, figures stay placeholders. */
  loader?: NpcModelLoader;
  warn?: (msg: string) => void;
}

interface Figure {
  def: NpcDef;
  root: THREE.Group;
  body: THREE.Object3D;
  placeholder: boolean;
  mixer: THREE.AnimationMixer | null;
  phase: number;
  baseYaw: number;
}

function disposeModel(model: THREE.Object3D): void {
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
  });
}

export class Townsfolk {
  private readonly figures: Figure[] = [];
  private visible = true;
  private disposed = false;
  private t = 0;

  constructor(private readonly deps: TownsfolkDeps) {
    const warn = deps.warn ?? ((m: string) => console.warn(m));
    const missing = new Set<string>();
    for (const s of TOWNSFOLK_SPOTS) {
      const a = deps.anchors.find(s.near);
      if (!a) {
        missing.add(s.near);
        continue;
      }
      this.spawn(s, a.position.x + s.dx, a.position.z + s.dz);
    }
    if (missing.size) warn(`Townsfolk: missing anchors, skipped some figures: ${[...missing].join(', ')}`);
  }

  get count(): number {
    return this.figures.length;
  }

  private spawn(s: TownsfolkSpot, x: number, z: number): void {
    const def: NpcDef = { id: `townsfolk.${s.id}`, nameKey: '', model: s.model, scale: s.scale, tint: s.tint, dialogueId: '', idleClip: 'Idle' };
    const root = new THREE.Group();
    root.name = def.id;
    const y = this.deps.heightAt?.(x, z) ?? 0;
    root.position.set(x, y, z);
    // Engine yaw 0 faces -Z; forward is (-sin yaw, -cos yaw).
    const baseYaw = Math.atan2(-s.face[0], -s.face[1]);
    root.rotation.y = baseYaw;
    const body = buildPlaceholder(def);
    root.add(body);
    root.visible = this.visible;
    this.deps.scene.add(root);
    const fig: Figure = { def, root, body, placeholder: true, mixer: null, phase: this.figures.length * 1.7, baseYaw };
    this.figures.push(fig);
    this.upgrade(fig);
  }

  private upgrade(fig: Figure): void {
    const loader = this.deps.loader;
    if (!loader) return;
    const warn = this.deps.warn ?? ((m: string) => console.warn(m));
    loader.load(fig.def.model).then(
      () => {
        if (this.disposed) return;
        try {
          const { model, clips } = prepareNpcModel(loader, fig.def);
          fig.root.remove(fig.body);
          disposePlaceholder(fig.body);
          fig.body = model;
          fig.placeholder = false;
          fig.root.add(model);
          const clip = pickIdleClip(clips, fig.def.idleClip);
          if (clip) {
            fig.mixer = new THREE.AnimationMixer(model);
            const act = fig.mixer.clipAction(clip);
            act.time = fig.phase % Math.max(clip.duration, 0.01);
            act.play();
          }
        } catch (err) {
          warn(`Townsfolk: could not build model for ${fig.def.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
      (err) => {
        if (!this.disposed) warn(`Townsfolk: model load failed for ${fig.def.id}: ${err instanceof Error ? err.message : String(err)}`);
      },
    );
  }

  /** Cheap and idempotent. */
  setVisible(on: boolean): void {
    if (this.disposed || on === this.visible) return;
    this.visible = on;
    for (const f of this.figures) f.root.visible = on;
  }

  update(dt: number): void {
    if (this.disposed || !this.visible) return;
    this.t += dt;
    for (const f of this.figures) {
      if (f.mixer) {
        f.mixer.update(dt);
        continue;
      }
      // Placeholder: a slow weight shift and a small turn so they do not look frozen.
      f.body.position.y = Math.sin(this.t * 1.6 + f.phase) * 0.015;
      f.root.rotation.y = f.baseYaw + Math.sin(this.t * 0.5 + f.phase) * 0.12;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const f of this.figures) {
      f.mixer?.stopAllAction();
      this.deps.scene.remove(f.root);
      if (f.placeholder) disposePlaceholder(f.body);
      else disposeModel(f.body);
    }
    this.figures.length = 0;
  }
}
