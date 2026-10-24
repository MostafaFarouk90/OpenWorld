// The stand-in figure that walks Wenna's route (plans/act2-A13.md section 3.7): the NPC `wenna` is hidden with
// `npcs.setHidden` while it runs. A placeholder body until the NPC model loads; no physics, no interactables. Never imported by tests
// that run headless without three (they pass a fake `GuideFigure`).
import * as THREE from 'three';
import type { GameContext } from '../../../../../core/Game';
import { buildPlaceholder, disposePlaceholder, pickIdleClip, prepareNpcModel } from '../../../../../npcs/npcModels';
import type { NpcDef, NpcModelLoader } from '../../../../../npcs/types';
import { OLDSMOKE_NPC_DEFS } from '../../../../../oldsmoke/npcDefs';
import type { P3 } from './m19Route';

export type FigureMode = 'walk' | 'stand' | 'crouch';

export interface GuideFigure {
  place(at: P3, yaw: number, mode: FigureMode): void;
  show(on: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

const CROUCH_Y = 0.7;
const FADE = 0.2;

export class WennaFigure implements GuideFigure {
  private readonly root = new THREE.Group();
  private body: THREE.Object3D;
  private placeholder = true;
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private disposed = false;

  constructor(private readonly def: NpcDef) {
    this.root.name = 'm19:wenna-figure';
    this.root.visible = false;
    this.body = buildPlaceholder(def);
    this.root.add(this.body);
  }

  attach(scene: THREE.Object3D): void {
    scene.add(this.root);
  }

  /** Never rejects; a failure keeps the placeholder. */
  async load(loader: NpcModelLoader | null, warn: (m: string) => void = console.warn): Promise<void> {
    if (!loader) return;
    try {
      await loader.load(this.def.model);
      if (this.disposed) return;
      const { model, clips } = prepareNpcModel(loader, this.def);
      this.root.remove(this.body);
      if (this.placeholder) disposePlaceholder(this.body);
      this.body = model;
      this.placeholder = false;
      this.root.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      const idle = pickIdleClip(clips, this.def.idleClip);
      const walk = clips.find((c) => /walk/i.test(c.name));
      if (idle) this.actions.set('stand', this.mixer.clipAction(idle));
      if (walk) this.actions.set('walk', this.mixer.clipAction(walk));
      this.play('stand');
    } catch (err) {
      warn(`m19 guide: the figure model failed, keeping the placeholder: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  place(at: P3, yaw: number, mode: FigureMode): void {
    this.root.position.set(at.x, at.y, at.z);
    this.root.rotation.y = yaw;
    this.root.scale.y = mode === 'crouch' ? CROUCH_Y : 1;
    this.play(mode === 'walk' ? 'walk' : 'stand');
  }

  show(on: boolean): void {
    this.root.visible = on;
  }

  update(dt: number): void {
    if (dt > 0) this.mixer?.update(dt);
  }

  private play(name: string): void {
    const next = this.actions.get(name) ?? this.actions.get('stand');
    if (!next || next === this.current) return;
    next.reset().play();
    if (this.current) next.crossFadeFrom(this.current, FADE, false);
    this.current = next;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer?.stopAllAction();
    if (this.placeholder) disposePlaceholder(this.body);
    this.root.removeFromParent();
  }
}

/** The figure the director builds by default: Wenna's own def, in the scene, with the NPC model loader when the assets offer one. */
export function createWennaFigure(ctx: GameContext, warn: (m: string) => void): GuideFigure {
  const def = OLDSMOKE_NPC_DEFS.find((d) => d.id === 'wenna');
  if (!def) throw new Error('m19 guide: no npc def for wenna');
  const figure = new WennaFigure(def);
  figure.attach(ctx.scene);
  const a = ctx.assets as unknown as Partial<NpcModelLoader> | null;
  const loader = a && typeof a.load === 'function' && typeof a.instantiate === 'function' && typeof a.animations === 'function' ? (a as NpcModelLoader) : null;
  void figure.load(loader, warn);
  return figure;
}
