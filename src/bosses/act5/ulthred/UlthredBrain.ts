// Ulthred's state machine (pure: no scene, no services; plans/act5-N6.md section 3). The encounter owns the actor, the floors and
// the arena; the brain only decides what he does next and calls the hooks at the right moments.
//
//   idle -> approach -> slamTell -> slam (impact) -> stuck (phase 1: poise lands) -> recover -> idle
//   idle -> sweepTell -> sweep (impact) -> recover            (Cael hugging him, not in phase 2)
//   idle -> fireTell -> fire (impact) -> recover              (phase 2, every FORGEFIRE.everySeconds)
//   idle -> chainsTell -> chains (impact) -> recover          (phase 3, every CHAINS.everySeconds)
//   any -> broken (a bar broke) -> idle;  any -> drop (the floor gives way) -> idle;  any -> kneel (the Heartshard)
import { CHAINS, FORGEFIRE, SLAM, SWEEP } from './tuning';

export type UlthredState =
  | 'idle'
  | 'approach'
  | 'slamTell'
  | 'stuck'
  | 'recover'
  | 'sweepTell'
  | 'fireTell'
  | 'chainsTell'
  | 'broken'
  | 'drop'
  | 'kneel'
  | 'dying';

export type UlthredMove = typeof SLAM | typeof SWEEP | typeof FORGEFIRE | typeof CHAINS;

export interface UlthredHooks {
  telegraph(move: UlthredMove, swingId: number, leadSeconds: number): void;
  slam(swingId: number, length: number): void;
  sweep(swingId: number): void;
  forgefire(swingId: number): void;
  chains(swingId: number): void;
  stagger(): void;
  kneel(): void;
}

export interface UlthredSense {
  /** Horizontal distance to Cael (m). */
  dist: number;
}

/** Seconds he reels after a bar breaks. */
export const BREAK_SECONDS = 1.4;

export class UlthredBrain {
  private s: UlthredState = 'idle';
  private t = 0;
  private swing = 0;
  private p = 1;
  private fireT = 0;
  private chainsT = 0;
  private started = false;
  /** A sweep is never followed by another: the next move is a slam, so the hammer sticks for anyone who stays close. */
  private swept = false;

  constructor(private readonly hooks: UlthredHooks) {}

  get state(): UlthredState {
    return this.s;
  }

  get phase(): number {
    return this.p;
  }

  /** The hammer is stuck after a slam: phase 1's poise lands only now. */
  get stuck(): boolean {
    return this.s === 'stuck';
  }

  /** Nothing lands on him: the drop, and the kneel (only the Heartshard). */
  get invulnerable(): boolean {
    return this.s === 'drop' || this.s === 'kneel';
  }

  get approaching(): boolean {
    return this.s === 'approach';
  }

  get turning(): boolean {
    return this.s === 'idle' || this.s === 'approach' || this.s === 'slamTell' || this.s === 'sweepTell';
  }

  /** The current slam's reach (by phase). */
  get slamLength(): number {
    return SLAM.length[this.p - 1] ?? SLAM.length[0]!;
  }

  start(): void {
    this.started = true;
    this.go('idle', SLAM.gapSeconds);
  }

  setPhase(phase: number): void {
    this.p = Math.max(1, Math.min(3, Math.round(phase)));
    this.fireT = 0;
    this.chainsT = 0;
  }

  /** A bar broke: he reels (the ninth goes to the kneel through `onKneel`). */
  onBreak(): void {
    if (this.s === 'kneel' || this.s === 'dying' || this.s === 'drop') return;
    this.hooks.stagger();
    this.go('broken', BREAK_SECONDS);
  }

  /** The floor drop beat begins; `onDropDone` ends it. */
  onDrop(): void {
    if (this.s === 'kneel' || this.s === 'dying') return;
    this.go('drop', Infinity);
  }

  onDropDone(): void {
    if (this.s === 'drop') this.go('idle', SLAM.gapSeconds);
  }

  onKneel(): void {
    if (this.s === 'dying') return;
    this.hooks.kneel();
    this.go('kneel', Infinity);
  }

  onDeath(): void {
    this.go('dying', Infinity);
  }

  tick(dt: number, sense: UlthredSense): void {
    if (!this.started || !(dt > 0)) return;
    if (this.p === 2 && this.active) this.fireT += dt;
    if (this.p === 3 && this.active) this.chainsT += dt;
    this.t -= dt;
    switch (this.s) {
      case 'idle':
        if (this.t <= 0) this.decide(sense);
        return;
      case 'approach':
        if (sense.dist <= this.reach()) this.tell(SLAM, 'slamTell');
        else if (this.t <= 0) this.tell(SLAM, 'slamTell');
        return;
      case 'slamTell':
        if (this.t <= 0) {
          this.hooks.slam(this.swing, this.slamLength);
          this.go('stuck', SLAM.stuckSeconds);
        }
        return;
      case 'stuck':
        if (this.t <= 0) this.go('recover', SLAM.recoverSeconds);
        return;
      case 'sweepTell':
        if (this.t <= 0) {
          this.hooks.sweep(this.swing);
          this.go('recover', SWEEP.recoverSeconds);
        }
        return;
      case 'fireTell':
        if (this.t <= 0) {
          this.hooks.forgefire(this.swing);
          this.go('recover', SLAM.recoverSeconds);
        }
        return;
      case 'chainsTell':
        if (this.t <= 0) {
          this.hooks.chains(this.swing);
          this.go('recover', SLAM.recoverSeconds);
        }
        return;
      case 'recover':
      case 'broken':
        if (this.t <= 0) this.go('idle', SLAM.gapSeconds);
        return;
      default:
        return;
    }
  }

  private get active(): boolean {
    return this.s !== 'drop' && this.s !== 'kneel' && this.s !== 'dying' && this.s !== 'broken';
  }

  private reach(): number {
    return Math.max(2.5, this.slamLength * 0.7);
  }

  private decide(sense: UlthredSense): void {
    if (this.p === 2 && this.fireT >= FORGEFIRE.everySeconds) {
      this.fireT = 0;
      this.tell(FORGEFIRE, 'fireTell');
      return;
    }
    if (this.p === 3 && this.chainsT >= CHAINS.everySeconds) {
      this.chainsT = 0;
      this.tell(CHAINS, 'chainsTell');
      return;
    }
    if (this.p !== 2 && sense.dist <= SWEEP.within && !this.swept) {
      this.swept = true;
      this.tell(SWEEP, 'sweepTell');
      return;
    }
    this.swept = false;
    // Phase 2: he holds the Anvil's middle and slams across the ring at Cael's platform.
    if (this.p === 2 || sense.dist <= this.reach()) this.tell(SLAM, 'slamTell');
    else this.go('approach', 6);
  }

  private tell(move: UlthredMove, state: UlthredState): void {
    this.swing++;
    this.go(state, move.windupSeconds);
    this.hooks.telegraph(move, this.swing, move.windupSeconds);
  }

  private go(s: UlthredState, t: number): void {
    this.s = s;
    this.t = t;
  }
}
