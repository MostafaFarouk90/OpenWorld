import * as THREE from 'three';
import { HurtboxSet } from '../../combat/HurtboxSet';
import { KNIGHT } from '../../config/constants';
import { HELD_PROP_ROTATION } from '../../enemies/envProp';
import { disposeGroundProp, makeGroundProp } from '../../enemies/ranged/props';
import { HELD_ITEM } from '../../npcs/npcModels';
import { LOOK } from './tuning';

/** Redmane's clips: friendly names over the shared KayKit rig's (Knight.glb, as ENEMY_CLIPS and ENEMY_ATTACKS name them). */
export const REDMANE_CLIPS = {
  idle: 'Idle',
  walk: 'Walking_B',
  run: 'Running_A',
  couch: '1H_Melee_Attack_Stab',
  thrust: '1H_Melee_Attack_Stab',
  net: 'Throw',
  trap: 'Use_Item',
  flinch: 'Hit_A',
  stagger: 'Hit_B',
  kneel: 'Sit_Floor_Down',
  death: 'Death_A',
} as const;

export type RedmaneClip = keyof typeof REDMANE_CLIPS;

/** Three.js strips the dot from glTF `handslot.r`. */
export const LANCE_BONE = 'handslotr';

export interface RedmaneModelSource {
  /** An already-cloned Barbarian scene (AssetLoader.instantiate). */
  model: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
  /** A fresh `env/lance-redmane` (origin at the grip, point toward +Z, 3.2 m), or null/absent when it has not loaded: the procedural lance shows. */
  lance?: THREE.Object3D | null;
}

export interface RedmaneModel {
  /** Feet at the origin; place and turn this (yaw 0 faces -Z, like the Knight). */
  readonly root: THREE.Group;
  /** The glTF scene; the hurtbox owner. */
  readonly owner: THREE.Object3D;
  readonly hurtboxes: HurtboxSet;
  /** The procedural lance, in his right hand until `dropLance`. */
  readonly lance: THREE.Object3D;
  /** Crossfades to a clip; one-shots clamp on their last frame. Unknown clips warn once and keep the current one. */
  play(clip: RedmaneClip, opts?: { loop?: boolean; fade?: number }): void;
  /** Gait speed in m/s: picks the walk or run loop's playback rate. */
  setSpeed(mps: number): void;
  update(dt: number): void;
  /** 0..1 flashes the red tabard (the couch's telegraph); 0 restores it. */
  setTelegraph(t: number): void;
  setOpacity(o: number): void;
  /** The Spare: the lance leaves his hand and lies on the floor beside him. */
  dropLance(): void;
  dispose(): void;
}

type Tintable = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; opacity: number; transparent: boolean };

/**
 * Builds Hunt-Captain Thrandil Redmane from a cloned KayKit Barbarian (design 10 row 19, 14): scaled 1.15, a red tabard tint,
 * every built-in held item hidden (axe, shield) and a procedural lance in the right hand (the pack has no spear; the prop is
 * the Dragon-Hunters' spear, longer). The model carries hurtboxes so a real blade sweep reaches him.
 *
 * @throws Error when the model has no skinned mesh or no `handslot.r` bone.
 */
export function buildRedmaneModel(source: RedmaneModelSource, warn: (m: string) => void = () => {}): RedmaneModel {
  const root = new THREE.Group();
  root.name = 'boss-thrandil-redmane';
  const model = source.model;
  model.rotation.y = Math.PI;
  model.scale.setScalar(KNIGHT.modelScale * LOOK.scale);
  root.add(model);

  let skeleton: THREE.Skeleton | null = null;
  model.traverse((o) => {
    const skinned = o as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && !skeleton) skeleton = skinned.skeleton;
  });
  if (!skeleton) throw new Error('buildRedmaneModel: the model has no skinned mesh');
  const hand = (skeleton as THREE.Skeleton).bones.find((b) => b.name === LANCE_BONE);
  if (!hand) throw new Error(`buildRedmaneModel: bone "${LANCE_BONE}" not found`);

  model.traverse((o) => {
    if (HELD_ITEM.test(o.name)) o.visible = false;
  });

  const tint = new THREE.Color(LOOK.tint);
  const flash = new THREE.Color(LOOK.flash);
  const baseEmissive = new THREE.Color(LOOK.emissive);
  const clones = new Map<THREE.Material, Tintable>();
  const cloneOf = (m: THREE.Material): THREE.Material => {
    let c = clones.get(m);
    if (!c) {
      c = m.clone() as Tintable;
      c.name = `${m.name || 'material'}#thrandil-redmane`;
      if (c.color) c.color.lerp(tint, 0.6);
      if (c.emissive) c.emissive.copy(baseEmissive);
      clones.set(m, c);
    }
    return c;
  };
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneOf) : cloneOf(mesh.material);
  });

  // The model's lance when it loaded (grip at the origin, point along +Z: turned onto the bone's +Y, no offset), else the procedural one.
  const modelLance = source.lance ?? null;
  const lance = modelLance ?? makeGroundProp('proc/hunter-spear')!;
  lance.name = 'redmane-lance';
  // Undo the bone's world scale so the lance keeps its metre size on the 1.15 rig.
  root.updateMatrixWorld(true);
  const s = new THREE.Vector3().setFromMatrixScale(hand.matrixWorld).y || 1;
  const heldScale = modelLance ? 1 : LOOK.lanceScale;
  lance.scale.setScalar(heldScale / s);
  if (modelLance) {
    lance.position.set(0, 0, 0);
    lance.rotation.set(...HELD_PROP_ROTATION);
  }
  hand.add(lance);
  let lanceDropped = false;

  const hurtboxes = new HurtboxSet(model, undefined, model);
  const mixer = new THREE.AnimationMixer(model);
  const byName = new Map(source.clips.map((c) => [c.name, c]));
  const warned = new Set<string>();
  let current: THREE.AnimationAction | null = null;
  let disposed = false;

  return {
    root,
    owner: model,
    hurtboxes,
    lance,
    play(clip, opts = {}) {
      const name = REDMANE_CLIPS[clip];
      const c = byName.get(name);
      if (!c) {
        if (!warned.has(name)) {
          warned.add(name);
          warn(`thrandil-redmane: clip "${name}" missing`);
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
    setSpeed(mps) {
      if (current) current.timeScale = Math.max(0.5, Math.min(1.6, Number.isFinite(mps) ? mps / 3 : 1));
    },
    update(dt) {
      if (Number.isFinite(dt) && dt > 0) mixer.update(dt);
    },
    setTelegraph(t) {
      const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      for (const m of clones.values()) m.emissive?.copy(baseEmissive).lerp(flash, k * 0.8);
    },
    setOpacity(o) {
      const v = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
      for (const m of clones.values()) {
        const transparent = v < 1;
        if (m.transparent !== transparent) m.needsUpdate = true;
        m.transparent = transparent;
        m.opacity = v;
      }
    },
    dropLance() {
      if (lanceDropped) return;
      lanceDropped = true;
      lance.removeFromParent();
      lance.scale.setScalar(heldScale);
      lance.position.set(0.6, 0.06, -0.3);
      // The procedural lance runs along +Y (laid on its side); the model's runs along +Z and already lies flat.
      lance.rotation.set(0, 0.6, modelLance ? 0 : Math.PI / 2);
      root.add(lance);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      for (const m of clones.values()) m.dispose();
      // The model's lance shares its geometry with the library; only the procedural one owns its own.
      if (modelLance) lance.removeFromParent();
      else disposeGroundProp(lance);
      hurtboxes.dispose();
      root.removeFromParent();
    },
  };
}
