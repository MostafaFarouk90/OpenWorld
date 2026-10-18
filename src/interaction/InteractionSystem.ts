import * as THREE from 'three';
import type { Actor } from '../actors/Actor';
import type { GameEvents } from '../core/events';
import type { GameSystem } from '../core/systems';
import type { ActionState, InputContextStack } from '../input/actions';
import { parseInteractableId } from './ids';

export type InteractKind = 'talk' | 'door' | 'chest' | 'pickup' | 'waystone' | 'lever' | 'kneel' | 'release' | 'use';

export interface Interactable {
  id: string;
  kind: InteractKind;
  position(out: THREE.Vector3): THREE.Vector3;
  radius?: number;
  promptKey?: string;
  name?: string;
  holdSeconds?: number;
  priority?: number;
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
export const FOCUS_HALF_ANGLE = (75 * Math.PI) / 180;
const COS_FOCUS = Math.cos(FOCUS_HALF_ANGLE);
const EPS = 1e-6;

type CancelReason = 'released' | 'focus-lost' | 'damaged' | 'context' | 'dead';

/** Focus, press and hold handling for everything the player can interact with. */
export class InteractionSystem implements GameSystem {
  readonly id = 'core.interaction';
  readonly fixedPhase = 'rules' as const;
  readonly order = -100;

  focus: Interactable | null = null;
  holdProgress = 0;

  private readonly items = new Map<string, Interactable>();
  private hold: { item: Interactable; elapsed: number } | null = null;
  private needRelease = false;
  private readonly warn: (m: string, e?: unknown) => void;
  private readonly offs: (() => void)[] = [];
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly deps: InteractionDeps) {
    this.warn = deps.warn ?? ((m, e) => console.warn(m, e));
    this.offs.push(
      deps.events.on('damage.dealt', (r) => {
        if (this.hold && r.outcome === 'hit' && r.targetId === this.safePlayer()?.actor.id) this.cancel('damaged');
      }),
      deps.contexts.onChange((top) => {
        if (top !== 'gameplay' && this.hold) this.cancel('context');
        if (top !== 'gameplay') this.focus = null;
      }),
    );
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
    if (this.needRelease && !actions.down('interact')) this.needRelease = false;

    const p = this.deps.player();
    if (p.actor.dead) {
      if (this.hold) this.cancel('dead');
      this.focus = null;
      return;
    }
    if (this.deps.contexts.top() !== 'gameplay') {
      if (this.hold) this.cancel('context');
      this.focus = null;
      return;
    }

    this.focus = this.pickFocus(p);

    if (this.hold) {
      if (this.focus !== this.hold.item) {
        this.cancel('focus-lost');
      } else if (!actions.down('interact')) {
        this.cancel('released');
      } else {
        this.advance(dt, p.actor);
        return;
      }
    }

    if (!this.hold && !this.needRelease && this.focus && actions.pressed('interact')) {
      const hs = this.focus.holdSeconds ?? 0;
      if (hs > 0) {
        this.hold = { item: this.focus, elapsed: 0 };
        this.advance(dt, p.actor);
      } else {
        this.complete(this.focus, p.actor);
      }
    }
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.items.clear();
    this.hold = null;
    this.focus = null;
    this.holdProgress = 0;
  }

  private safePlayer() {
    try {
      return this.deps.player();
    } catch {
      return null;
    }
  }

  private advance(dt: number, actor: Actor): void {
    const h = this.hold!;
    h.elapsed += dt;
    const need = h.item.holdSeconds ?? 0;
    if (h.elapsed + EPS >= need) {
      this.complete(h.item, actor);
    } else {
      this.holdProgress = h.elapsed / need;
    }
  }

  private complete(item: Interactable, actor: Actor): void {
    this.hold = null;
    this.holdProgress = 0;
    try {
      item.onInteract(actor);
    } catch (e) {
      this.warn(`InteractionSystem: onInteract of "${item.id}" failed`, e);
      return;
    }
    this.deps.events.emit('interact', { interactableId: item.id, kind: item.kind, actorId: actor.id });
  }

  private cancel(reason: CancelReason): void {
    const h = this.hold;
    if (!h) return;
    this.hold = null;
    this.holdProgress = 0;
    if (reason !== 'released') this.needRelease = true;
    this.deps.events.emit('interact.cancelled', { interactableId: h.item.id, reason });
  }

  private isEnabled(i: Interactable): boolean {
    try {
      return i.enabled ? i.enabled() : true;
    } catch (e) {
      this.warn(`InteractionSystem: enabled() of "${i.id}" failed`, e);
      return false;
    }
  }

  private pickFocus(p: ReturnType<InteractionDeps['player']>): Interactable | null {
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
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const i of this.items.values()) {
      if (!this.isEnabled(i)) continue;
      i.position(this.tmp);
      const dx = this.tmp.x - p.feet.x;
      const dy = this.tmp.y - p.feet.y;
      const dz = this.tmp.z - p.feet.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > (i.radius ?? DEFAULT_INTERACT_RADIUS)) continue;
      const hd = Math.hypot(dx, dz);
      if (hd > 1e-3 && (dx * fx + dz * fz) / hd < COS_FOCUS) continue;
      const score = dist - (i.priority ?? 0);
      if (score < bestScore || (score === bestScore && best && i.id < best.id)) {
        best = i;
        bestScore = score;
      }
    }
    return best;
  }
}
