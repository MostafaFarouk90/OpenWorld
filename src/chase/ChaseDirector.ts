import type { Anchor } from '../layout/AnchorRegistry';
import { Courier } from './Courier';
import type { P3, RouteNode } from './route';
import { CHASE } from './tuning';

export interface ChaseDef {
  id: string;
  /** Live while the quest is active and `liveUntil` is not done. */
  quest: { id: string; liveUntil: string };
  /** Start box on an anchor; the chase arms whenever the player stands in it while live. */
  start: { anchor: string; radius: number };
  /** Where a restart puts the player. */
  restartAnchor: string;
  /** Seconds; set from the par time (solvability.timerFor) against the real route. */
  timer: number;
}

export interface ChasePorts {
  find(id: string): Anchor | undefined;
  playerFeet(): P3;
  /** Quest-derived: M10 active and its chase objective not done. */
  live(def: ChaseDef): boolean;
  suspend(reason: string): () => void;
  teleport(feet: P3, yaw: number): Promise<unknown>;
  emit: {
    started(chaseId: string): void;
    caught(chaseId: string, seconds: number): void;
    lost(chaseId: string, reason: 'timer' | 'distance' | 'combat'): void;
  };
  warn(message: string): void;
}

export type ChasePhase = 'idle' | 'running' | 'again' | 'caught';

export interface ChaseTimer {
  remaining: number;
  total: number;
  gap: number;
  phase: 'running' | 'again';
}

/**
 * The courier chase (design item 76; plans/slice-2-stealth-chase.md sections 7 and 12): start, timer, catch, the
 * three loss rules, aborts and the restart after the "Again" card. Holds `save.suspend('chase')` only while running.
 * Never persisted: after a load it is idle and the start re-arms.
 */
export class ChaseDirector {
  readonly courier: Courier;
  private phase: ChasePhase = 'idle';
  private release: (() => void) | null = null;
  private elapsed = 0;
  private farFor = 0;
  private againLeft = 0;
  private gap = 0;
  private readonly timerOut: ChaseTimer = { remaining: 0, total: 0, gap: 0, phase: 'running' };
  private disposed = false;

  constructor(
    readonly def: ChaseDef,
    nodes: readonly RouteNode[],
    private readonly ports: ChasePorts,
  ) {
    this.courier = new Courier(nodes);
  }

  get state(): ChasePhase {
    return this.phase;
  }

  /** The chase service's `active()`: true while running (and across the Again card, which the music holds). */
  active(): boolean {
    return this.phase === 'running' || this.phase === 'again';
  }

  /** Thread 8 polls it per frame; null when no chase runs. */
  timer(): ChaseTimer | null {
    if (this.phase !== 'running' && this.phase !== 'again') return null;
    this.timerOut.total = this.def.timer;
    this.timerOut.remaining = Math.max(0, this.def.timer - this.elapsed);
    this.timerOut.gap = this.gap;
    this.timerOut.phase = this.phase;
    return this.timerOut;
  }

  private distanceToCourier(): number {
    const p = this.ports.playerFeet();
    const c = this.courier.position;
    return Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
  }

  private inStart(): boolean {
    const a = this.ports.find(this.def.start.anchor);
    const p = this.ports.playerFeet();
    return !!a && Math.hypot(p.x - a.position.x, p.z - a.position.z) <= this.def.start.radius && Math.abs(p.y - a.position.y) <= 4;
  }

  fixedUpdate(dt: number): void {
    if (this.disposed) return;
    const live = this.ports.live(this.def);
    if (this.phase === 'idle') {
      if (live && this.inStart()) this.begin();
      return;
    }
    if (!live) {
      // The quest moved on under the chase: a running one is lost (readers end), anything else goes idle.
      if (this.phase === 'running') this.abort();
      else this.phase = 'idle';
      return;
    }
    if (this.phase === 'again') {
      this.againLeft -= dt;
      if (this.againLeft <= 0) this.begin();
      return;
    }
    if (this.phase !== 'running') return;
    this.elapsed += dt;
    this.courier.step(dt, this.distanceToCourier());
    this.gap = this.distanceToCourier();
    if (this.gap <= CHASE.catchRadius) {
      this.phase = 'caught';
      this.dropHold();
      this.ports.emit.caught(this.def.id, this.elapsed);
      return;
    }
    if (this.elapsed >= this.def.timer) return this.lose('timer');
    this.farFor = this.gap > CHASE.loseGap ? this.farFor + dt : 0;
    if (this.farFor >= CHASE.loseSeconds - 1e-9) this.lose('distance');
  }

  private begin(): void {
    this.phase = 'running';
    this.elapsed = 0;
    this.farFor = 0;
    this.courier.reset();
    this.gap = this.distanceToCourier();
    if (!this.release) this.release = this.ports.suspend('chase');
    this.ports.emit.started(this.def.id);
  }

  /** Combat (aggro on the player, hostile aggro, a hit on the player) during the run loses it. */
  onCombat(): void {
    if (this.phase === 'running') this.lose('combat');
  }

  /**
   * Death, waystone travel or a dialogue during the run: `chase.lost` with reason `distance` (the event union is
   * fixed in core), hold released, back to idle so the start re-arms. No-op unless running.
   */
  abort(): void {
    if (this.phase !== 'running' && this.phase !== 'again') return;
    const wasRunning = this.phase === 'running';
    this.phase = 'idle';
    this.dropHold();
    if (wasRunning) this.ports.emit.lost(this.def.id, 'distance');
  }

  private lose(reason: 'timer' | 'distance' | 'combat'): void {
    if (this.phase !== 'running') return;
    this.phase = 'again';
    this.againLeft = CHASE.againSeconds;
    this.ports.emit.lost(this.def.id, reason);
    // The hold stays across the Again card; the restart puts both back at the start.
    this.courier.reset();
    const a = this.ports.find(this.def.restartAnchor);
    if (a) {
      this.ports.teleport(a.position, a.yaw).catch((err) => this.ports.warn(`chase: restart teleport failed: ${String(err)}`));
    } else this.ports.warn(`chase: restart anchor ${this.def.restartAnchor} missing`);
  }

  private dropHold(): void {
    const r = this.release;
    this.release = null;
    r?.();
  }

  /** Load rule: the chase restarts; idle, no hold; `cornered` puts the courier at the end (o3 done, o4 not). */
  onLoaded(cornered: boolean): void {
    this.phase = 'idle';
    this.dropHold();
    if (cornered) this.courier.placeCornered();
    else this.courier.reset();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.phase = 'idle';
    this.dropHold();
  }
}
