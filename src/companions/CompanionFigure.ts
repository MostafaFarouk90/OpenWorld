// The companion's visual: a placeholder at once, the KayKit GLB once loaded (dressed by the companion's look: Tobb's
// cloak and lute, Hrolf's axe and beard), and a mixer that blends Idle, Walking_A and Running_A by gait. A5 adds a
// one-shot attack and a held kneel for the companions who fight or fall.
import * as THREE from 'three';
import { buildPlaceholder, disposePlaceholder, prepareNpcModel } from '../npcs/npcModels';
import type { NpcDef, NpcModelLoader } from '../npcs/types';
import type { Gait } from './FollowModel';
import { applyTobbCloak, buildLute, disposeLute } from './tobbLook';
import type { CompanionLook } from './types';

const CLIPS: Record<Gait, string> = { idle: 'Idle', walk: 'Walking_A', run: 'Running_A', sprint: 'Running_A' };
const FADE = 0.2;

export const TOBB_NPC_DEF: NpcDef = {
  id: 'tobb',
  nameKey: 'companion.tobb.name',
  model: 'rogueHooded',
  scale: 1,
  tint: null,
  dialogueId: 'npc-tobb',
  idleClip: 'Idle',
};

/** Tobb's look: the shipped default. */
export const TOBB_LOOK: CompanionLook = {
  npcDef: TOBB_NPC_DEF,
  dress: applyTobbCloak,
  props: buildLute,
  disposeProps: (o) => disposeLute(o as THREE.Group),
};

/** How far the model dips while kneeling when the rig has no kneel clip. */
const KNEEL_DIP = 0.5;

export class CompanionFigure {
  readonly root = new THREE.Group();
  private figure: THREE.Object3D;
  private placeholder = true;
  private readonly props: THREE.Object3D | null;
  private readonly def: NpcDef;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private gait: Gait = 'idle';
  private disposed = false;
  private attack: THREE.AnimationAction | null = null;
  private kneel: THREE.AnimationAction | null = null;
  private kneeling = false;
  private attackLeft = 0;

  constructor(private readonly look: CompanionLook = TOBB_LOOK) {
    this.def = look.npcDef;
    this.root.name = `companion:${this.def.id}`;
    this.figure = buildPlaceholder(this.def);
    this.root.add(this.figure);
    this.props = look.props?.() ?? null;
    if (this.props) this.root.add(this.props);
  }

  get isKneeling(): boolean {
    return this.kneeling;
  }

  get hasModel(): boolean {
    return !this.placeholder;
  }

  /** Never rejects; a failure keeps the placeholder. */
  async load(loader: NpcModelLoader | null | undefined, warn: (m: string) => void = console.warn): Promise<void> {
    if (!loader || this.disposed) return;
    try {
      await loader.load(this.def.model);
      if (this.disposed) return;
      const { model, clips } = prepareNpcModel(loader, this.def);
      this.look.dress?.(model);
      this.root.remove(this.figure);
      disposePlaceholder(this.figure);
      this.figure = model;
      this.placeholder = false;
      this.root.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const name of new Set(Object.values(CLIPS))) {
        const clip = clips.find((c) => c.name === name);
        if (clip) this.actions.set(name, this.mixer.clipAction(clip));
      }
      const pick = (names: readonly string[] | undefined) => {
        for (const n of names ?? []) {
          const c = clips.find((x) => x.name === n);
          if (c) return this.mixer!.clipAction(c);
        }
        return null;
      };
      this.attack = pick(this.look.clips?.attack);
      if (this.attack) {
        this.attack.setLoop(THREE.LoopOnce, 1);
        this.attack.clampWhenFinished = true;
      }
      this.kneel = pick(this.look.clips?.kneel);
      if (this.kneel) {
        this.kneel.setLoop(THREE.LoopOnce, 1);
        this.kneel.clampWhenFinished = true;
      }
      this.current = null;
      this.play(this.gait, true);
      if (this.kneeling) this.applyKneel(true);
    } catch (err) {
      warn(`companions: model "${this.def.model}" failed, keeping the placeholder: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  setGait(g: Gait): void {
    if (g === this.gait && this.current) return;
    this.gait = g;
    if (this.kneeling || this.attackLeft > 0) return;
    this.play(g, false);
  }

  /** One swing; the gait clip resumes when it ends. Ignored while kneeling. */
  playAttack(seconds = 0.8): void {
    if (this.kneeling) return;
    this.attackLeft = seconds;
    const a = this.attack;
    if (!a) return;
    a.reset().play();
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, 0.1, false);
    this.current = a;
  }

  setKneel(on: boolean): void {
    if (on === this.kneeling) return;
    this.kneeling = on;
    this.attackLeft = 0;
    this.applyKneel(on);
  }

  private applyKneel(on: boolean): void {
    if (on && this.kneel) {
      this.kneel.reset().play();
      if (this.current && this.current !== this.kneel) this.kneel.crossFadeFrom(this.current, FADE, false);
      this.current = this.kneel;
      this.figure.position.y = 0;
      return;
    }
    this.figure.position.y = on ? -KNEEL_DIP : 0;
    if (!on) {
      if (this.current === this.kneel) this.current = null;
      this.kneel?.stop();
      this.play(this.gait, true);
    }
  }

  update(dt: number): void {
    if (!(dt > 0)) return;
    if (this.attackLeft > 0) {
      this.attackLeft = Math.max(0, this.attackLeft - dt);
      if (this.attackLeft === 0 && !this.kneeling) {
        if (this.current === this.attack) {
          this.attack?.stop();
          this.current = null;
        }
        this.play(this.gait, true);
      }
    }
    this.mixer?.update(dt);
  }

  private play(g: Gait, instant: boolean): void {
    // A rig missing the gait's clip falls back to Idle.
    const next = this.actions.get(CLIPS[g]) ?? this.actions.get(CLIPS.idle);
    if (!next || next === this.current) return;
    next.reset().play();
    if (this.current && !instant) next.crossFadeFrom(this.current, FADE, false);
    else if (this.current) this.current.stop();
    this.current = next;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.root.remove(this.figure);
    if (this.props) {
      this.root.remove(this.props);
      this.look.disposeProps?.(this.props);
    }
    if (this.placeholder) disposePlaceholder(this.figure);
    else
      this.figure.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
      });
    this.root.removeFromParent();
  }
}
