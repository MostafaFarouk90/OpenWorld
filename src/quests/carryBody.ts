// A villager's body for M01's carry: the KayKit figure the NPCs use, standing at home and cradled across the Knight's
// arms while carried. A capsule stands in until the GLB loads (and in headless runs, which have no loader).
import * as THREE from 'three';
import { pickIdleClip, prepareNpcModel } from '../npcs/npcModels';
import type { NpcDef, NpcModelId, NpcModelLoader } from '../npcs/types';

/** Where the cradled body rides, in the Knight's frame (forward is -Z): in front of the chest, lying across the arms. */
export const CARRY_FORWARD = 0.55;
export const CARRY_HEIGHT = 1.05;
/** Height of the standing placeholder and of a standing body (m). */
const BODY_HEIGHT = 1.8;

const MODELS: readonly NpcModelId[] = ['barbarian', 'rogue', 'mage'];

export function isModelLoader(x: unknown): x is NpcModelLoader {
  const l = x as Partial<NpcModelLoader> | null | undefined;
  return !!l && typeof l.load === 'function' && typeof l.instantiate === 'function' && typeof l.animations === 'function';
}

export class VillagerBody {
  readonly root = new THREE.Group();
  /** Holds whichever figure is current (capsule, then the GLB); lies down while carried. */
  private readonly figure = new THREE.Group();
  private placeholder: THREE.Mesh | null;
  private mixer: THREE.AnimationMixer | null = null;
  private disposed = false;

  constructor(index: number, tint: number, loader: NpcModelLoader | null) {
    this.placeholder = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, BODY_HEIGHT - 0.6, 4, 8),
      new THREE.MeshStandardMaterial({ color: tint }),
    );
    this.placeholder.position.y = BODY_HEIGHT / 2;
    this.figure.add(this.placeholder);
    this.root.add(this.figure);
    this.root.visible = false;
    if (loader) void this.loadModel(loader, MODELS[index % MODELS.length], tint);
  }

  private async loadModel(loader: NpcModelLoader, model: NpcModelId, tint: number): Promise<void> {
    try {
      await loader.load(model);
      if (this.disposed) return;
      const def: NpcDef = { id: `carry-villager`, nameKey: '', model, scale: 1, tint, dialogueId: '', idleClip: 'Idle' };
      const loaded = prepareNpcModel(loader, def);
      this.figure.add(loaded.model);
      const clip = pickIdleClip(loaded.clips, def.idleClip);
      if (clip) {
        this.mixer = new THREE.AnimationMixer(loaded.model);
        this.mixer.clipAction(clip).play();
      }
      if (this.placeholder) {
        this.figure.remove(this.placeholder);
        this.placeholder.geometry.dispose();
        (this.placeholder.material as THREE.Material).dispose();
        this.placeholder = null;
      }
    } catch {
      // keep the capsule: a missing model must never block the quest
    }
  }

  /** Standing at `p` (the feet), or, with a carrier yaw, lying across that carrier's arms at `p`. */
  setPose(p: { x: number; y: number; z: number }, carrierYaw?: number): void {
    if (carrierYaw === undefined) {
      this.root.position.set(p.x, p.y, p.z);
      this.root.rotation.set(0, 0, 0);
      this.figure.rotation.set(0, 0, 0);
      this.figure.position.set(0, 0, 0);
      return;
    }
    // pivot at the carrier's feet, turned with them; the figure lies along local X, head to the carrier's left
    const fwdX = -Math.sin(carrierYaw);
    const fwdZ = -Math.cos(carrierYaw);
    this.root.position.set(p.x + fwdX * CARRY_FORWARD, p.y + CARRY_HEIGHT, p.z + fwdZ * CARRY_FORWARD);
    this.root.rotation.set(0, carrierYaw, 0);
    this.figure.rotation.set(0, 0, Math.PI / 2);
    this.figure.position.set(BODY_HEIGHT / 2, 0, 0);
  }

  setVisible(on: boolean): void { this.root.visible = on; }

  update(dt: number): void {
    if (this.root.visible) this.mixer?.update(dt);
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mm.dispose();
    });
  }
}
