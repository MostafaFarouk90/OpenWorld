import * as THREE from 'three';
import type { ActorLike, CoreContext, Vec3 } from '../region/coreTypes';
import type { NpcSpec } from '../region/layoutTypes';
import { createNpcState, stepNpc, type NpcState } from './NpcBehavior';
import { buildPlaceholder, disposePlaceholder, pickIdleClip, prepareNpcModel } from './npcModels';
import { NPC_TUNING } from './tuning';
import type { NpcDef, NpcHandle, NpcModelId, NpcModelLoader, NpcsService } from './types';

export type NpcManagerCore = Pick<
  CoreContext,
  'scene' | 'actors' | 'interaction' | 'anchors' | 'events' | 'services' | 'strings'
>;

export interface NpcManagerOptions {
  layoutNpcs: NpcSpec[];
  defs: NpcDef[];
  loader?: NpcModelLoader;
  playerPosition(): { x: number; z: number } | null;
  warn?: (message: string) => void;
}

interface Entry {
  spec: NpcSpec;
  def: NpcDef;
  root: THREE.Group;
  figure: THREE.Object3D;
  isPlaceholder: boolean;
  pos: Vec3;
  state: NpcState;
  actor: ActorLike;
  unregister: () => void;
  mixer: THREE.AnimationMixer | null;
}

interface DialoguePayload {
  dialogueId?: string;
  npcId?: string;
}

export class NpcManager implements NpcsService {
  private readonly entries = new Map<string, Entry>();
  private readonly talking = new Set<string>();
  private unsubs: Array<() => void> = [];
  private readonly warn: (m: string) => void;
  private warnedNoDialogue = false;
  private spawned = false;
  private disposed = false;

  constructor(
    private readonly core: NpcManagerCore,
    private readonly opts: NpcManagerOptions,
  ) {
    this.warn = opts.warn ?? ((m) => console.warn(m));
  }

  /** Synchronous. Validates everything first, so a failure leaves nothing behind. */
  spawnAll(): void {
    if (this.disposed) throw new Error('NpcManager: spawnAll after dispose');
    if (this.spawned) throw new Error('NpcManager: spawnAll called twice (npcs already spawned)');
    const { layoutNpcs, defs } = this.opts;
    const defById = new Map<string, NpcDef>();
    for (const d of defs) {
      if (defById.has(d.id)) throw new Error(`NpcManager: duplicate def for npc "${d.id}"`);
      defById.set(d.id, d);
    }
    const seen = new Set<string>();
    for (const spec of layoutNpcs) {
      if (seen.has(spec.id)) throw new Error(`NpcManager: npc "${spec.id}" appears twice in the layout`);
      seen.add(spec.id);
      if (!defById.has(spec.id)) throw new Error(`NpcManager: layout npc "${spec.id}" has no NpcDef`);
      if (!this.core.anchors.find(spec.post)) {
        throw new Error(`NpcManager: npc "${spec.id}" post anchor "${spec.post}" does not exist`);
      }
    }
    for (const d of defs) {
      if (!seen.has(d.id)) throw new Error(`NpcManager: NpcDef "${d.id}" has no entry in the layout`);
    }

    this.spawned = true;
    for (const spec of layoutNpcs) this.spawnOne(spec, defById.get(spec.id)!);

    const on = (type: string, fn: (p: DialoguePayload) => void) => this.unsubs.push(this.core.events.on(type, fn));
    on('dialogue.started', (p) => {
      if (p?.npcId && this.entries.has(p.npcId)) this.talking.add(p.npcId);
    });
    on('dialogue.ended', (p) => {
      if (p?.npcId) this.talking.delete(p.npcId);
    });
  }

  private spawnOne(spec: NpcSpec, def: NpcDef): void {
    const anchor = this.core.anchors.get(spec.post);
    const root = new THREE.Group();
    root.name = `npc:${def.id}`;
    root.position.set(anchor.position.x, anchor.position.y, anchor.position.z);
    root.rotation.y = anchor.yaw;
    const figure = buildPlaceholder(def);
    root.add(figure);
    this.core.scene.add(root);

    const actor = this.core.actors.spawn({
      kind: `npc:${def.id}`,
      team: 'neutral',
      maxHealth: 1,
      immortal: true,
      hittable: false,
      root,
    });
    const pos: Vec3 = { x: anchor.position.x, y: anchor.position.y, z: anchor.position.z };
    const unregister = this.core.interaction.register({
      id: `npc:${def.id}`,
      kind: 'talk',
      name: this.core.strings.t(def.nameKey),
      radius: NPC_TUNING.talkRadius,
      position: (out) => out.set(pos.x, pos.y, pos.z),
      onInteract: () => this.talkTo(def),
    });
    this.entries.set(def.id, {
      spec,
      def,
      root,
      figure,
      isPlaceholder: true,
      pos,
      state: createNpcState({ x: pos.x, z: pos.z, yaw: anchor.yaw }),
      actor,
      unregister,
      mixer: null,
    });
  }

  private talkTo(def: NpcDef): void {
    const d = this.core.services.get('dialogue') as { start(dialogueId: string, npcId: string): void } | undefined;
    if (!d) {
      if (!this.warnedNoDialogue) {
        this.warnedNoDialogue = true;
        this.warn('NpcManager: no "dialogue" service; talking to NPCs does nothing yet');
      }
      this.core.events.emit('npc.talk-unavailable', { npcId: def.id });
      return;
    }
    try {
      d.start(def.dialogueId, def.id);
    } catch (err) {
      this.warn(`NpcManager: dialogue.start("${def.dialogueId}", "${def.id}") threw: ${String(err)}`);
    }
  }

  /** Never rejects. Each distinct GLB is loaded once; a failure keeps the placeholders. */
  async loadModels(): Promise<void> {
    const loader = this.opts.loader;
    if (!loader) return;
    const byModel = new Map<NpcModelId, Entry[]>();
    for (const e of this.entries.values()) {
      const list = byModel.get(e.def.model) ?? [];
      list.push(e);
      byModel.set(e.def.model, list);
    }
    await Promise.all(
      [...byModel].map(async ([model, list]) => {
        try {
          await loader.load(model);
        } catch (err) {
          this.warn(`NpcManager: model "${model}" failed to load, keeping placeholders: ${errMsg(err)}`);
          return;
        }
        for (const e of list) {
          if (this.disposed) return;
          try {
            const { model: obj, clips } = prepareNpcModel(loader, e.def);
            if (this.disposed) {
              disposeModel(obj);
              return;
            }
            this.swap(e, obj, clips);
          } catch (err) {
            this.warn(`NpcManager: could not build model for npc "${e.def.id}": ${errMsg(err)}`);
          }
        }
      }),
    );
  }

  private swap(e: Entry, model: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    e.root.remove(e.figure);
    if (e.isPlaceholder) disposePlaceholder(e.figure);
    else disposeModel(e.figure);
    e.mixer?.stopAllAction();
    e.figure = model;
    e.isPlaceholder = false;
    e.root.add(model);
    const clip = pickIdleClip(clips, e.def.idleClip);
    if (clip) {
      const mixer = new THREE.AnimationMixer(model);
      const action = mixer.clipAction(clip);
      action.play();
      // Desynchronise neighbours that share a clip.
      action.time = (hash(e.def.id) % 1000) / 1000 * clip.duration;
      e.mixer = mixer;
    } else {
      e.mixer = null;
    }
  }

  fixedUpdateBehaviour(dt: number): void {
    const player = this.opts.playerPosition();
    for (const [id, e] of this.entries) {
      const { yaw } = stepNpc(e.state, dt, { player, talkingTo: this.talking.has(id) });
      e.root.rotation.y = yaw;
    }
  }

  fixedUpdateAnimation(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const player = this.opts.playerPosition();
    for (const e of this.entries.values()) {
      if (!e.mixer) continue;
      if (player && Math.hypot(player.x - e.pos.x, player.z - e.pos.z) > NPC_TUNING.animationCullDistance) continue;
      e.mixer.update(dt);
    }
  }

  place(id: string, anchorId: string): boolean {
    const e = this.entries.get(id);
    const anchor = this.core.anchors.find(anchorId);
    if (!e || !anchor) return false;
    e.pos.x = anchor.position.x;
    e.pos.y = anchor.position.y;
    e.pos.z = anchor.position.z;
    e.root.position.set(e.pos.x, e.pos.y, e.pos.z);
    e.state = createNpcState({ x: e.pos.x, z: e.pos.z, yaw: anchor.yaw });
    e.root.rotation.y = e.state.yaw;
    return true;
  }

  get(id: string): NpcHandle | undefined {
    const e = this.entries.get(id);
    if (!e) return undefined;
    return {
      id,
      def: e.def,
      root: e.root,
      actor: e.actor,
      get yaw() {
        return e.state.yaw;
      },
      get hasModel() {
        return !e.isPlaceholder;
      },
    };
  }

  position(id: string): Vec3 | undefined {
    const e = this.entries.get(id);
    return e ? { ...e.pos } : undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.talking.clear();
    for (const e of this.entries.values()) {
      e.unregister();
      this.core.actors.despawn(e.actor.id);
      e.mixer?.stopAllAction();
      e.mixer = null;
      e.root.remove(e.figure);
      this.core.scene.remove(e.root);
      if (e.isPlaceholder) disposePlaceholder(e.figure);
      else disposeModel(e.figure);
    }
    this.entries.clear();
  }
}

/** Disposes only what the NPC owns: its cloned materials. Geometry and textures are shared with the cache. */
function disposeModel(model: THREE.Object3D): void {
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
  });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
