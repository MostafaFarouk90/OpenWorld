// Act 4 L4 (plans/act4-L4.md section 1.1): one escort's walk along its route, pure (no scene, no services). The engine
// feeds it the player's position, whether any member is down (kneeling, or the cart stopped at 0) and whether a storm
// runs; it answers with the column's positions and the events to emit. Every halt has its resume rule here:
//   hit         -> cleared by the caller once every member is up (no standing hostile near a kneeling one)
//   storm       -> walks to a shelter, waits there, resumes when the storm ends
//   junction    -> waits until `go()` (Cael spoke to the lead); never times out
//   player-far  -> Cael more than PLAYER_FAR from every member; resumes inside PLAYER_BACK
import { Polyline, type P3 } from '../chase/route';

export type EscortHaltReason = 'hit' | 'junction' | 'storm' | 'player-far';

/** Halts in the order `escort.halted` reports the first of them. */
export const HALT_ORDER: readonly EscortHaltReason[] = ['hit', 'storm', 'junction', 'player-far'];

export const ESCORT_RUN = {
  /** Metres between members along the route, the lead in front. */
  spacing: 1.6,
  /** Halt beyond this from the nearest member (contracts v0.8 ESCORT_PLAYER_FAR; the brief's 40 m was ruled down). */
  playerFar: 25,
  /** ... and walk again once Cael is back within this. */
  playerBack: 15,
  /** Within this many metres (along the route) of a stop the lead is on it. */
  arriveM: 0.05,
} as const;

export interface EscortStop {
  id: string;
  /** Arc length along the route. */
  s: number;
}

export interface EscortRunPlan {
  points: readonly P3[];
  /** Metres a second. */
  pace: number;
  memberCount: number;
  /** Junctions in route order (each is stopped at once). */
  junctions: readonly EscortStop[];
  /** Storm shelters in route order. */
  shelters: readonly EscortStop[];
  spacing?: number;
  playerFar?: number;
  playerBack?: number;
}

export type EscortRunEvent =
  | { type: 'halted'; reason: EscortHaltReason }
  | { type: 'resumed' }
  | { type: 'junction'; junction: string; index: number }
  | { type: 'arrived' };

export interface EscortRunInput {
  dt: number;
  player: P3;
  /** Any member kneeling or the cart stopped (the caller's 8 m rule decides when it clears). */
  down: boolean;
  /** A storm runs where the escort is. */
  storm: boolean;
}

export interface EscortPose {
  x: number;
  y: number;
  z: number;
  /** Engine yaw (0 faces -Z) along the route. */
  yaw: number;
}

/** What a save keeps: the last junction reached (-1 is the route's start). */
export interface EscortRunSave {
  junctionIndex: number;
}

export class EscortRun {
  readonly line: Polyline;
  /** The lead's arc length. */
  s = 0;
  /** The last junction reached (-1: none yet, the start). */
  junctionIndex = -1;
  private readonly halts = new Set<EscortHaltReason>();
  private primary: EscortHaltReason | null = null;
  private shelterTarget: number | null = null;
  private atShelter = false;
  private done = false;
  private readonly tmp: P3 = { x: 0, y: 0, z: 0 };
  private readonly tmp2: P3 = { x: 0, y: 0, z: 0 };

  constructor(readonly plan: EscortRunPlan) {
    if (!(plan.pace > 0)) throw new Error(`EscortRun: pace must be positive (got ${plan.pace})`);
    if (plan.points.length < 2) throw new Error('EscortRun: a route needs at least two points');
    if (!(plan.memberCount >= 1)) throw new Error('EscortRun: an escort needs at least one member');
    this.line = new Polyline(plan.points);
    for (const list of [plan.junctions, plan.shelters]) {
      for (let i = 1; i < list.length; i++) if (list[i].s < list[i - 1].s) throw new Error('EscortRun: stops must be in route order');
    }
  }

  get arrived(): boolean {
    return this.done;
  }

  /** The halts holding now (several may at once). */
  get halted(): ReadonlySet<EscortHaltReason> {
    return this.halts;
  }

  /** The halt `escort.halted` reports (the first by HALT_ORDER), or null while walking. */
  get reason(): EscortHaltReason | null {
    return this.primary;
  }

  /** At a junction waiting for Cael. */
  get atJunction(): boolean {
    return this.halts.has('junction');
  }

  /** The id of the junction it waits at, or null. */
  get junctionId(): string | null {
    return this.atJunction ? this.plan.junctions[this.junctionIndex]?.id ?? null : null;
  }

  /** Cael spoke to the lead: leaves the junction it waits at. No events (and no change) when it is not waiting at one. */
  go(): EscortRunEvent[] {
    if (!this.halts.has('junction')) return [];
    this.halts.delete('junction');
    return this.settle();
  }

  step(input: EscortRunInput): EscortRunEvent[] {
    if (this.done) return [];
    const out: EscortRunEvent[] = [];
    this.flag('hit', input.down);
    this.updatePlayerFar(input.player);
    this.updateStorm(input.storm);
    out.push(...this.settle());

    const moving = !this.halts.has('hit') && !this.halts.has('player-far') && !this.halts.has('junction');
    if (!moving || !(input.dt > 0)) return out;
    if (this.halts.has('storm')) {
      // seek the shelter, then wait there
      if (this.shelterTarget === null || this.atShelter) return out;
      this.s = this.toward(this.s, this.shelterTarget, this.plan.pace * input.dt);
      if (Math.abs(this.s - this.shelterTarget) <= ESCORT_RUN.arriveM) {
        this.s = this.shelterTarget;
        this.atShelter = true;
      }
      return out;
    }
    const next = this.plan.junctions[this.junctionIndex + 1];
    const limit = next ? Math.min(next.s, this.line.length) : this.line.length;
    this.s = Math.min(limit, this.s + this.plan.pace * input.dt);
    if (next && this.s >= next.s - ESCORT_RUN.arriveM) {
      this.s = next.s;
      this.junctionIndex++;
      out.push({ type: 'junction', junction: next.id, index: this.junctionIndex });
      this.halts.add('junction');
      out.push(...this.settle());
      return out;
    }
    if (this.s >= this.line.length - ESCORT_RUN.arriveM) {
      this.s = this.line.length;
      this.done = true;
      this.halts.clear();
      this.primary = null;
      out.push({ type: 'arrived' });
    }
    return out;
  }

  /** Member `i` (0 is the lead), placed along the route behind the lead. */
  pose(i: number, out: EscortPose = { x: 0, y: 0, z: 0, yaw: 0 }): EscortPose {
    const spacing = this.plan.spacing ?? ESCORT_RUN.spacing;
    const s = Math.max(0, this.s - i * spacing);
    this.line.sampleAt(s, this.tmp);
    // the yaw of the route's tangent there (the segment it sits on; at the very start, the first segment)
    const seg = this.line.segmentAt(Math.min(s, this.line.length - 1e-6));
    const a = this.line.points[seg];
    const b = this.line.points[seg + 1] ?? a;
    out.x = this.tmp.x;
    out.y = this.tmp.y;
    out.z = this.tmp.z;
    out.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    return out;
  }

  poses(): EscortPose[] {
    return Array.from({ length: this.plan.memberCount }, (_, i) => this.pose(i));
  }

  /** Where a load puts the column back: the last junction, waiting there. */
  save(): EscortRunSave {
    return { junctionIndex: this.junctionIndex };
  }

  /**
   * Restores a saved run: at junction `junctionIndex`, waiting for Cael (the first thing after a load is speaking to the
   * lead), or at the start, walking, for -1. An index past the last junction clamps to it.
   */
  restore(save: EscortRunSave): void {
    const n = this.plan.junctions.length;
    const raw = Number.isFinite(save?.junctionIndex) ? Math.floor(save.junctionIndex) : -1;
    const idx = Math.max(-1, Math.min(n - 1, raw));
    this.done = false;
    this.halts.clear();
    this.primary = null;
    this.shelterTarget = null;
    this.atShelter = false;
    this.junctionIndex = idx;
    if (idx < 0) {
      this.s = 0;
      return;
    }
    this.s = this.plan.junctions[idx].s;
    this.halts.add('junction');
    this.primary = 'junction';
  }

  /** The point a save and a load use: the last junction's position, or the start. */
  safePoint(): P3 {
    const j = this.plan.junctions[this.junctionIndex];
    return { ...this.line.sampleAt(j ? j.s : 0, this.tmp2) };
  }

  private flag(reason: EscortHaltReason, on: boolean): void {
    if (on) this.halts.add(reason);
    else this.halts.delete(reason);
  }

  private updatePlayerFar(player: P3): void {
    const far = this.plan.playerFar ?? ESCORT_RUN.playerFar;
    const back = this.plan.playerBack ?? ESCORT_RUN.playerBack;
    let nearest = Infinity;
    for (let i = 0; i < this.plan.memberCount; i++) {
      const p = this.pose(i);
      nearest = Math.min(nearest, Math.hypot(p.x - player.x, p.z - player.z));
    }
    if (this.halts.has('player-far')) {
      if (nearest <= back) this.halts.delete('player-far');
    } else if (nearest > far) this.halts.add('player-far');
  }

  private updateStorm(storm: boolean): void {
    if (!storm) {
      this.halts.delete('storm');
      this.shelterTarget = null;
      this.atShelter = false;
      return;
    }
    if (this.halts.has('storm')) return;
    this.halts.add('storm');
    this.shelterTarget = this.pickShelter();
    this.atShelter = this.shelterTarget === null || Math.abs(this.shelterTarget - this.s) <= ESCORT_RUN.arriveM;
    if (this.atShelter && this.shelterTarget !== null) this.s = this.shelterTarget;
  }

  /**
   * The next shelter ahead that is not past the next junction it still has to stop at; else the nearest one behind; else
   * none (the column waits where it is).
   */
  private pickShelter(): number | null {
    const next = this.plan.junctions[this.junctionIndex + 1];
    const horizon = next ? next.s : this.line.length;
    let ahead: number | null = null;
    let behind: number | null = null;
    for (const sh of this.plan.shelters) {
      if (sh.s >= this.s - ESCORT_RUN.arriveM && sh.s <= horizon + ESCORT_RUN.arriveM) {
        if (ahead === null) ahead = sh.s;
      } else if (sh.s < this.s) behind = sh.s;
    }
    return ahead ?? behind;
  }

  private toward(from: number, to: number, step: number): number {
    return from < to ? Math.min(to, from + step) : Math.max(to, from - step);
  }

  /** Emits `halted` when the reported halt changes and `resumed` when none is left. */
  private settle(): EscortRunEvent[] {
    const now = HALT_ORDER.find((r) => this.halts.has(r)) ?? null;
    if (now === this.primary) return [];
    this.primary = now;
    return [now === null ? { type: 'resumed' } : { type: 'halted', reason: now }];
  }
}
