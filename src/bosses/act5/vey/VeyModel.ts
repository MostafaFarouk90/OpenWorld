// Morcant Vey's look (taste call, plans/act5-N6.md section 2): the KayKit Knight at 1.15 in black forge-iron with gold seams, his
// embedded one-handed sword kept and made red-hot (it goes white through each 0.5 s glow), every shield hidden, and a dragon-heart
// core glowing through the breastplate (brighter at each break). Emissive only: no light of its own (the glow pool is the arena's).
import * as THREE from 'three';
import { HurtboxSet } from '../../../combat/HurtboxSet';
import { KNIGHT } from '../../../config/constants';
import { EMBEDDED_SWORD, EMBEDDED_WEAPONS } from '../../../characters/knightClips';
import { LOOK, VEY } from './tuning';

export const VEY_CLIPS = {
  idle: 'Idle',
  walk: 'Walking_A',
  combo1: '1H_Melee_Attack_Slice_Horizontal',
  combo2: '1H_Melee_Attack_Slice_Diagonal',
  combo3: '1H_Melee_Attack_Chop',
  shock: 'Spellcast_Raise',
  roar: 'Spellcast_Summon',
  hit: 'Hit_A',
  stagger: 'Hit_B',
  kneel: 'Sit_Floor_Down',
  rise: 'Sit_Floor_StandUp',
  death: 'Death_A',
} as const;

export type VeyClip = keyof typeof VEY_CLIPS;

export interface VeyModelSource {
  /** An already-cloned Knight scene (AssetLoader.instantiate). */
  model: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
}

export interface VeyModel {
  /** Feet at the origin; place and turn this (yaw 0 faces -Z). */
  readonly root: THREE.Group;
  readonly owner: THREE.Object3D;
  readonly hurtboxes: HurtboxSet;
  play(clip: VeyClip, opts?: { loop?: boolean; fade?: number }): void;
  setSpeed(mps: number): void;
  update(dt: number): void;
  /** 0..1: the blade from red-hot to white (the combo glow). */
  setBladeGlow(t: number): void;
  /** 0..1: the dragon-heart core (rises by a quarter at each break). */
  setHeart(t: number): void;
  setOpacity(o: number): void;
  dispose(): void;
}

type Tintable = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; opacity: number; transparent: boolean };

/** @throws Error when the model has no skinned mesh. */
export function buildVeyModel(source: VeyModelSource, warn: (m: string) => void = () => {}): VeyModel {
  const root = new THREE.Group();
  root.name = 'boss-vey';
  const model = source.model;
  model.rotation.y = Math.PI;
  model.scale.setScalar(KNIGHT.modelScale * VEY.modelScale);
  root.add(model);
  let skinned = false;
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
  });
  if (!skinned) throw new Error('buildVeyModel: the model has no skinned mesh');

  const hidden = new Set<string>(EMBEDDED_WEAPONS.filter((w) => w !== EMBEDDED_SWORD));
  model.traverse((o) => {
    if (hidden.has(o.name)) o.visible = false;
  });

  const iron = new THREE.Color(LOOK.iron);
  const gold = new THREE.Color(LOOK.gold);
  const hot = new THREE.Color(LOOK.bladeHot);
  const white = new THREE.Color(LOOK.bladeWhite);
  const heartColour = new THREE.Color(LOOK.heart);
  const body: Tintable[] = [];
  const blade: Tintable[] = [];
  const clones = new Map<THREE.Material, Tintable>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    let swordPart = false;
    for (let p: THREE.Object3D | null = mesh; p; p = p.parent) if (p.name === EMBEDDED_SWORD) swordPart = true;
    const cloneOf = (m: THREE.Material): THREE.Material => {
      const key = m;
      let c = clones.get(key);
      if (c && !swordPart) return c;
      c = m.clone() as Tintable;
      c.name = `${m.name || 'material'}#vey${swordPart ? '-blade' : ''}`;
      if (swordPart) {
        c.color?.copy(hot);
        c.emissive?.copy(hot);
        if (c.emissiveIntensity !== undefined) c.emissiveIntensity = 1.4;
        blade.push(c);
      } else {
        c.color?.lerp(iron, 0.75).lerp(gold, 0.08);
        c.emissive?.setRGB(0, 0, 0);
        body.push(c);
        clones.set(key, c);
      }
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneOf) : cloneOf(mesh.material);
  });
  if (blade.length === 0) warn('vey: no embedded sword mesh; the blade glow is skipped');

  const hurtboxes = new HurtboxSet(model, undefined, model);
  const mixer = new THREE.AnimationMixer(model);
  const byName = new Map(source.clips.map((c) => [c.name, c]));
  const warned = new Set<string>();
  let current: THREE.AnimationAction | null = null;
  let heart = 0;
  let disposed = false;
  const applyHeart = () => {
    for (const m of body) m.emissive?.copy(heartColour).multiplyScalar(0.08 + 0.22 * heart);
  };
  applyHeart();

  return {
    root,
    owner: model,
    hurtboxes,
    play(clip, opts = {}) {
      const name = VEY_CLIPS[clip];
      const c = byName.get(name);
      if (!c) {
        if (!warned.has(name)) {
          warned.add(name);
          warn(`vey: clip "${name}" missing`);
        }
        return;
      }
      const next = mixer.clipAction(c);
      const loop = opts.loop ?? false;
      next.reset();
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      next.clampWhenFinished = !loop;
      next.play();
      if (current && current !== next) next.crossFadeFrom(current, opts.fade ?? 0.12, false);
      current = next;
    },
    setSpeed(mps) {
      if (current) current.timeScale = Math.max(0.5, Math.min(1.6, Number.isFinite(mps) ? mps / 3 : 1));
    },
    update(dt) {
      if (Number.isFinite(dt) && dt > 0) mixer.update(dt);
    },
    setBladeGlow(t) {
      const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      for (const m of blade) {
        m.emissive?.copy(hot).lerp(white, k);
        m.color?.copy(hot).lerp(white, k);
      }
    },
    setHeart(t) {
      heart = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      applyHeart();
    },
    setOpacity(o) {
      const v = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
      for (const m of [...body, ...blade]) {
        const transparent = v < 1;
        if (m.transparent !== transparent) m.needsUpdate = true;
        m.transparent = transparent;
        m.opacity = v;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      for (const m of [...body, ...blade]) m.dispose();
      hurtboxes.dispose();
      root.removeFromParent();
    },
  };
}
