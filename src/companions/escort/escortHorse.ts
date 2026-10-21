// A plain Quaternius horse with a seated rider for Gaut's column (plans/act2-A5.md section 8, review change 5): built
// from `assets.instantiate('horse')` with its natural hide (the mount's GlbHorse is always the Ashmare). No physics, no
// hurtboxes, not the mount service. Without the glb (headless, a failed load) a small placeholder stands in.
import * as THREE from 'three';
import { GLB_HORSE_SCALE } from '../../mount/glbHorse';
import { buildPlaceholder, disposePlaceholder, prepareNpcModel } from '../../npcs/npcModels';
import type { NpcDef, NpcModelLoader } from '../../npcs/types';

/** The slice of the asset loader the horse needs. */
export interface HorseLoader {
  load(id: 'horse'): Promise<unknown>;
  instantiate(id: 'horse'): THREE.Object3D;
  animations(id: 'horse'): THREE.AnimationClip[];
}

/** Metres from the horse's feet to the saddle when the glb is missing (and the start before it is measured). */
export const SADDLE_HEIGHT = 1.3;
const SADDLE_ABOVE_TORSO = 0.27;
/** A dismounted rider stands this far to the horse's left. */
const STAND_SIDE = 1;
const FADE = 0.25;

export class EscortRider {
  readonly root = new THREE.Group();
  private readonly horseHolder = new THREE.Group();
  private horse: THREE.Object3D;
  private horsePlaceholder = true;
  private rider: THREE.Object3D;
  private riderPlaceholder = true;
  private horseMixer: THREE.AnimationMixer | null = null;
  private riderMixer: THREE.AnimationMixer | null = null;
  private readonly horseActions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private saddle = SADDLE_HEIGHT;
  private seated = true;
  private disposed = false;

  constructor(private readonly riderDef: NpcDef) {
    this.root.name = `escort:${riderDef.id}`;
    this.horseHolder.rotation.y = Math.PI;
    this.root.add(this.horseHolder);
    this.horse = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 2), new THREE.MeshStandardMaterial({ color: 0x6b4a30 }));
    this.horse.position.y = 0.9;
    this.horseHolder.add(this.horse);
    this.rider = buildPlaceholder(riderDef);
    this.root.add(this.rider);
    this.seat(true);
  }

  get isSeated(): boolean {
    return this.seated;
  }

  get saddleHeight(): number {
    return this.saddle;
  }

  /** Never rejects; a failure keeps the placeholders. */
  async load(horses: HorseLoader | null, npcs: NpcModelLoader | null, warn: (m: string) => void = console.warn): Promise<void> {
    if (horses) {
      try {
        await horses.load('horse');
        if (this.disposed) return;
        const model = horses.instantiate('horse');
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          // As the mount does: the export wrote alpha 0 with alphaMode MASK, which three discards whole. Natural hide.
          const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
          mat.alphaTest = 0;
          mat.opacity = 1;
          mat.transparent = false;
          mesh.material = mat;
          mesh.frustumCulled = false;
        });
        this.horseHolder.remove(this.horse);
        disposeOwned(this.horse);
        this.horse = new THREE.Group();
        this.horse.scale.setScalar(GLB_HORSE_SCALE);
        this.horse.add(model);
        this.horseHolder.add(this.horse);
        this.horsePlaceholder = false;
        this.horseMixer = new THREE.AnimationMixer(model);
        for (const c of horses.animations('horse')) this.horseActions.set(c.name, this.horseMixer.clipAction(c));
        this.root.updateMatrixWorld(true);
        const torso = model.getObjectByName('Torso');
        if (torso) {
          const w = torso.getWorldPosition(new THREE.Vector3());
          this.saddle = w.y - this.root.getWorldPosition(new THREE.Vector3()).y + SADDLE_ABOVE_TORSO;
        }
        this.play('Idle');
        this.seat(this.seated);
      } catch (err) {
        warn(`escort: the horse glb failed, keeping the placeholder: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (npcs) {
      try {
        await npcs.load(this.riderDef.model);
        if (this.disposed) return;
        const { model, clips } = prepareNpcModel(npcs, this.riderDef);
        this.root.remove(this.rider);
        disposePlaceholder(this.rider);
        this.rider = model;
        this.riderPlaceholder = false;
        this.root.add(model);
        this.riderMixer = new THREE.AnimationMixer(model);
        const idle = clips.find((c) => c.name === 'Idle') ?? clips.find((c) => c.name.includes('Idle'));
        if (idle) this.riderMixer.clipAction(idle).play();
        this.seat(this.seated);
      } catch (err) {
        warn(`escort: rider model "${this.riderDef.model}" failed, keeping the placeholder: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /** Seated on the saddle, or standing beside the horse. */
  seat(on: boolean): void {
    this.seated = on;
    if (on) this.rider.position.set(0, this.saddle, 0);
    else this.rider.position.set(-STAND_SIDE, 0, 0);
  }

  /** The horse's gait clip from its speed (Idle, Walk, Run). */
  setSpeed(speed: number): void {
    this.play(speed < 0.3 ? 'Idle' : speed < 3 ? 'Walk' : 'Run');
  }

  update(dt: number): void {
    if (!(dt > 0)) return;
    this.horseMixer?.update(dt);
    this.riderMixer?.update(dt);
  }

  private play(name: string): void {
    const next = this.horseActions.get(name);
    if (!next || next === this.current) return;
    next.reset().play();
    if (this.current) next.crossFadeFrom(this.current, FADE, false);
    this.current = next;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.horseMixer?.stopAllAction();
    this.riderMixer?.stopAllAction();
    if (this.horsePlaceholder) disposeOwned(this.horse);
    else disposeMaterials(this.horse);
    if (this.riderPlaceholder) disposePlaceholder(this.rider);
    else disposeMaterials(this.rider);
    this.root.removeFromParent();
  }
}

function disposeOwned(o: THREE.Object3D): void {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
  });
}

/** A clone shares geometry and textures with the cache; only cloned materials are its own. */
function disposeMaterials(o: THREE.Object3D): void {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
  });
}
