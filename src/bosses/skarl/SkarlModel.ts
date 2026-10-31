import * as THREE from 'three';
import { HurtboxSet } from '../../combat/HurtboxSet';
import { KNIGHT } from '../../config/constants';
import { HELD_ITEM } from '../../npcs/npcModels';
import { LOOK } from './tuning';

/** Skarl's clips over the KayKit Rogue_Hooded rig. */
export const SKARL_CLIPS = {
  idle: '2H_Melee_Idle',
  strafeLeft: 'Running_Strafe_Left',
  strafeRight: 'Running_Strafe_Right',
  aim: '2H_Ranged_Aiming',
  shoot: '2H_Ranged_Shoot',
  reload: '2H_Ranged_Reload',
  kick: 'Unarmed_Melee_Attack_Kick',
  backstep: 'Dodge_Backward',
  stagger: 'Hit_B',
  kneel: 'Sit_Floor_Down',
  death: 'Death_A',
} as const;

export type SkarlClip = keyof typeof SKARL_CLIPS;

/** The built-in crossbow he keeps (every other held item is hidden). */
export const CROSSBOW_NODE = '2H_Crossbow';
export const CAPE_NODE = 'Rogue_Cape';

export interface SkarlModelSource {
  /** An already-cloned Rogue_Hooded scene (AssetLoader.instantiate). */
  model: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
}

export interface SkarlModel {
  /** Feet at the origin; yaw 0 faces -Z, like the Knight. */
  readonly root: THREE.Group;
  readonly owner: THREE.Object3D;
  readonly hurtboxes: HurtboxSet;
  /** The crossbow node (null if the rig has none: he still fights). */
  readonly crossbow: THREE.Object3D | null;
  play(clip: SkarlClip, opts?: { loop?: boolean; fade?: number }): void;
  update(dt: number): void;
  /** 0..1 flashes the red cloak (the aim's telegraph). */
  setTelegraph(t: number): void;
  setOpacity(o: number): void;
  /** The Spare: the crossbow leaves his hands and lies beside him. */
  dropCrossbow(): void;
  dispose(): void;
}

type Tintable = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; opacity: number; transparent: boolean };

/**
 * Hunt-Marshal Corvin Skarl from a cloned KayKit Rogue_Hooded (plans/act3-K8-pr2.md 3.5): scaled 1.2, a red cloak on its own
 * material clone, the built-in two-handed crossbow kept and every other held item hidden, hurtboxes on the KayKit skeleton.
 *
 * @throws Error when the model has no skinned mesh.
 */
export function buildSkarlModel(source: SkarlModelSource, warn: (m: string) => void = () => {}): SkarlModel {
  const root = new THREE.Group();
  root.name = 'boss-corvin-skarl';
  const model = source.model;
  model.rotation.y = Math.PI;
  model.scale.setScalar(KNIGHT.modelScale * LOOK.scale);
  root.add(model);

  let skinned = false;
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
  });
  if (!skinned) throw new Error('buildSkarlModel: the model has no skinned mesh');

  let crossbow: THREE.Object3D | null = null;
  model.traverse((o) => {
    if (o.name === CROSSBOW_NODE) {
      crossbow = o;
      o.visible = true;
    } else if (HELD_ITEM.test(o.name)) o.visible = false;
  });
  if (!crossbow) warn('corvin-skarl: no 2H_Crossbow node on the rig');

  // Every material cloned (so opacity and the flash stay his); the cape's tinted red.
  const cloak = new THREE.Color(LOOK.cloak);
  const flash = new THREE.Color(LOOK.flash);
  const clones = new Set<Tintable>();
  const capeMats = new Set<Tintable>();
  const shared = new Map<THREE.Material, Tintable>();
  const cloneOf = (m: THREE.Material, cape: boolean): THREE.Material => {
    if (cape) {
      const c = m.clone() as Tintable;
      c.name = `${m.name || 'material'}#corvin-skarl-cape`;
      c.color?.copy(cloak);
      c.emissive?.set(0x000000);
      clones.add(c);
      capeMats.add(c);
      return c;
    }
    let c = shared.get(m);
    if (!c) {
      c = m.clone() as Tintable;
      c.name = `${m.name || 'material'}#corvin-skarl`;
      shared.set(m, c);
      clones.add(c);
    }
    return c;
  };
  let capeFound = false;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let cape = false;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name === CAPE_NODE) cape = true;
    if (cape) capeFound = true;
    mesh.castShadow = true;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => cloneOf(m, cape)) : cloneOf(mesh.material, cape);
  });
  if (!capeFound) warn('corvin-skarl: no Rogue_Cape node; the red cloak is missing');

  const hurtboxes = new HurtboxSet(model, undefined, model);
  const mixer = new THREE.AnimationMixer(model);
  const byName = new Map(source.clips.map((c) => [c.name, c]));
  const warned = new Set<string>();
  let current: THREE.AnimationAction | null = null;
  let dropped = false;
  let disposed = false;

  return {
    root,
    owner: model,
    hurtboxes,
    crossbow,
    play(clip, opts = {}) {
      const name = SKARL_CLIPS[clip];
      const c = byName.get(name);
      if (!c) {
        if (!warned.has(name)) {
          warned.add(name);
          warn(`corvin-skarl: clip "${name}" missing`);
        }
        return;
      }
      const next = mixer.clipAction(c);
      const loop = opts.loop ?? false;
      next.reset();
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      next.clampWhenFinished = !loop;
      next.play();
      if (current && current !== next) next.crossFadeFrom(current, opts.fade ?? 0.15, false);
      current = next;
    },
    update(dt) {
      if (Number.isFinite(dt) && dt > 0) mixer.update(dt);
    },
    setTelegraph(t) {
      const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      for (const m of capeMats) m.color?.copy(cloak).lerp(flash, k);
    },
    setOpacity(o) {
      const v = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
      for (const m of clones) {
        const transparent = v < 1;
        if (m.transparent !== transparent) m.needsUpdate = true;
        m.transparent = transparent;
        m.opacity = v;
      }
    },
    dropCrossbow() {
      const bow = crossbow as THREE.Object3D | null;
      if (dropped || !bow) return;
      dropped = true;
      root.updateMatrixWorld(true);
      const scale = new THREE.Vector3().setFromMatrixScale(bow.matrixWorld);
      bow.removeFromParent();
      bow.scale.copy(scale);
      bow.position.set(0.6, 0.05, -0.4);
      bow.rotation.set(Math.PI / 2, 0, 0.5);
      root.add(bow);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      for (const m of clones) m.dispose();
      hurtboxes.dispose();
      root.removeFromParent();
    },
  };
}
