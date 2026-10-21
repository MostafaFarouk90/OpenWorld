import * as THREE from 'three';
import type { Interactable } from '../interaction/InteractionSystem';

export interface ValveOptions {
  /** `valve:<name>`; the interaction ids rule applies. */
  id: string;
  /** Distinct positions, 2 or more (the Bellows wheels use 4, a cooling valve may use 2). */
  positions?: number;
  initial?: number;
  onChange?: (position: number, previous: number) => void;
}

/** One valve wheel's state: each turn advances a notch and wraps. Locked wheels refuse to turn. */
export class ValveWheel {
  readonly positions: number;
  private pos: number;
  locked = false;

  constructor(private readonly opts: ValveOptions) {
    this.positions = opts.positions ?? 4;
    if (!Number.isInteger(this.positions) || this.positions < 2) throw new Error(`ValveWheel "${opts.id}": needs at least 2 positions`);
    const initial = opts.initial ?? 0;
    if (!Number.isInteger(initial) || initial < 0 || initial >= this.positions) throw new Error(`ValveWheel "${opts.id}": initial ${initial} is out of range`);
    this.pos = initial;
  }

  get id(): string {
    return this.opts.id;
  }

  position(): number {
    return this.pos;
  }

  /** True when the wheel moved. */
  turn(): boolean {
    if (this.locked) return false;
    return this.set((this.pos + 1) % this.positions);
  }

  /** Puts the wheel at `position` (a reset); out-of-range or unchanged is ignored. */
  set(position: number): boolean {
    if (!Number.isInteger(position) || position < 0 || position >= this.positions || position === this.pos) return false;
    const previous = this.pos;
    this.pos = position;
    this.opts.onChange?.(position, previous);
    return true;
  }
}

/** The interactable for a wheel, ready for `ctx.interaction.register`. */
export function valveInteractable(
  wheel: ValveWheel,
  at: (out: THREE.Vector3) => THREE.Vector3,
  extra: Partial<Pick<Interactable, 'radius' | 'enabled' | 'name'>> = {},
): Interactable {
  return {
    id: wheel.id,
    kind: 'valve',
    position: at,
    radius: extra.radius ?? 2,
    name: extra.name,
    promptKey: 'puzzle.valve.turn',
    promptParams: () => ({ position: wheel.position() + 1, of: wheel.positions }),
    enabled: () => !wheel.locked && (extra.enabled?.() ?? true),
    onInteract: () => void wheel.turn(),
  };
}
