// Ulthred's look (taste call, plans/act5-N6.md "PR 2 build notes"): the KayKit Barbarian at 1.6x in ash-black with ember seams, his
// embedded two-handed axe kept as the hammer and made hot (white through each slam's tell), every other weapon and the mug hidden.
// Phase 3 adds Vey's forge-iron armour as a helm and pauldrons on the rig's bones: a dark visor with Vey inside (D09 defeated), a
// lit hollow helm without him (spared). Emissive only: no light of its own.
import * as THREE from 'three';
import { HurtboxSet } from '../../../combat/HurtboxSet';
import { KNIGHT } from '../../../config/constants';
import { LOOK, ULTHRED } from './tuning';

export const ULTHRED_CLIPS = {
  idle: '2H_Melee_Idle',
  walk: 'Walking_A',
  slam: '2H_Melee_Attack_Chop',
  sweep: '2H_Melee_Attack_Spin',
  fire: 'Spellcast_Raise',
  chains: 'Spellcast_Long',
  hit: 'Hit_A',
  stagger: 'Hit_B',
  kneel: 'Sit_Floor_Down',
  roar: 'Cheer',
  death: 'Death_A',
} as const;

export type UlthredClip = keyof typeof ULTHRED_CLIPS;

/** The Barbarian's embedded weapons and props; the two-handed axe stays (his hammer). */
export const BARBARIAN_HIDDEN = ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', 'Mug'] as const;
export const ULTHRED_HAMMER = '2H_Axe';

export type ArmourLook = 'none' | 'body' | 'hollow';

export interface UlthredModelSource {
  model: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
}

export interface UlthredModel {
  readonly root: THREE.Group;
  readonly owner: THREE.Object3D;
  readonly hurtboxes: HurtboxSet;
  play(clip: UlthredClip, opts?: { loop?: boolean; fade?: number }): void;
  setSpeed(mps: number): void;
  update(dt: number): void;
  /** 0..1: the hammer from hot to white (a slam's tell). */
  setHammerGlow(t: number): void;
  /** 0..1: the ember seams (rise with each bar). */
  setEmbers(t: number): void;
  setArmour(look: ArmourLook): void;
  setOpacity(o: number): void;
  dispose(): void;
}

type Tintable = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; opacity: number; transparent: boolean };

/** @throws Error when the model has no skinned mesh. */
export function buildUlthredModel(source: UlthredModelSource, warn: (m: string) => void = () => {}): UlthredModel {
  const root = new THREE.Group();
  root.name = 'boss-ulthred';
  const model = source.model;
  model.rotation.y = Math.PI;
  model.scale.setScalar(KNIGHT.modelScale * ULTHRED.modelScale);
  root.add(model);
  let skinned = false;
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
  });
  if (!skinned) throw new Error('buildUlthredModel: the model has no skinned mesh');
  const hidden = new Set<string>(BARBARIAN_HIDDEN);
  model.traverse((o) => {
    if (hidden.has(o.name)) o.visible = false;
  });

  const ash = new THREE.Color(LOOK.ash);
  const ember = new THREE.Color(LOOK.ember);
  const hot = new THREE.Color(LOOK.hammerHot);
  const white = new THREE.Color(LOOK.hammerWhite);
  const body: Tintable[] = [];
  const hammer: Tintable[] = [];
  const clones = new Map<THREE.Material, Tintable>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    let hammerPart = false;
    for (let p: THREE.Object3D | null = mesh; p; p = p.parent) if (p.name === ULTHRED_HAMMER) hammerPart = true;
    const cloneOf = (m: THREE.Material): THREE.Material => {
      const known = clones.get(m);
      if (known && !hammerPart) return known;
      const c = m.clone() as Tintable;
      c.name = `${m.name || 'material'}#ulthred${hammerPart ? '-hammer' : ''}`;
      if (hammerPart) {
        c.color?.copy(hot);
        c.emissive?.copy(hot);
        if (c.emissiveIntensity !== undefined) c.emissiveIntensity = 1.2;
        hammer.push(c);
      } else {
        c.color?.lerp(ash, 0.82);
        body.push(c);
        clones.set(m, c);
      }
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneOf) : cloneOf(mesh.material);
  });
  if (hammer.length === 0) warn('ulthred: no embedded two-handed axe; the hammer glow is skipped');

  // Vey's armour: a helm on the head bone and two pauldrons on the upper arms, hidden until phase 3.
  const armourMat = new THREE.MeshStandardMaterial({ color: LOOK.armour, roughness: 0.55, metalness: 0.7, emissive: new THREE.Color(0) });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x050403, emissive: new THREE.Color(0), roughness: 0.9 });
  const armour = new THREE.Group();
  armour.name = 'ulthred-vey-armour';
  const bone = (name: string): THREE.Object3D | null => {
    let found: THREE.Object3D | null = null;
    model.traverse((o) => {
      if (!found && o.name === name && !(o as THREE.Mesh).isMesh) found = o;
    });
    return found;
  };
  const parts: { at: THREE.Object3D; mesh: THREE.Mesh }[] = [];
  const head = bone('head');
  if (head) {
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.66, 0.62), armourMat);
    helm.position.set(0, 0.42, 0);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.05), visorMat);
    visor.position.set(0, 0.46, 0.32);
    parts.push({ at: head, mesh: helm }, { at: head, mesh: visor });
  }
  for (const side of ['upperarm.l', 'upperarm.r']) {
    const arm = bone(side);
    if (!arm) continue;
    const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.46), armourMat);
    pauldron.position.set(0, 0.12, 0);
    parts.push({ at: arm, mesh: pauldron });
  }
  if (parts.length === 0) warn('ulthred: no head or arm bones; Vey\'s armour is skipped');
  for (const p of parts) {
    p.mesh.visible = false;
    p.at.add(p.mesh);
  }

  const hurtboxes = new HurtboxSet(model, undefined, model);
  const mixer = new THREE.AnimationMixer(model);
  const byName = new Map(source.clips.map((c) => [c.name, c]));
  const warned = new Set<string>();
  let current: THREE.AnimationAction | null = null;
  let disposed = false;
  let embers = 0;
  const applyEmbers = () => {
    for (const m of body) m.emissive?.copy(ember).multiplyScalar(0.05 + 0.25 * embers);
  };
  applyEmbers();

  return {
    root,
    owner: model,
    hurtboxes,
    play(clip, opts = {}) {
      const name = ULTHRED_CLIPS[clip];
      const c = byName.get(name);
      if (!c) {
        if (!warned.has(name)) {
          warned.add(name);
          warn(`ulthred: clip "${name}" missing`);
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
      if (current) current.timeScale = Math.max(0.5, Math.min(1.6, Number.isFinite(mps) ? mps / 2.6 : 1));
    },
    update(dt) {
      if (Number.isFinite(dt) && dt > 0) mixer.update(dt);
    },
    setHammerGlow(t) {
      const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      for (const m of hammer) {
        m.emissive?.copy(hot).lerp(white, k);
        m.color?.copy(hot).lerp(white, k);
      }
    },
    setEmbers(t) {
      embers = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      applyEmbers();
    },
    setArmour(look) {
      for (const p of parts) p.mesh.visible = look !== 'none';
      // Hollow: the helm lit from inside (no one in it); body: Vey inside, the visor dark.
      visorMat.emissive.setHex(look === 'hollow' ? LOOK.helmHollow : 0x000000);
      armourMat.emissive.setHex(look === 'hollow' ? 0x301008 : 0x000000);
    },
    setOpacity(o) {
      const v = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
      for (const m of [...body, ...hammer, armourMat, visorMat] as Tintable[]) {
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
      for (const m of [...body, ...hammer]) m.dispose();
      for (const p of parts) {
        p.mesh.removeFromParent();
        p.mesh.geometry.dispose();
      }
      armourMat.dispose();
      visorMat.dispose();
      hurtboxes.dispose();
      root.removeFromParent();
    },
  };
}
