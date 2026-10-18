import * as THREE from 'three';
import type { GameEvents } from '../core/events';
import type { GameSystem } from '../core/systems';
import type { WorldState } from '../state/WorldState';
import type { InteractionSystem } from './InteractionSystem';
import { flagKeyFor, parseInteractableId } from './ids';

export interface DoorContext {
  interaction: InteractionSystem;
  state: WorldState;
  events: GameEvents;
  systems?: { add(s: GameSystem): () => void };
}

export interface DoorOptions {
  id: string;
  pivot: THREE.Object3D;
  openAngle: number;
  seconds: number;
  collider?: { setEnabled(on: boolean): void };
  locked?: () => boolean;
  position?: THREE.Vector3Like;
  radius?: number;
  name?: string;
}

/** A hinged door that toggles on interact and persists in `door.<name>.open`. */
export class Door {
  /** The logical state: true once opening starts, false once closing starts. */
  open = false;
  private t = 0;
  private readonly flag: string;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly ctx: DoorContext,
    private readonly opts: DoorOptions,
  ) {
    if (parseInteractableId(opts.id).kind !== 'door') throw new Error(`Door: id "${opts.id}" must be door:<name>`);
    if (!Number.isFinite(opts.openAngle)) throw new Error('Door: openAngle must be finite');
    if (!Number.isFinite(opts.seconds) || opts.seconds < 0) throw new Error('Door: seconds must be a finite number >= 0');
    this.flag = flagKeyFor(opts.id, 'open');
    this.snap();

    const self = this;
    this.offs.push(
      ctx.interaction.register({
        id: opts.id,
        kind: 'door',
        position: (out) => (opts.position ? out.set(opts.position.x, opts.position.y, opts.position.z) : opts.pivot.getWorldPosition(out)),
        radius: opts.radius,
        name: opts.name,
        get promptKey() {
          return self.isLocked() ? 'interact.locked' : 'interact.door';
        },
        onInteract: () => this.toggle(),
      }),
      ctx.events.on('save.loaded', () => this.snap()),
    );
    if (ctx.systems) {
      this.offs.push(
        ctx.systems.add({
          id: `door.${parseInteractableId(opts.id).name}`,
          fixedPhase: 'animation',
          order: 0,
          fixedUpdate: (dt) => this.fixedUpdate(dt),
        }),
      );
    }
  }

  isLocked(): boolean {
    return this.opts.locked?.() ?? false;
  }

  fixedUpdate(dt: number): void {
    const target = this.open ? 1 : 0;
    if (this.t === target) return;
    const step = this.opts.seconds > 0 ? dt / this.opts.seconds : 1;
    this.t = target > this.t ? Math.min(target, this.t + step) : Math.max(target, this.t - step);
    this.apply();
    if (this.t === 0) this.opts.collider?.setEnabled(true);
  }

  dispose(): void {
    for (const off of this.offs.splice(0).reverse()) off();
  }

  private toggle(): void {
    if (this.isLocked()) return;
    this.open = !this.open;
    if (this.open) this.opts.collider?.setEnabled(false);
    this.ctx.state.setFlag(this.flag, this.open);
  }

  private snap(): void {
    this.open = this.ctx.state.getBool(this.flag);
    this.t = this.open ? 1 : 0;
    this.apply();
    this.opts.collider?.setEnabled(!this.open);
  }

  private apply(): void {
    this.opts.pivot.rotation.y = this.opts.openAngle * this.t;
  }
}
