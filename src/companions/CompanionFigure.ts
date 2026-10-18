// The companion's visual: a placeholder at once, the KayKit GLB once loaded (Tobb's cloak and lute), and a mixer
// that blends Idle, Walking_A and Running_A by gait.
import * as THREE from 'three';
import { buildPlaceholder, disposePlaceholder, prepareNpcModel } from '../npcs/npcModels';
import type { NpcDef, NpcModelLoader } from '../npcs/types';
import type { Gait } from './FollowModel';
import { applyTobbCloak, buildLute, disposeLute } from './tobbLook';

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

export class CompanionFigure {
  readonly root = new THREE.Group();
  private figure: THREE.Object3D;
  private placeholder = true;
  private readonly lute: THREE.Group;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private gait: Gait = 'idle';
  private disposed = false;

  constructor(private readonly def: NpcDef = TOBB_NPC_DEF) {
    this.root.name = `companion:${def.id}`;
    this.figure = buildPlaceholder(def);
    this.root.add(this.figure);
    this.lute = buildLute();
    this.root.add(this.lute);
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
      applyTobbCloak(model);
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
      this.current = null;
      this.play(this.gait, true);
    } catch (err) {
      warn(`companions: model "${this.def.model}" failed, keeping the placeholder: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  setGait(g: Gait): void {
    if (g === this.gait && this.current) return;
    this.gait = g;
    this.play(g, false);
  }

  update(dt: number): void {
    if (dt > 0) this.mixer?.update(dt);
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
    this.root.remove(this.figure, this.lute);
    disposeLute(this.lute);
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
