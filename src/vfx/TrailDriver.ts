import * as THREE from 'three';
import { DEFAULT_TRAIL, TRAIL_LEAD, TRAIL_RAMPS } from './tuning';
import type { ActorId, AvatarLike, Vec3 } from './ports';
import type { TrailHandle } from './types';

export interface RibbonLike {
  push(hilt: Vec3, tip: Vec3, now: number): void;
  setEmitting(on: boolean): void;
  readonly emitting: boolean;
  dispose(): void;
  readonly alive: boolean;
}
export interface TrailManagerLike {
  create(id: string, opts: { colors: [number, number, number]; tail: number; width: number }): RibbonLike;
}
type Ramp = { colors: [number, number, number]; tail: number; width: number };

interface Binding {
  actorId: ActorId;
  hilt: THREE.Object3D;
  tip: THREE.Object3D;
  /** Trails by ramp key; a ribbon is released once it has been silent for its tail. */
  ribbons: Map<string, { ribbon: RibbonLike; lastEmit: number; tail: number }>;
  current: string | null;
  /** The player is driven by polling, enemies by attack.window events. */
  polled: boolean;
  colorOverride?: number;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function rampFor(attackId: string | undefined, colorOverride?: number): { key: string; ramp: Ramp } {
  const base = (attackId && TRAIL_RAMPS[attackId]) || DEFAULT_TRAIL;
  const key = attackId && TRAIL_RAMPS[attackId] ? attackId : 'default';
  if (colorOverride === undefined) return { key, ramp: base };
  return { key: `${key}:${colorOverride}`, ramp: { ...base, colors: [base.colors[0], colorOverride, base.colors[2]] } };
}

function attached(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) {
    if ((p as THREE.Scene).isScene) return true;
    p = p.parent;
  }
  return false;
}

/**
 * Samples weaponHilt and weaponTip into ribbons once per fixed tick (after the animation phase, so the
 * marker matrices are current). The player's ribbon starts 0.02 of the clip before activeStart by polling
 * `activeAttack()`, because `attack.window open` only fires at activeStart. Enemy ribbons follow the
 * window events. Markers that leave the scene mid-swing end the emission; the tail still fades.
 */
export class TrailDriver {
  private readonly bindings = new Map<ActorId, Binding>();

  constructor(
    private readonly manager: TrailManagerLike,
    private readonly requireInScene = true,
  ) {}

  /** The Knight: polled against `activeAttack()`. */
  attachPlayer(actorId: ActorId, avatar: AvatarLike): TrailHandle {
    return this.bind(actorId, avatar.weaponHilt, avatar.weaponTip, true, undefined, avatar);
  }

  /** Any other weapon (contract: thread 2 calls this once per enemy weapon). */
  attach(actorId: ActorId, hilt: THREE.Object3D, tip: THREE.Object3D, opts?: { color?: number }): TrailHandle {
    return this.bind(actorId, hilt, tip, false, opts?.color);
  }

  private avatars = new Map<ActorId, AvatarLike>();

  private bind(
    actorId: ActorId,
    hilt: THREE.Object3D,
    tip: THREE.Object3D,
    polled: boolean,
    colorOverride?: number,
    avatar?: AvatarLike,
  ): TrailHandle {
    this.detach(actorId);
    const b: Binding = { actorId, hilt, tip, ribbons: new Map(), current: null, polled, colorOverride };
    this.bindings.set(actorId, b);
    if (avatar) this.avatars.set(actorId, avatar);
    return {
      setEmitting: (on) => this.setEmitting(actorId, on),
      dispose: () => this.detach(actorId),
    };
  }

  detach(actorId: ActorId): void {
    const b = this.bindings.get(actorId);
    if (!b) return;
    for (const r of b.ribbons.values()) r.ribbon.dispose();
    this.bindings.delete(actorId);
    this.avatars.delete(actorId);
  }

  /** `attack.window` handler for non-polled bindings. */
  onWindow(e: { actorId: ActorId; attackId: string; phase: 'open' | 'close' }): void {
    const b = this.bindings.get(e.actorId);
    if (!b || b.polled) return;
    if (e.phase === 'open') this.start(b, e.attackId);
    else this.setEmitting(e.actorId, false);
  }

  setEmitting(actorId: ActorId, on: boolean, attackId?: string): void {
    const b = this.bindings.get(actorId);
    if (!b) return;
    if (on) this.start(b, attackId);
    else this.stop(b);
  }

  private start(b: Binding, attackId: string | undefined): void {
    const { key, ramp } = rampFor(attackId, b.colorOverride);
    if (b.current === key) {
      b.ribbons.get(key)?.ribbon.setEmitting(true);
      return;
    }
    this.stop(b);
    let entry = b.ribbons.get(key);
    if (!entry || !entry.ribbon.alive) {
      entry = { ribbon: this.manager.create(`${b.actorId}:${key}`, ramp), lastEmit: 0, tail: ramp.tail };
      b.ribbons.set(key, entry);
    }
    entry.ribbon.setEmitting(true);
    b.current = key;
  }

  private stop(b: Binding): void {
    if (b.current === null) return;
    b.ribbons.get(b.current)?.ribbon.setEmitting(false);
    b.current = null;
  }

  /** Fixed-tick sampling. `now` is the visual clock (frozen during hit-stop, so tails freeze with it). */
  tick(now: number): void {
    for (const b of this.bindings.values()) {
      if (b.polled) this.poll(b);
      this.sample(b, now);
      for (const [key, e] of b.ribbons) {
        if (!e.ribbon.alive) b.ribbons.delete(key);
        else if (b.current !== key && now - e.lastEmit > e.tail + 0.1) {
          e.ribbon.dispose();
          b.ribbons.delete(key);
        }
      }
    }
  }

  private poll(b: Binding): void {
    const atk = this.avatars.get(b.actorId)?.controller.activeAttack() ?? null;
    if (atk && !atk.noTrace && atk.normalizedTime >= atk.activeStart - TRAIL_LEAD && atk.normalizedTime <= atk.activeEnd) {
      this.start(b, atk.clip);
    } else this.stop(b);
  }

  private sample(b: Binding, now: number): void {
    if (b.current === null) return;
    const entry = b.ribbons.get(b.current);
    if (!entry) return;
    if (this.requireInScene && (!attached(b.hilt) || !attached(b.tip))) {
      this.stop(b);
      return;
    }
    b.hilt.getWorldPosition(_a);
    b.tip.getWorldPosition(_b);
    if (!Number.isFinite(_a.x + _a.y + _a.z + _b.x + _b.y + _b.z)) {
      this.stop(b);
      return;
    }
    entry.ribbon.push(_a, _b, now);
    entry.lastEmit = now;
  }

  dispose(): void {
    for (const id of [...this.bindings.keys()]) this.detach(id);
  }
}
