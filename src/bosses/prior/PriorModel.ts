import * as THREE from 'three';
import { HurtboxSet } from '../../combat/HurtboxSet';
import { KNIGHT } from '../../config/constants';

/** The Prior's clips (KayKit Mage, same rig and clip set as the Knight plus the Spellcast clips). */
export const PRIOR_CLIPS = {
  idle: 'Idle',
  glide: 'Walking_C',
  censerLift: 'Spellcast_Raise',
  censerSwing: '2H_Melee_Attack_Spin',
  chain: 'Spellcast_Shoot',
  summon: 'Spellcasting',
  hitA: 'Hit_A',
  hitB: 'Hit_B',
  kneel: 'Sit_Floor_Down',
  death: 'Death_A',
} as const;

export type PriorClip = keyof typeof PRIOR_CLIPS;

/** Mage props the Prior does not carry (the censer replaces them). */
export const HIDDEN_PROPS = ['2H_Staff', '1H_Wand', 'Spellbook', 'Spellbook_open'] as const;

/** Design 10 row 17: the Mage scaled 1.3 with a white robe tint. */
export const PRIOR_SCALE = 1.3;
export const ROBE_TINT = 0xe8e4dc;
export const GHOST_EMISSIVE = 0x1a2230;
/** Three.js strips the dot from glTF `handslot.r`. */
export const CENSER_BONE = 'handslotr';

export interface PriorModelSource {
  /** An already-cloned Mage scene (AssetLoader.instantiate). */
  model: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
}

export interface PriorModel {
  /** Feet at the origin; place and turn this (yaw 0 faces -Z, like the Knight). */
  readonly root: THREE.Group;
  /** The glTF scene; the hurtbox owner. */
  readonly owner: THREE.Object3D;
  readonly hurtboxes: HurtboxSet;
  readonly censer: THREE.Group;
  /** Crossfades to a clip; one-shots clamp on their last frame. Unknown clips warn once and keep the current one. */
  play(clip: PriorClip, opts?: { loop?: boolean; fade?: number }): void;
  /** Advances the mixer (fixed tick). */
  update(dt: number): void;
  /** Emissive boost 0..1 toward white on the censer and robe (the censer-lift flash fallback). */
  setGlow(t: number): void;
  dispose(): void;
}

type Tintable = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };

/**
 * Builds the Ashen Prior from a cloned Mage (plans/slice-2-ashen-prior.md section 4): the Knight's placement scaled by 1.3,
 * a white robe with a faint ghost emissive (the vfx dissolve shader patches these materials), the staff, wand and books
 * hidden, the hat kept, and a primitive censer on a chain in the right hand. The QP censer prop replaces it later.
 *
 * @throws Error when the model has no skinned mesh or no `handslot.r` bone.
 */
export function buildPriorModel(source: PriorModelSource, warn: (m: string) => void = () => {}): PriorModel {
  const root = new THREE.Group();
  root.name = 'boss-ashen-prior';
  const model = source.model;
  model.rotation.y = Math.PI;
  model.scale.setScalar(KNIGHT.modelScale * PRIOR_SCALE);
  root.add(model);

  let skeleton: THREE.Skeleton | null = null;
  model.traverse((o) => {
    const skinned = o as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && !skeleton) skeleton = skinned.skeleton;
  });
  if (!skeleton) throw new Error('buildPriorModel: the model has no skinned mesh');
  const hand = (skeleton as THREE.Skeleton).bones.find((b) => b.name === CENSER_BONE);
  if (!hand) throw new Error(`buildPriorModel: bone "${CENSER_BONE}" not found`);

  for (const name of HIDDEN_PROPS) {
    const prop = model.getObjectByName(name);
    if (prop) prop.visible = false;
  }

  const tint = new THREE.Color(ROBE_TINT);
  const clones = new Map<THREE.Material, Tintable>();
  const cloneOf = (m: THREE.Material): THREE.Material => {
    let c = clones.get(m);
    if (!c) {
      c = m.clone() as Tintable;
      c.name = `${m.name || 'material'}#ashen-prior`;
      if (c.color) c.color.lerp(tint, 0.75);
      if (c.emissive) c.emissive.setHex(GHOST_EMISSIVE);
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

  const censer = buildCenser();
  // Undo the bone's world scale so the censer keeps its metre size on the 1.3 rig.
  root.updateMatrixWorld(true);
  const s = new THREE.Vector3().setFromMatrixScale(hand.matrixWorld).y || 1;
  censer.scale.setScalar(1 / s);
  hand.add(censer);

  const hurtboxes = new HurtboxSet(model, undefined, model);

  const mixer = new THREE.AnimationMixer(model);
  const byName = new Map(source.clips.map((c) => [c.name, c]));
  const warned = new Set<string>();
  let current: THREE.AnimationAction | null = null;
  const glowMats = [...clones.values(), ...(censer.userData.glowMats as Tintable[])];
  const baseEmissive = new Map<Tintable, THREE.Color>();
  for (const m of glowMats) if (m.emissive) baseEmissive.set(m, m.emissive.clone());
  const white = new THREE.Color(0xffffff);
  let disposed = false;

  return {
    root,
    owner: model,
    hurtboxes,
    censer,
    play(clip, opts = {}) {
      const name = PRIOR_CLIPS[clip];
      const c = byName.get(name);
      if (!c) {
        if (!warned.has(name)) {
          warned.add(name);
          warn(`ashen-prior: clip "${name}" missing`);
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
    setGlow(t) {
      const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      for (const [m, base] of baseEmissive) m.emissive!.copy(base).lerp(white, k);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      for (const m of clones.values()) m.dispose();
      censer.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
      hurtboxes.dispose();
      root.removeFromParent();
    },
  };
}

/** A bronze bowl with an ember core on a 0.9 m chain of eight links, hanging from the hand (local -Y is down the chain). */
export function buildCenser(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'prior-censer';
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.8, roughness: 0.4, emissive: 0x000000 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.7, roughness: 0.6, emissive: 0x000000 });
  const ember = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff6a10, emissiveIntensity: 1.5 });
  const links = 8;
  const linkLength = 0.9 / links;
  for (let i = 0; i < links; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 4, 8), iron);
    link.position.y = -(i + 0.5) * linkLength;
    link.rotation.y = i % 2 ? Math.PI / 2 : 0;
    link.name = `censer-link-${i}`;
    group.add(link);
  }
  const profile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.09, 0.02),
    new THREE.Vector2(0.12, 0.09),
    new THREE.Vector2(0.1, 0.16),
    new THREE.Vector2(0.04, 0.2),
  ];
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 12), bronze);
  bowl.position.y = -0.9 - 0.2;
  bowl.name = 'censer-bowl';
  group.add(bowl);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), ember);
  core.position.y = -0.9 - 0.1;
  core.name = 'censer-ember';
  group.add(core);
  group.userData.glowMats = [bronze];
  return group;
}
