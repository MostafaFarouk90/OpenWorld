import * as THREE from 'three';
import type { GameEvents } from '../core/events';
import { Actor, type ActorId, type ActorInit, type Team } from './Actor';
import { PLAYER_ID } from './teams';

const tmp = new THREE.Vector3();

/** Every live actor, by id and by owner object (contracts/actors-and-damage.md section 2). */
export class ActorRegistry {
  private readonly byId = new Map<ActorId, Actor>();
  private readonly owners = new Map<unknown, Actor>();
  private readonly ownersOf = new Map<Actor, Set<unknown>>();
  private readonly counters = new Map<string, number>();

  constructor(private readonly events: GameEvents) {}

  get size(): number {
    return this.byId.size;
  }

  /** The player actor; throws before the core plugin has spawned it. */
  get player(): Actor {
    const p = this.byId.get(PLAYER_ID);
    if (!p) throw new Error('ActorRegistry: the player actor does not exist yet');
    return p;
  }

  spawn(init: ActorInit): Actor {
    let id = init.id;
    if (id !== undefined) {
      if (this.byId.has(id)) throw new Error(`ActorRegistry: actor "${id}" already exists`);
    } else {
      do {
        const n = (this.counters.get(init.kind) ?? 0) + 1;
        this.counters.set(init.kind, n);
        id = `${init.kind}#${n}`;
      } while (this.byId.has(id));
    }
    if (init.owner !== undefined && init.owner !== null && this.owners.has(init.owner)) {
      throw new Error(`ActorRegistry: owner of "${id}" is already bound to "${this.owners.get(init.owner)!.id}"`);
    }
    const actor = new Actor(id, init);
    this.byId.set(id, actor);
    if (init.owner !== undefined && init.owner !== null) this.bindOwner(actor, init.owner);
    this.events.emit('actor.spawned', { actor });
    return actor;
  }

  /** Unknown ids are a no-op. Owners are unbound. */
  despawn(id: ActorId): void {
    const actor = this.byId.get(id);
    if (!actor) return;
    this.byId.delete(id);
    for (const o of this.ownersOf.get(actor) ?? []) this.owners.delete(o);
    this.ownersOf.delete(actor);
    this.events.emit('actor.despawned', { actorId: id });
  }

  /** Adds an owner object for HitEvent lookups; an owner bound to another actor throws. */
  bindOwner(actor: Actor, owner: unknown): () => void {
    if (owner === undefined || owner === null) throw new Error('ActorRegistry: owner must be an object');
    if (this.byId.get(actor.id) !== actor) throw new Error(`ActorRegistry: "${actor.id}" is not registered`);
    const current = this.owners.get(owner);
    if (current && current !== actor) {
      throw new Error(`ActorRegistry: owner is already bound to "${current.id}"`);
    }
    this.owners.set(owner, actor);
    let set = this.ownersOf.get(actor);
    if (!set) this.ownersOf.set(actor, (set = new Set()));
    set.add(owner);
    return () => {
      if (this.owners.get(owner) !== actor) return;
      this.owners.delete(owner);
      this.ownersOf.get(actor)?.delete(owner);
    };
  }

  get(id: ActorId): Actor | undefined {
    return this.byId.get(id);
  }

  byOwner(owner: unknown): Actor | undefined {
    return this.owners.get(owner);
  }

  all(): IterableIterator<Actor> {
    return this.byId.values();
  }

  ofTeam(team: Team): Actor[] {
    return [...this.byId.values()].filter((a) => a.team === team);
  }

  /** Nearest actor with a root; `alive` defaults to true. */
  nearest(
    position: THREE.Vector3Like,
    opts: { team?: Team; maxDistance?: number; alive?: boolean; exclude?: ActorId; targetable?: boolean } = {},
  ): Actor | undefined {
    const alive = opts.alive ?? true;
    let best: Actor | undefined;
    let bestD = opts.maxDistance ?? Infinity;
    for (const a of this.byId.values()) {
      if (!a.root || a.id === opts.exclude) continue;
      if (opts.team && a.team !== opts.team) continue;
      if (alive && a.dead) continue;
      if (opts.targetable && a.untargetable) continue;
      a.root.getWorldPosition(tmp);
      const d = Math.hypot(tmp.x - position.x, tmp.y - position.y, tmp.z - position.z);
      if (d <= bestD) {
        if (d === bestD && best && best.id < a.id) continue;
        best = a;
        bestD = d;
      }
    }
    return best;
  }
}
