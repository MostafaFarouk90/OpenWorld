import { CYCLE, SLAGMAW } from './tuning';

export type SlagmawState = 'idle' | 'burrowed' | 'tremor' | 'surfaced' | 'submerge' | 'broken' | 'dying';

/** What the brain reads from the world each tick. */
export interface SlagmawSense {
  /** Horizontal distance from the worm's last surface spot to the player (m); spits need a target in range. */
  dist: number;
}

/** What the brain asks the world to do (SlagmawEncounter in the game, a recorder in tests). */
export interface SlagmawHooks {
  /** A tremor begins: cracks spread and the camera shakes for `leadSeconds` before the eruption. `chained` is the phase 3 second strike. */
  tremor(swingId: number, leadSeconds: number, chained: boolean): void;
  /** The eruption spot locks onto the player (CYCLE.aimLockBefore ahead of the burst). */
  aim(swingId: number): void;
  /** The burst: the area hit at the locked spot, then the worm is up. */
  erupt(swingId: number): void;
  /** A lava spit leaves the head toward the player. */
  spit(): void;
  /** The tremor was cut short (a break or an outcome). */
  tremorCancelled(swingId: number): void;
  submerge(): void;
  /** The worm went under: it leaves the hit lists. */
  submerged(): void;
  stagger(): void;
  restorePoise(): void;
}

const BREAKABLE: ReadonlySet<SlagmawState> = new Set<SlagmawState>(['burrowed', 'tremor', 'surfaced', 'submerge']);

/**
 * The Slagmaw's behaviour as a pure state machine (plans/act2-A8.md, PR 2): burrowed, then a 1.2 s tremor, then the eruption and
 * a spell on the surface spitting lava, then under again. Each phase shortens the cycle; phase 3 chains a second tremor straight
 * after the first eruption. A break (only reachable after a valve cool, which the encounter enforces by zeroing poise damage
 * while his crust is hot) throws him up and stunned for `SLAGMAW.breakSeconds`; he then goes under. No mercy state.
 */
export class SlagmawBrain {
  private _state: SlagmawState = 'idle';
  private _phase = 1;
  private t = 0;
  private swingId = 0;
  private aimed = false;
  private chained = false;
  private chainNext = false;
  private spitClock = 0;
  private spitsDone = 0;

  constructor(private readonly hooks: SlagmawHooks) {}

  get state(): SlagmawState {
    return this._state;
  }

  get phase(): number {
    return this._phase;
  }

  /** True while the worm is above ground and can be hit (surfaced or broken). */
  get exposed(): boolean {
    return this._state === 'surfaced' || this._state === 'broken';
  }

  start(): void {
    if (this._state !== 'idle') return;
    this.enter('burrowed');
  }

  tick(dt: number, sense: SlagmawSense): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this._state === 'idle' || this._state === 'dying') return;
    this.t += dt;
    switch (this._state) {
      case 'burrowed':
        if (this.t >= this.pick(CYCLE.burrowedSeconds)) this.startTremor(false);
        break;
      case 'tremor':
        if (!this.aimed && this.t >= CYCLE.tremorSeconds - CYCLE.aimLockBefore) {
          this.aimed = true;
          this.hooks.aim(this.swingId);
        }
        if (this.t >= CYCLE.tremorSeconds) {
          this.chainNext = this._phase >= CYCLE.chainFromPhase && !this.chained;
          this.enter('surfaced');
          this.hooks.erupt(this.swingId);
        }
        break;
      case 'surfaced': {
        // Phase 3: the first eruption of a cycle is followed at once by a second tremor, with no surface time.
        if (this.chainNext) {
          this.chainNext = false;
          this.hooks.submerge();
          this.hooks.submerged();
          this.startTremor(true);
          break;
        }
        this.spitClock += dt;
        const every = this.pick(CYCLE.spitEverySeconds);
        const due = this.spitsDone === 0 ? CYCLE.spitFirstSeconds : every;
        if (this.spitClock >= due && sense.dist >= 3) {
          this.spitsDone++;
          this.spitClock = 0;
          this.hooks.spit();
        }
        if (this.t >= this.pick(CYCLE.surfacedSeconds)) {
          this.enter('submerge');
          this.hooks.submerge();
        }
        break;
      }
      case 'submerge':
        if (this.t >= CYCLE.submergeSeconds) {
          this.hooks.submerged();
          this.enter('burrowed');
        }
        break;
      case 'broken':
        if (this.t >= SLAGMAW.breakSeconds) {
          this.hooks.restorePoise();
          this.enter('submerge');
          this.hooks.submerge();
        }
        break;
      default:
        break;
    }
  }

  /** A counted poise break. Only the encounter's cooling gate lets poise damage through, so this is always after a valve cool. */
  onBreak(): void {
    if (this._state === 'dying') return;
    if (!BREAKABLE.has(this._state)) {
      this.hooks.restorePoise();
      return;
    }
    if (this._state === 'tremor') this.hooks.tremorCancelled(this.swingId);
    this.chainNext = false;
    this.enter('broken');
    this.hooks.stagger();
  }

  /** `boss.phase`. */
  onPhase(phase: number): void {
    if (phase <= this._phase || this._state === 'dying') return;
    this._phase = phase;
  }

  /** `boss.defeated`. */
  onDefeated(): void {
    if (this._state === 'dying') return;
    if (this._state === 'tremor') this.hooks.tremorCancelled(this.swingId);
    this.chainNext = false;
    this.enter('dying');
  }

  private pick(table: readonly number[]): number {
    return table[Math.min(this._phase, table.length) - 1];
  }

  private startTremor(chained: boolean): void {
    this.swingId++;
    this.aimed = false;
    this.chained = chained;
    this.enter('tremor');
    this.hooks.tremor(this.swingId, CYCLE.tremorSeconds, chained);
  }

  private enter(next: SlagmawState): void {
    this._state = next;
    this.t = 0;
    if (next === 'surfaced') {
      this.spitClock = 0;
      this.spitsDone = 0;
    }
    if (next === 'burrowed') this.chained = false;
  }
}
