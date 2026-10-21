import { OrderedBraziers, type LightResult } from './OrderedBraziers';
import { PressureTimer } from './PressureTimer';
import { PRESSURE_PHASE, PRESSURE_SECONDS } from './tuning';
import { routingMatches } from './routing';
import { ValveWheel } from './ValveWheel';

export type PuzzlePhase = 'idle' | typeof PRESSURE_PHASE | 'lighting' | 'solved' | 'failed';

export interface PuzzleDef {
  id: string;
  /** Valve `i` must end on `plaque[i]`. */
  plaque: readonly number[];
  /** Notches per wheel. */
  positions: number;
  /** Starting position of each wheel; never equal to the plaque on every valve. */
  initial: readonly number[];
  /** Order in which braziers (by valve index) must be lit. */
  order: readonly number[];
  seconds?: number;
  /** `valve:<prefix>-<n>` ids, n from 1. */
  valvePrefix: string;
}

export interface PuzzlePorts {
  emitState(id: string, phase: PuzzlePhase): void;
  emitSolved(id: string): void;
  emitFailed(id: string): void;
}

/**
 * The valve, pressure and brazier state machine (design 7.2). idle -> pressure on the first valve turn; a full match
 * stops the clock and opens lighting; the clock reaching zero fails and resets the room; lighting in order solves.
 * A failure, a wrong brazier and an abort reset with no penalty. Nothing here is saved except via `restoreSolved`.
 */
export class PuzzleController {
  readonly wheels: ValveWheel[];
  readonly timer: PressureTimer;
  readonly braziers: OrderedBraziers;
  private current: PuzzlePhase = 'idle';
  /** Set while the controller moves the wheels itself, so the move is not read as a player turn. */
  private moving = false;

  constructor(
    readonly def: PuzzleDef,
    private readonly ports: PuzzlePorts,
  ) {
    const n = def.plaque.length;
    if (def.initial.length !== n || def.order.length !== n) throw new Error(`PuzzleController "${def.id}": plaque, initial and order must be the same length`);
    if (routingMatches(def.initial, def.plaque)) throw new Error(`PuzzleController "${def.id}": the initial routing already matches`);
    this.timer = new PressureTimer(def.seconds ?? PRESSURE_SECONDS);
    this.braziers = new OrderedBraziers(def.order);
    this.wheels = def.initial.map(
      (initial, i) => new ValveWheel({ id: `valve:${def.valvePrefix}-${i + 1}`, positions: def.positions, initial, onChange: () => this.onValve() }),
    );
  }

  phase(): PuzzlePhase {
    return this.current;
  }

  routing(): number[] {
    return this.wheels.map((w) => w.position());
  }

  private setPhase(p: PuzzlePhase): void {
    if (p === this.current) return;
    this.current = p;
    this.ports.emitState(this.def.id, p);
  }

  private onValve(): void {
    if (this.moving) return;
    if (this.current === 'idle') {
      this.timer.start();
      this.setPhase(PRESSURE_PHASE);
    }
    if (this.current !== PRESSURE_PHASE) return;
    if (routingMatches(this.routing(), this.def.plaque)) {
      this.timer.reset();
      for (const w of this.wheels) w.locked = true;
      this.setPhase('lighting');
    }
  }

  update(dt: number): void {
    if (this.current === PRESSURE_PHASE && this.timer.update(dt)) {
      this.ports.emitFailed(this.def.id);
      this.setPhase('failed');
      this.reset();
    }
  }

  /** Lights brazier `index` (a valve index). Only counts in the lighting phase. */
  light(index: number): LightResult | 'closed' {
    if (this.current !== 'lighting') return 'closed';
    const r = this.braziers.light(index);
    if (r === 'done') {
      this.setPhase('solved');
      this.ports.emitSolved(this.def.id);
    }
    return r;
  }

  /** Back to idle: valves home, braziers dark, clock stopped. Used by failure, abort and load. */
  reset(): void {
    this.timer.reset();
    this.braziers.reset();
    this.moving = true;
    this.wheels.forEach((w, i) => {
      w.locked = false;
      w.set(this.def.initial[i]);
    });
    this.moving = false;
    this.current = 'idle';
    this.ports.emitState(this.def.id, 'idle');
  }

  /** A room abandoned mid-puzzle (death, travel, load) resets quietly; a solved puzzle stays solved. */
  abort(): void {
    if (this.current === 'solved') return;
    if (this.current !== 'idle' || this.timer.active) this.reset();
  }

  /** Loads a solved puzzle: valves at the plaque and locked, braziers lit, no events. */
  restoreSolved(): void {
    this.timer.reset();
    this.moving = true;
    this.def.plaque.forEach((p, i) => {
      this.wheels[i].locked = false;
      this.wheels[i].set(p);
      this.wheels[i].locked = true;
    });
    this.moving = false;
    this.braziers.fill();
    this.current = 'solved';
  }

  /** Solved state was cleared (a new game or a load without it). */
  clearSolved(): void {
    if (this.current === 'solved') this.reset();
  }
}
