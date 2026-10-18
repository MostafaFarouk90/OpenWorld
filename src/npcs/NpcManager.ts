import * as THREE from 'three';
import type { ActorLike, CoreContext, Vec3 } from '../region/coreTypes';
import type { NpcSpec } from '../region/layoutTypes';
import { createNpcState, stepNpc, wrapAngle, type NpcState } from './NpcBehavior';
import { buildPlaceholder, disposePlaceholder, pickIdleClip, prepareNpcModel } from './npcModels';
import { NPC_TUNING } from './tuning';
import type { NpcDef, NpcHandle, NpcModelId, NpcModelLoader, NpcsService } from './types';

export type NpcManagerCore = Pick<
  CoreContext,
  'scene' | 'actors' | 'interaction' | 'anchors' | 'events' | 'services' | 'strings' | 'gates'
>;

export interface NpcManagerOptions {
  layoutNpcs: NpcSpec[];
  defs: NpcDef[];
  loader?: NpcModelLoader;
  playerPosition(): { x: number; z: number } | null;
  warn?: (message: string) => void;
  /** Terrain height; a walking NPC follows the ground instead of lerping between two anchor heights. */
  heightAt?: (x: number, z: number) => number;
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
  /** Props that belong to the NPC rather than its figure (Tobb's cloak and lute); they survive the GLB swap. */
  extras: THREE.Object3D | null;
  /** A scripted straight-line walk (the carters leaving the ford); null when standing. */
  walk: { from: Vec3; to: Vec3; toYaw: number; length: number; done: number } | null;
}

export class NpcManager implements NpcsService {
  private readonly entries = new Map<string, Entry>();
  /** Where an NPC stood when it was despawned for a handover (`npcs.position` keeps answering for it). */
  private readonly lastPos = new Map<string, Vec3>();
  private readonly specs = new Map<string, NpcSpec>();
  private gateOffs: Array<() => void> = [];
  /** Models whose GLB has loaded: an NPC that spawns later (a handover undone by a load) takes its model at once. */
  private readonly loadedModels = new Set<NpcModelId>();
  private readonly talking = new Set<string>();
  private readonly loading = new Map<NpcModelId, Promise<void>>();
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
    for (const spec of layoutNpcs) this.specs.set(spec.id, spec);
    for (const spec of layoutNpcs) {
      const def = defById.get(spec.id)!;
      if (spec.absentWhen) {
        // Present until the flag turns true (read through ctx.gates, so a loaded save is honoured); never spawned on a load with it set.
        this.gateOffs.push(
          this.core.gates.flag(spec.absentWhen, (absent) => {
            if (this.disposed) return;
            if (absent) this.despawnOne(spec.id);
            else if (!this.entries.has(spec.id)) this.spawnOne(spec, def);
          }),
        );
      } else {
        this.spawnOne(spec, def);
      }
      if (spec.walkOff) this.gateWalkOff(spec, spec.walkOff);
    }

    this.unsubs.push(
      this.core.events.on('dialogue.started', (p) => {
        if (p?.npcId && this.entries.has(p.npcId)) this.talking.add(p.npcId);
      }),
      this.core.events.on('dialogue.ended', (p) => {
        if (p?.npcId) this.talking.delete(p.npcId);
      }),
    );
  }

  private spawnOne(spec: NpcSpec, def: NpcDef): void {
    const anchor = this.core.anchors.get(spec.post);
    const root = new THREE.Group();
    root.name = `npc:${def.id}`;
    root.position.set(anchor.position.x, anchor.position.y, anchor.position.z);
    root.rotation.y = anchor.yaw;
    const figure = buildPlaceholder(def);
    root.add(figure);
    const extras = def.extras ? def.extras() : null;
    if (extras) root.add(extras);
    this.core.scene.add(root);

    // Anything below can throw (a duplicate interactable id); undo what was done so nothing leaks.
    let actor: ActorLike | null = null;
    try {
      actor = this.core.actors.spawn({
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
        extras,
        walk: null,
      });
      this.lastPos.delete(def.id);
      const entry = this.entries.get(def.id)!;
      const loader = this.opts.loader;
      if (loader && this.loadedModels.has(def.model)) {
        try {
          const { model, clips } = prepareNpcModel(loader, def);
          this.swap(entry, model, clips);
        } catch (err) {
          this.warn(`NpcManager: could not build model for npc "${def.id}": ${errMsg(err)}`);
        }
      }
    } catch (err) {
      if (actor) this.core.actors.despawn(actor.id);
      if (extras) disposePlaceholder(extras);
      root.remove(figure);
      this.core.scene.remove(root);
      disposePlaceholder(figure);
      throw err;
    }
  }

  /** Removes a live NPC for a handover; its last position stays readable through `position()`. */
  private despawnOne(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.lastPos.set(id, { ...e.pos });
    this.talking.delete(id);
    this.entries.delete(id);
    e.unregister();
    this.core.actors.despawn(e.actor.id);
    e.mixer?.stopAllAction();
    e.root.remove(e.figure);
    if (e.extras) {
      e.root.remove(e.extras);
      disposePlaceholder(e.extras);
    }
    this.core.scene.remove(e.root);
    if (e.isPlaceholder) disposePlaceholder(e.figure);
    else disposeModel(e.figure);
  }

  private gateWalkOff(spec: NpcSpec, walkOff: NonNullable<NpcSpec['walkOff']>): void {
    this.gateOffs.push(
      this.core.gates.flag(walkOff.whenFlag, (open, cause) => {
        if (this.disposed) return;
        const e = this.entries.get(spec.id);
        if (!e) return;
        if (!open) {
          // Spawned at the post already; only a later load that clears the flag needs the move back.
          if (cause !== 'init') this.place(spec.id, spec.post);
        } else if (cause === 'flag') {
          this.startWalk(e, walkOff.to);
        } else {
          // init, load or recheck: the scene is already past the event, so stand at the end of the walk.
          this.place(spec.id, walkOff.to);
        }
      }),
    );
  }

  private startWalk(e: Entry, anchorId: string): void {
    const anchor = this.core.anchors.find(anchorId);
    if (!anchor) {
      this.warn(`NpcManager: walk-off anchor "${anchorId}" for npc "${e.def.id}" does not exist`);
      return;
    }
    const from = { ...e.pos };
    const to = { x: anchor.position.x, y: anchor.position.y, z: anchor.position.z };
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length < 1e-3) return;
    e.walk = { from, to, toYaw: anchor.yaw, length, done: 0 };
  }

  private talkTo(def: NpcDef): void {
    // Thread 3 provides 'dialogue'; until its type is merged the lookup goes through the untyped door.
    const d = (this.core.services as unknown as { get(name: string): unknown }).get('dialogue') as
      | { start(dialogueId: string, npcId: string): void }
      | undefined;
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

  /** Never rejects. Loads every NPC's GLB now (tests and screenshots); in play, proximity loads them. */
  async loadModels(): Promise<void> {
    await Promise.all([...new Set([...this.entries.values()].map((e) => e.def.model))].map((m) => this.loadGlb(m)));
  }

  /** One load per distinct GLB; a failure keeps the placeholders and is not retried. Never rejects. */
  private loadGlb(model: NpcModelId): Promise<void> {
    const loader = this.opts.loader;
    if (!loader) return Promise.resolve();
    let p = this.loading.get(model);
    if (p) return p;
    p = (async () => {
      try {
        await loader.load(model);
      } catch (err) {
        this.warn(`NpcManager: model "${model}" failed to load, keeping placeholders: ${errMsg(err)}`);
        return;
      }
      this.loadedModels.add(model);
      for (const e of this.entries.values()) {
        if (e.def.model !== model || !e.isPlaceholder) continue;
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
    })();
    this.loading.set(model, p);
    return p;
  }

  /** Starts the GLB of every NPC whose post is within the load radius of the player (download budget). */
  private loadNear(player: { x: number; z: number } | null): void {
    if (!this.opts.loader || !player) return;
    for (const e of this.entries.values()) {
      if (!e.isPlaceholder || this.loading.has(e.def.model)) continue;
      if (Math.hypot(player.x - e.pos.x, player.z - e.pos.z) <= NPC_TUNING.modelLoadRadius) void this.loadGlb(e.def.model);
    }
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
    this.loadNear(player);
    for (const [id, e] of this.entries) {
      if (e.walk && !this.talking.has(id)) this.stepWalk(e, dt);
      const { yaw } = e.walk ? { yaw: e.state.yaw } : stepNpc(e.state, dt, { player, talkingTo: this.talking.has(id) });
      e.root.rotation.y = yaw;
    }
  }

  private stepWalk(e: Entry, dt: number): void {
    const w = e.walk!;
    if (!Number.isFinite(dt) || dt <= 0) return;
    w.done = Math.min(w.length, w.done + NPC_TUNING.walkSpeed * Math.min(dt, NPC_TUNING.maxStepDt));
    const k = w.done / w.length;
    e.pos.x = w.from.x + (w.to.x - w.from.x) * k;
    e.pos.y = w.from.y + (w.to.y - w.from.y) * k;
    e.pos.z = w.from.z + (w.to.z - w.from.z) * k;
    if (this.opts.heightAt) e.pos.y = this.opts.heightAt(e.pos.x, e.pos.z);
    e.root.position.set(e.pos.x, e.pos.y, e.pos.z);
    e.state.x = e.pos.x;
    e.state.z = e.pos.z;
    e.state.yaw = Math.atan2(-(w.to.x - w.from.x), -(w.to.z - w.from.z));
    if (w.done >= w.length) {
      e.state.postYaw = wrapAngle(w.toYaw);
      e.walk = null;
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
    e.walk = null;
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
    if (e) return { ...e.pos };
    const last = this.lastPos.get(id);
    if (last) return { ...last };
    // Absent through its gate since the load (never spawned): it still answers with where its post is.
    const spec = this.specs.get(id);
    const post = spec?.absentWhen ? this.core.anchors.find(spec.post) : undefined;
    return post ? { x: post.position.x, y: post.position.y, z: post.position.z } : undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.gateOffs.forEach((o) => o());
    this.gateOffs = [];
    this.talking.clear();
    for (const e of this.entries.values()) {
      e.unregister();
      this.core.actors.despawn(e.actor.id);
      e.mixer?.stopAllAction();
      e.mixer = null;
      e.root.remove(e.figure);
      if (e.extras) disposePlaceholder(e.extras);
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
