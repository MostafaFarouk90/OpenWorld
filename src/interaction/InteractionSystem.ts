import * as THREE from 'three';
import type { Actor } from '../actors/Actor';
import type { GameEvents } from '../core/events';
import type { GameSystem } from '../core/systems';
import type { ActionState, InputContextStack } from '../input/actions';
import { parseInteractableId } from './ids';

export type InteractKind =
  | 'talk'
  | 'door'
  | 'chest'
  | 'pickup'
  | 'waystone'
  | 'lever'
  | 'kneel'
  | 'release'
  | 'use'
  // v0.5: vendors (19), class trainers (12), stealth hide spots (18).
  | 'shop'
  | 'trainer'
  | 'hide';

export type InteractAction = 'interact' | 'mercy';
const ACTION_LIST: readonly InteractAction[] = ['interact', 'mercy'];

export interface Interactable {
  id: string;
  kind: InteractKind;
  position(out: THREE.Vector3): THREE.Vector3;
  radius?: number;
  promptKey?: string;
  /**
   * v0.5: extra `{param}` values for the prompt line, read while it shows (the mercy `{cost}`, the Calm offering's
   * name). `key` and `name` are the core's own and cannot be overridden.
   */
  promptParams?(): Record<string, string | number>;
  name?: string;
  holdSeconds?: number;
  priority?: number;
  /** Which key drives this interactable (default 'interact'). */
  action?: InteractAction;
  /** Half-angle of the facing cone in degrees (default 75); 360 or more disables the facing check. */
  coneDegrees?: number;
  /** Overrides the default score (distance minus priority); lower wins, ties by id. */
  score?: (feet: THREE.Vector3Like) => number;
  enabled?(): boolean;
  onInteract(actor: Actor): void;
}

export interface InteractionDeps {
  events: GameEvents;
  actions: () => ActionState;
  contexts: InputContextStack;
  player: () => { actor: Actor; feet: THREE.Vector3Like; facingYaw: number; moving: boolean };
  cameraForward?: () => THREE.Vector3Like | null;
  warn?: (m: string, e?: unknown) => void;
}

export const DEFAULT_INTERACT_RADIUS = 2;
export const DEFAULT_CONE_DEGREES = 75;
export const FOCUS_HALF_ANGLE = (DEFAULT_CONE_DEGREES * Math.PI) / 180;
const EPS = 1e-6;

type CancelReason = 'released' | 'focus-lost' | 'damaged' | 'context' | 'dead';

interface ActionSlot {
  focus: Interactable | null;
  hold: { item: Interactable; elapsed: number } | null;
  progress: number;
  needRelease: boolean;
}

const newSlot = (): ActionSlot => ({ focus: null, hold: null, progress: 0, needRelease: false });

/** Focus, press and hold handling for everything the player can interact with, tracked per action. */
export class InteractionSystem implements GameSystem {
  readonly id = 'core.interaction';
  readonly fixedPhase = 'rules' as const;
  readonly order = -100;

  /** The 'interact' focus (see `focusFor`). */
  focus: Interactable | null = null;
  /** The 'interact' hold progress (see `holdProgressFor`). */
  holdProgress = 0;

  private readonly items = new Map<string, Interactable>();
  private readonly slots: Record<InteractAction, ActionSlot> = { interact: newSlot(), mercy: newSlot() };
  private readonly warn: (m: string, e?: unknown) => void;
  private readonly offs: (() => void)[] = [];
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly deps: InteractionDeps) {
    this.warn = deps.warn ?? ((m, e) => console.warn(m, e));
    this.offs.push(
      deps.events.on('damage.dealt', (r) => {
        // Status ticks (bleed, ignite) never cancel a hold (actors-and-damage.md section 10).
        if (r.outcome === 'hit' && r.kind !== 'status' && r.targetId === this.safePlayer()?.actor.id) this.cancelAll('damaged');
      }),
      deps.contexts.onChange((top) => {
        if (top !== 'gameplay') {
          this.cancelAll('context');
          this.clearFocus();
        }
      }),
    );
  }

  focusFor(action: InteractAction): Interactable | null {
    return this.slots[action].focus;
  }

  holdProgressFor(action: InteractAction): number {
    return this.slots[action].progress;
  }

  register(i: Interactable): () => void {
    parseInteractableId(i.id);
    if (this.items.has(i.id)) throw new Error(`InteractionSystem: duplicate interactable "${i.id}"`);
    this.items.set(i.id, i);
    return () => {
      if (this.items.get(i.id) === i) this.items.delete(i.id);
    };
  }

  fixedUpdate(dt: number): void {
    const actions = this.deps.actions();
    for (const a of ACTION_LIST) if (this.slots[a].needRelease && !actions.down(a)) this.slots[a].needRelease = false;

    const p = this.deps.player();
    if (p.actor.dead) {
      this.cancelAll('dead');
      this.clearFocus();
      return;
    }
    if (this.deps.contexts.top() !== 'gameplay') {
      this.cancelAll('context');
      this.clearFocus();
      return;
    }

    const picked = this.pickFoci(p);
    for (const a of ACTION_LIST) {
      this.slots[a].focus = picked[a];
      this.updateAction(a, actions, dt, p.actor);
    }
    this.sync();
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.items.clear();
    for (const a of ACTION_LIST) this.slots[a] = newSlot();
    this.sync();
  }

  private updateAction(a: InteractAction, actions: ActionState, dt: number, actor: Actor): void {
    const slot = this.slots[a];
    if (slot.hold) {
      if (slot.focus !== slot.hold.item) {
        this.cancel(a, 'focus-lost');
      } else if (!actions.down(a)) {
        this.cancel(a, 'released');
      } else {
        this.advance(a, dt, actor);
        return;
      }
    }
    if (!slot.hold && !slot.needRelease && slot.focus && actions.pressed(a)) {
      const hs = slot.focus.holdSeconds ?? 0;
      if (hs > 0) {
        slot.hold = { item: slot.focus, elapsed: 0 };
        this.advance(a, dt, actor);
      } else {
        this.complete(a, slot.focus, actor);
      }
    }
  }

  /** Mirrors the interact slot into the public fields. */
  private sync(): void {
    this.focus = this.slots.interact.focus;
    this.holdProgress = this.slots.interact.progress;
  }

  private clearFocus(): void {
    for (const a of ACTION_LIST) this.slots[a].focus = null;
    this.sync();
  }

  private cancelAll(reason: CancelReason): void {
    for (const a of ACTION_LIST) this.cancel(a, reason);
  }

  private safePlayer() {
    try {
      return this.deps.player();
    } catch {
      return null;
    }
  }

  private advance(a: InteractAction, dt: number, actor: Actor): void {
    const slot = this.slots[a];
    const h = slot.hold!;
    h.elapsed += dt;
    const need = h.item.holdSeconds ?? 0;
    if (h.elapsed + EPS >= need) {
      this.complete(a, h.item, actor);
    } else {
      slot.progress = h.elapsed / need;
    }
  }

  private complete(a: InteractAction, item: Interactable, actor: Actor): void {
    const slot = this.slots[a];
    slot.hold = null;
    slot.progress = 0;
    try {
      item.onInteract(actor);
    } catch (e) {
      this.warn(`InteractionSystem: onInteract of "${item.id}" failed`, e);
      return;
    }
    // `action` is not yet in GameEvents' payload types (the core owner adds it); the shape is otherwise unchanged.
    const payload: { interactableId: string; kind: string; actorId: string; action: InteractAction } = {
      interactableId: item.id, kind: item.kind, actorId: actor.id, action: a,
    };
    this.deps.events.emit('interact', payload);
  }

  private cancel(a: InteractAction, reason: CancelReason): void {
    const slot = this.slots[a];
    const h = slot.hold;
    if (!h) return;
    slot.hold = null;
    slot.progress = 0;
    if (reason !== 'released') slot.needRelease = true;
    const payload: { interactableId: string; reason: CancelReason; action: InteractAction } = {
      interactableId: h.item.id, reason, action: a,
    };
    this.deps.events.emit('interact.cancelled', payload);
    this.sync();
  }

  private isEnabled(i: Interactable): boolean {
    try {
      return i.enabled ? i.enabled() : true;
    } catch (e) {
      this.warn(`InteractionSystem: enabled() of "${i.id}" failed`, e);
      return false;
    }
  }

  private itemScore(i: Interactable, feet: THREE.Vector3Like, dist: number): number {
    if (i.score) {
      try {
        const v = i.score(feet);
        if (Number.isFinite(v)) return v;
      } catch (e) {
        this.warn(`InteractionSystem: score() of "${i.id}" failed`, e);
      }
    }
    return dist - (i.priority ?? 0);
  }

  private pickFoci(p: ReturnType<InteractionDeps['player']>): Record<InteractAction, Interactable | null> {
    let fx = -Math.sin(p.facingYaw);
    let fz = -Math.cos(p.facingYaw);
    if (!p.moving && this.deps.cameraForward) {
      const c = this.deps.cameraForward();
      if (c) {
        const l = Math.hypot(c.x, c.z);
        if (l > 1e-6) {
          fx = c.x / l;
          fz = c.z / l;
        }
      }
    }
    const best: Record<InteractAction, Interactable | null> = { interact: null, mercy: null };
    const bestScore: Record<InteractAction, number> = { interact: Infinity, mercy: Infinity };
    for (const i of this.items.values()) {
      if (!this.isEnabled(i)) continue;
      i.position(this.tmp);
      const dx = this.tmp.x - p.feet.x;
      const dy = this.tmp.y - p.feet.y;
      const dz = this.tmp.z - p.feet.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > (i.radius ?? DEFAULT_INTERACT_RADIUS)) continue;
      const cone = i.coneDegrees ?? DEFAULT_CONE_DEGREES;
      const hd = Math.hypot(dx, dz);
      if (cone < 360 && hd > 1e-3 && (dx * fx + dz * fz) / hd < Math.cos((cone * Math.PI) / 180)) continue;
      const a = i.action === 'mercy' ? 'mercy' : 'interact';
      const score = this.itemScore(i, p.feet, dist);
      const cur = best[a];
      if (score < bestScore[a] || (score === bestScore[a] && cur && i.id < cur.id)) {
        best[a] = i;
        bestScore[a] = score;
      }
    }
    return best;
  }
}
