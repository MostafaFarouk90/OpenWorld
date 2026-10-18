import type { Persistable } from '../core/Persist';
import type { Vec3 } from '../physics/PhysicsWorld';
import type { DoorDef } from './types';

export type InteriorRefusal =
  | 'unknown'
  | 'locked'
  | 'busy'
  | 'inside'
  | 'not-inside'
  | 'dead'
  | 'dialogue'
  | 'cutscene'
  | 'aggro'
  | 'travelling'
  | 'not-ready'
  | 'aborted';

/** The rejection value of `enter` and `exit`. */
export class InteriorError extends Error {
  constructor(readonly reason: InteriorRefusal) {
    super(`interior: ${reason}`);
    this.name = 'InteriorError';
  }
}

export const TRANSITION = {
  fadeOutSeconds: 0.3,
  fadeInSeconds: 0.4,
  settleTimeoutSeconds: 2,
  groundRay: 0.5,
  /** Ticks the feet must stay outside `current`'s bounds before the bounds rule takes the player out. */
  outsideTicks: 2,
  /** In front of the outside anchor, along its yaw, where an exit puts the player. */
  arrivalOffset: 1.6,
  /** An exit counts as taken over by someone else's teleport beyond this distance from the arrival point. */
  exitDriftMetres: 15,
  /** A load that never reaches `save.loaded` stops holding the bounds rule after this long. */
  loadingTimeoutSeconds: 10,
} as const;

/** What the controller knows of an interior. */
export interface InteriorSpec {
  id: string;
  doors: readonly DoorDef[];
  contains(at: Vec3): boolean;
}

/** The engine as the controller sees it (adapted from the real context in interiors.plugin.ts, faked in tests). */
export interface InteriorPorts {
  feet(): Vec3;
  yaw(): number;
  dead(): boolean;
  /** Top input context: 'gameplay', 'menu', 'dialogue' or 'cutscene'. */
  topContext(): string;
  hostileAggro(): boolean;
  travelling(): boolean;
  anchor(id: string): { position: Vec3; yaw: number } | undefined;
  freeze(): () => void;
  fade(opacity: number, seconds: number): void;
  teleport(feet: Vec3, yaw: number): { ready(): boolean };
  groundBelow(maxDistance: number): boolean;
  /** True when `at` stands on that interior's floor: near a walkable nav cell, at floor height (a load checks a saved spot). */
  onFloor(interiorId: string, at: Vec3): boolean;
  /** Metres from the terrain up to `at` (a load left in the sky is not a waystone fallback on the ground). */
  aboveTerrain(at: Vec3): number;
  /** Shows that interior (and its look) and hides every other, or restores the outdoors for null. */
  applyEnvironment(interiorId: string | null): void;
  emit(type: 'interior.entered' | 'interior.exited', payload: { interiorId: string; doorId: string }): void;
  warn(message: string): void;
}

interface Transition {
  kind: 'enter' | 'exit';
  interiorId: string;
  doorId: string;
  phase: 'fading-out' | 'settling' | 'revealing';
  time: number;
  ticksSincePlace: number;
  target: { feet: Vec3; yaw: number };
  from: { feet: Vec3; yaw: number; current: string | null; door: string | null };
  handle: { ready(): boolean } | null;
  release: () => void;
  resolve: () => void;
  reject: (e: InteriorError) => void;
}

const FORWARD = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

/** A load left the player off the saved interior's floor (its layout changed since the save): moved to the entry at black. */
interface Rescue {
  handle: { ready(): boolean };
  time: number;
  release: () => void;
}

/** A saved spot this far over the terrain is in the interiors' sky, not a ground fallback. */
const SKY_METRES = 100;

/**
 * The interior lifecycle (contracts/interiors-and-nav.md section 1): enter and exit transitions, the bounds rule, the
 * `interior` persistable and the event rule (entered and exited strictly alternate per interior id). Driven by `tick`.
 */
export class InteriorController {
  private readonly specs = new Map<string, InteriorSpec>();
  private readonly locks = new Map<string, Set<() => boolean>>();
  /** Interiors whose `interior.entered` went out with no `interior.exited` yet, and the door named in it. */
  private readonly announced = new Map<string, string>();
  private _current: string | null = null;
  private door: string | null = null;
  private applied: string | null = null;
  private transition: Transition | null = null;
  private rescue: Rescue | null = null;
  private outside = 0;
  private loading = false;
  private loadingTime = 0;

  constructor(private readonly ports: InteriorPorts) {}

  add(spec: InteriorSpec): () => void {
    if (this.specs.has(spec.id)) throw new Error(`Interiors: duplicate interior "${spec.id}"`);
    if (spec.doors.length === 0) throw new Error(`Interiors: "${spec.id}" has no door`);
    this.specs.set(spec.id, spec);
    return () => {
      if (this.specs.get(spec.id) === spec) this.specs.delete(spec.id);
    };
  }

  get current(): string | null {
    return this._current;
  }

  get transitioning(): boolean {
    return this.transition !== null || this.rescue !== null;
  }

  /** The door the player used to enter `current` (or its first door after a load or the bounds rule). */
  get currentDoor(): string | null {
    return this.door;
  }

  interiorAt(at: Vec3): string | null {
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y) || !Number.isFinite(at.z)) return null;
    for (const s of this.specs.values()) if (s.contains(at)) return s.id;
    return null;
  }

  setDoorLock(doorId: string, locked: () => boolean): () => void {
    let set = this.locks.get(doorId);
    if (!set) this.locks.set(doorId, (set = new Set()));
    const entry = () => locked();
    set.add(entry);
    return () => {
      set.delete(entry);
    };
  }

  isDoorLocked(doorId: string): boolean {
    for (const p of this.locks.get(doorId) ?? []) {
      try {
        if (p()) return true;
      } catch (err) {
        this.ports.warn(`Interiors: lock predicate for "${doorId}" threw (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    return false;
  }

  /** Where an exit through `door` puts the player: in front of the outside anchor, facing out. */
  arrival(door: DoorDef): { feet: Vec3; yaw: number } | null {
    const a = this.ports.anchor(door.outside);
    if (!a) return null;
    const f = FORWARD(a.yaw);
    const off = TRANSITION.arrivalOffset;
    return { feet: { x: a.position.x + f.x * off, y: a.position.y + 0.05, z: a.position.z + f.z * off }, yaw: a.yaw };
  }

  enter(interiorId: string, doorId: string): Promise<void> {
    const spec = this.specs.get(interiorId);
    const door = spec?.doors.find((d) => d.doorId === doorId);
    const inside = door && this.ports.anchor(door.inside);
    if (!spec || !door || !inside) return this.refuse('unknown');
    if (this.transitioning) return this.refuse('busy');
    if (this._current !== null) return this.refuse('inside');
    const common = this.commonRefusal();
    if (common) return this.refuse(common);
    if (this.ports.hostileAggro()) return this.refuse('aggro');
    if (this.isDoorLocked(doorId)) return this.refuse('locked');
    return this.begin('enter', interiorId, doorId, { feet: { ...inside.position }, yaw: inside.yaw });
  }

  exit(doorId?: string): Promise<void> {
    if (this.transitioning) return this.refuse('busy');
    const id = this._current;
    if (id === null) return this.refuse('not-inside');
    const spec = this.specs.get(id);
    const name = doorId ?? this.door ?? spec?.doors[0].doorId;
    const door = spec?.doors.find((d) => d.doorId === name);
    const target = door && this.arrival(door);
    if (!door || !target) return this.refuse('unknown');
    const common = this.commonRefusal();
    if (common) return this.refuse(common);
    return this.begin('exit', id, door.doorId, target);
  }

  /** One fixed tick. */
  tick(dt: number): void {
    const t = this.transition;
    if (t) this.step(t, dt);
    else if (this.rescue) this.stepRescue(this.rescue, dt);
    else this.reconcile(dt);
  }

  /** Call on `save.loaded`, after every persistable has loaded and the player has been placed. */
  onSaveLoaded(): void {
    this.loading = false;
    const saved = this._current;
    const feet = this.ports.feet();
    if (saved !== null && !this.ports.onFloor(saved, feet) && (this.interiorAt(feet) === saved || this.ports.aboveTerrain(feet) > SKY_METRES)) {
      // The saved spot is no longer floor (the layout changed, or nothing is under it): move to the entry at black.
      this.startRescue(saved);
    } else if (saved !== null && this.interiorAt(feet) !== saved) {
      // The loader put the feet elsewhere (an invalid saved position falls back to a waystone, or an autosave caught an enter
      // mid-way): trust the feet, and announce nothing for an interior the player is not in.
      this._current = null;
      this.door = null;
      this.outside = 0;
      this.setApplied(null);
    }
    this.flushStale();
    // A load keeps the saved door (back-door entrants leave by it); only the bounds rule and a rescue use the first door.
    if (this._current) this.announceEntered(this._current, this.door ?? this.firstDoor(this._current));
  }

  persistable(): Persistable {
    return {
      key: 'interior',
      version: 1,
      serialize: () => ({ interiorId: this._current, doorId: this._current ? this.door : null }),
      load: (data) => this.load(data),
    };
  }

  dispose(): void {
    if (this.rescue) {
      this.rescue.release();
      this.rescue = null;
      this.ports.fade(0, TRANSITION.fadeInSeconds);
    }
    if (this.transition) {
      this.abort(this.transition, 'aborted');
      this.ports.fade(0, TRANSITION.fadeInSeconds);
    }
    if (this.applied !== null) this.ports.applyEnvironment(null);
    this.applied = null;
  }

  // ---------------------------------------------------------------- transitions

  private commonRefusal(): InteriorRefusal | null {
    if (this.ports.dead()) return 'dead';
    const top = this.ports.topContext();
    if (top === 'dialogue' || top === 'cutscene') return top;
    if (this.ports.travelling()) return 'travelling';
    return null;
  }

  private refuse(reason: InteriorRefusal): Promise<void> {
    return Promise.reject(new InteriorError(reason));
  }

  private begin(kind: Transition['kind'], interiorId: string, doorId: string, target: Transition['target']): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const release = this.ports.freeze();
      this.transition = {
        kind,
        interiorId,
        doorId,
        phase: 'fading-out',
        time: 0,
        ticksSincePlace: 0,
        target,
        from: { feet: { ...this.ports.feet() }, yaw: this.ports.yaw(), current: this._current, door: this.door },
        handle: null,
        release,
        resolve,
        reject,
      };
      this.ports.fade(1, TRANSITION.fadeOutSeconds);
    });
  }

  private step(t: Transition, dt: number): void {
    if (this.ports.dead()) return this.abort(t, 'aborted');
    if (t.phase !== 'fading-out' && t.ticksSincePlace >= 1 && this.drifted(t)) return this.abort(t, 'aborted', true);
    t.time += dt;
    switch (t.phase) {
      case 'fading-out':
        if (t.time >= TRANSITION.fadeOutSeconds) this.place(t);
        break;
      case 'settling':
        t.ticksSincePlace++;
        if (t.ticksSincePlace >= 1 && t.handle?.ready() && this.ports.groundBelow(TRANSITION.groundRay)) {
          t.phase = 'revealing';
          t.time = 0;
          this.ports.fade(0, TRANSITION.fadeInSeconds);
        } else if (t.time >= TRANSITION.settleTimeoutSeconds) {
          this.rollback(t);
        }
        break;
      case 'revealing':
        t.ticksSincePlace++;
        if (t.time >= TRANSITION.fadeInSeconds) this.finish(t);
        break;
    }
  }

  /** At black, in one tick: the look, the state and the teleport change together. */
  private place(t: Transition): void {
    if (t.kind === 'enter') {
      this.setApplied(t.interiorId);
      this._current = t.interiorId;
      this.door = t.doorId;
    } else {
      this.setApplied(null);
      this._current = null;
      this.door = null;
    }
    this.outside = 0;
    t.handle = this.ports.teleport(t.target.feet, t.target.yaw);
    t.phase = 'settling';
    t.time = 0;
    t.ticksSincePlace = 0;
  }

  /** True when someone else moved the player away after placement (a death respawn, travel). */
  private drifted(t: Transition): boolean {
    const f = this.ports.feet();
    if (t.kind === 'enter') return !this.specs.get(t.interiorId)?.contains(f);
    return this.interiorAt(f) !== null || Math.hypot(f.x - t.target.feet.x, f.z - t.target.feet.z) > TRANSITION.exitDriftMetres;
  }

  private finish(t: Transition): void {
    this.transition = null;
    t.release();
    if (t.kind === 'enter') this.announceEntered(t.interiorId, t.doorId);
    else this.announceExited(t.interiorId, t.doorId);
    t.resolve();
  }

  private rollback(t: Transition): void {
    this.ports.warn(`Interiors: ${t.kind} "${t.interiorId}" found no ground in ${TRANSITION.settleTimeoutSeconds} s; rolled back`);
    this._current = t.from.current;
    this.door = t.from.door;
    this.setApplied(t.from.current);
    this.ports.teleport(t.from.feet, t.from.yaw);
    this.ports.fade(0, TRANSITION.fadeInSeconds);
    this.transition = null;
    t.release();
    t.reject(new InteriorError('not-ready'));
  }

  /**
   * Drops the transition where it stands; the bounds rule then puts the state right. A death or waystone travel brings its own
   * fade in; any other teleport (a script, a debug key) does not, so the screen is lifted here.
   */
  private abort(t: Transition, reason: InteriorRefusal, lift = false): void {
    this.transition = null;
    this.outside = 0;
    t.release();
    this.flushStale();
    if (lift && !this.ports.dead() && !this.ports.travelling()) {
      // Settle the state and the look for where the feet are now, while the screen is still black.
      this.followFeet();
      this.ports.fade(0, TRANSITION.fadeInSeconds);
    }
    t.reject(new InteriorError(reason));
  }

  /** The bounds rule applied at once, without waiting for ticks outside. */
  private followFeet(): void {
    const at = this.interiorAt(this.ports.feet());
    if (this._current !== null && at !== this._current) {
      const id = this._current;
      const door = this.door ?? this.firstDoor(id);
      this._current = null;
      this.door = null;
      this.announceExited(id, door);
    }
    if (this._current === null && at !== null) {
      this._current = at;
      this.door = this.firstDoor(at);
      this.setApplied(at);
      this.announceEntered(at, this.door);
    }
    this.setApplied(this._current);
  }

  /** Closes the event pair for every announced interior the player is no longer in. */
  private flushStale(): void {
    for (const [id, door] of [...this.announced]) if (id !== this._current) this.announceExited(id, door);
  }

  // ---------------------------------------------------------------- the stale-load rescue

  private startRescue(id: string): void {
    const door = this.specs.get(id)!.doors[0];
    const inside = this.ports.anchor(door.inside);
    if (!inside) {
      this.ports.warn(`Interiors: no inside anchor "${door.inside}" to move a stale load to; loading outdoors`);
      this._current = null;
      this.door = null;
      this.setApplied(null);
      return;
    }
    this.ports.warn(`Interiors: the saved spot in "${id}" is not on its floor (layout changed?); moving to "${door.inside}"`);
    // Black at once: the save loader's own fade has already lifted, and its teleport may still be holding the player.
    this.ports.fade(1, 0);
    this._current = id;
    this.door = door.doorId;
    this.outside = 0;
    this.setApplied(id);
    const release = this.ports.freeze();
    this.rescue = { handle: this.ports.teleport({ ...inside.position }, inside.yaw), time: 0, release };
  }

  private stepRescue(r: Rescue, dt: number): void {
    r.time += dt;
    // A tick has run since the teleport (the rescue starts in save.loaded, between ticks).
    const settled = r.handle.ready() && this.ports.groundBelow(TRANSITION.groundRay);
    if (!settled && r.time < TRANSITION.settleTimeoutSeconds) return;
    if (!settled) this.ports.warn('Interiors: the stale-load rescue found no ground in time; lifting the fade anyway');
    this.rescue = null;
    r.release();
    this.ports.fade(0, TRANSITION.fadeInSeconds);
  }

  // ---------------------------------------------------------------- bounds rule, saves, events

  private reconcile(dt: number): void {
    const feet = this.ports.feet();
    const at = this.interiorAt(feet);
    if (this.loading) {
      this.loadingTime += dt;
      if (this.loadingTime >= TRANSITION.loadingTimeoutSeconds) this.loading = false;
      // While a load places the player, only follow the feet: the events wait for save.loaded.
      if (this._current !== null && at === this._current) this.setApplied(this._current);
      else if (this.applied !== null && at !== this.applied) this.setApplied(null);
      return;
    }
    if (this._current !== null) {
      if (at === this._current) {
        this.outside = 0;
        this.setApplied(this._current);
        return;
      }
      if (++this.outside < TRANSITION.outsideTicks) return;
      const id = this._current;
      const door = this.door ?? this.firstDoor(id);
      this._current = null;
      this.door = null;
      this.outside = 0;
      this.setApplied(null);
      this.announceExited(id, door);
      return;
    }
    this.flushStale();
    if (at !== null) {
      this._current = at;
      this.door = this.firstDoor(at);
      this.setApplied(at);
      this.announceEntered(at, this.door);
      return;
    }
    if (this.applied !== null) this.setApplied(null);
  }

  private load(data: unknown): void {
    if (this.transition) this.abort(this.transition, 'aborted');
    this.rescue?.release();
    this.rescue = null;
    let id: string | null = null;
    let door: string | null = null;
    if (data && typeof data === 'object') {
      const d = data as { interiorId?: unknown; doorId?: unknown };
      if (typeof d.interiorId === 'string') {
        const spec = this.specs.get(d.interiorId);
        if (spec) {
          id = spec.id;
          door = typeof d.doorId === 'string' && spec.doors.some((x) => x.doorId === d.doorId) ? d.doorId : spec.doors[0].doorId;
        } else {
          this.ports.warn(`Interiors: saved interior "${d.interiorId}" is unknown; loading outdoors`);
        }
      } else if (d.interiorId !== null && d.interiorId !== undefined) {
        this.ports.warn('Interiors: saved interior has a bad shape; loading outdoors');
      }
    } else if (data !== null) {
      this.ports.warn('Interiors: saved interior has a bad shape; loading outdoors');
    }
    this._current = id;
    this.door = door;
    this.outside = 0;
    this.loading = true;
    this.loadingTime = 0;
  }

  private setApplied(id: string | null): void {
    if (this.applied === id) return;
    this.applied = id;
    this.ports.applyEnvironment(id);
  }

  private firstDoor(id: string): string {
    return this.specs.get(id)?.doors[0].doorId ?? '';
  }

  private announceEntered(id: string, doorId: string): void {
    if (this.announced.has(id)) return;
    this.announced.set(id, doorId);
    this.ports.emit('interior.entered', { interiorId: id, doorId });
  }

  private announceExited(id: string, doorId: string): void {
    if (!this.announced.has(id)) return;
    this.announced.delete(id);
    this.ports.emit('interior.exited', { interiorId: id, doorId });
  }
}
