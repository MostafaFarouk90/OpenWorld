import { GRIMTOOTH, HOWLS, MOVES, POUNCE, type GrimtoothMoveDef } from './tuning';

export type GrimtoothState =
  | 'idle'
  | 'circle'
  | 'close'
  | 'crouch'
  | 'leap'
  | 'bite'
  | 'recover'
  | 'backstep'
  | 'howl'
  | 'broken'
  | 'window'
  | 'calmed'
  | 'dying';

/** How the encounter should move him this tick. */
export type GrimtoothMovement = 'circle' | 'close' | 'backstep' | 'none';

/** What the brain reads from the world each tick. */
export interface GrimtoothSense {
  /** Horizontal distance, Grimtooth feet to player feet (m). */
  dist: number;
  /** Live summoned hounds. */
  liveSummons: number;
}

/** What the brain asks the world to do (GrimtoothEncounter in the game, a recorder in tests). */
export interface GrimtoothHooks {
  /** A crouch (pounce) or a bite windup begins; `leadSeconds` is the time until the strike. */
  telegraph(move: GrimtoothMoveDef, swingId: number, leadSeconds: number): void;
  telegraphCancelled(swingId: number): void;
  /** Pounce only: the aim point locks now (POUNCE.aimLockBefore ahead of take-off). */
  aim(move: GrimtoothMoveDef, swingId: number): void;
  /** The crouch is over: he takes off. */
  leapStart(swingId: number): void;
  /** Every tick while airborne after take-off; `t01` runs to 1 on the landing tick. */
  leapTick(swingId: number, t01: number): void;
  /** He lands (`interrupted` false) or a break cuts the leap short (true). */
  leapEnd(swingId: number, interrupted: boolean): void;
  strike(move: GrimtoothMoveDef, swingId: number): void;
  /** The anti-camping leap back: movement only, no damage. */
  backstep(): void;
  howlStart(): void;
  /** A full howl ended: spawn `count` hounds. */
  howlRelease(count: number): void;
  stagger(): void;
  /** The mercy window opened: he lies low. */
  window(): void;
  restorePoise(): void;
}

/** `index` is the HOWLS.counts slot; `retry` is a howl cut short by a break, re-cast once and not re-counted. */
type Howl = { index: number; count: number; retry: boolean };

const CAMPING: ReadonlySet<GrimtoothState> = new Set<GrimtoothState>(['circle', 'close', 'recover']);
const TERMINAL: ReadonlySet<GrimtoothState> = new Set<GrimtoothState>(['calmed', 'dying']);
/** States a break can interrupt (idle, broken and window ignore it). */
const BREAKABLE: ReadonlySet<GrimtoothState> = new Set<GrimtoothState>([
  'circle',
  'close',
  'crouch',
  'leap',
  'bite',
  'recover',
  'backstep',
  'howl',
]);

/**
 * Gaffer Grimtooth's behaviour as a pure state machine (plans/slice-2-grimtooth.md section 3): circle, close, pounce and
 * burning bite by range, the anti-camping backstep, the two phase howls, the break stagger and the mercy-window lie-low.
 * It holds no world state: the encounter feeds it the boss registry's events and a per-tick sense, and carries out its
 * hooks.
 */
export class GrimtoothBrain {
  private _state: GrimtoothState = 'idle';
  private _phase = 1;
  /** Seconds in the current state. */
  private t = 0;
  private readonly cooldowns: Record<GrimtoothMoveDef['id'], number> = { pounce: 0, bite: 0 };
  private move: GrimtoothMoveDef | null = null;
  private swingId = 0;
  private aimed = false;
  private circleSeconds = 0;
  private campTime = 0;
  private pending: Howl | null = null;
  private howl: Howl | null = null;
  private readonly retriesUsed: number[] = HOWLS.counts.map(() => 0);
  private _wavesStarted = 0;
  private windowSeen = false;

  constructor(
    private readonly hooks: GrimtoothHooks,
    private readonly rng: () => number = Math.random,
  ) {}

  get state(): GrimtoothState {
    return this._state;
  }

  get phase(): number {
    return this._phase;
  }

  /** How the encounter should move him this tick. */
  get moving(): GrimtoothMovement {
    switch (this._state) {
      case 'circle':
        return 'circle';
      case 'close':
        return 'close';
      case 'backstep':
        return 'backstep';
      default:
        return 'none';
    }
  }

  /** Howl waves begun so far, retries not counted (never more than HOWLS.counts.length). */
  get wavesStarted(): number {
    return this._wavesStarted;
  }

  /** The fight begins (after the intro): no howl in phase 1, he circles. */
  start(): void {
    if (this._state !== 'idle') return;
    this.enter('circle');
  }

  tick(dt: number, sense: GrimtoothSense): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this._state === 'idle' || TERMINAL.has(this._state)) return;
    this.t += dt;
    this.cooldowns.pounce = Math.max(0, this.cooldowns.pounce - dt);
    this.cooldowns.bite = Math.max(0, this.cooldowns.bite - dt);
    // The camp timer runs through his swings' recovery too: a player hugging his flank for 10 s gets a backstep.
    if (CAMPING.has(this._state)) {
      if (sense.dist < GRIMTOOTH.campDistance) this.campTime += dt;
      else this.campTime = 0;
      if (this.campTime >= GRIMTOOTH.campSeconds) {
        this.enter('backstep');
        this.hooks.backstep();
        return;
      }
    }
    switch (this._state) {
      case 'circle':
        if (this.t >= this.circleSeconds) {
          if (this.howlAllowed(sense)) this.startHowl();
          else this.choose(sense);
        }
        break;
      case 'close':
        if (sense.dist <= MOVES.bite.range[1] && this.cooldowns.bite <= 0) this.startBite();
        else if (this.pounceReady(sense)) this.startCrouch();
        break;
      case 'crouch': {
        const move = MOVES.pounce;
        if (!this.aimed && this.t >= move.windup - POUNCE.aimLockBefore) {
          this.aimed = true;
          this.hooks.aim(move, this.swingId);
        }
        if (this.t >= move.windup) {
          this.cooldowns.pounce = move.cooldown;
          this.enter('leap');
          this.hooks.leapStart(this.swingId);
        }
        break;
      }
      case 'leap':
        this.hooks.leapTick(this.swingId, Math.min(1, this.t / POUNCE.airSeconds));
        if (this.t >= POUNCE.airSeconds) {
          this.move = MOVES.pounce;
          this.enter('recover');
          this.hooks.leapEnd(this.swingId, false);
        }
        break;
      case 'bite': {
        const move = MOVES.bite;
        if (this.t >= move.windup) {
          this.cooldowns.bite = move.cooldown;
          this.move = move;
          this.enter('recover');
          this.hooks.strike(move, this.swingId);
        }
        break;
      }
      case 'recover':
        if (this.t >= this.move!.recover) {
          if (this.howlAllowed(sense)) this.startHowl();
          else this.enter('circle');
        }
        break;
      case 'backstep':
        if (this.t >= GRIMTOOTH.backstepSeconds) this.enter('circle');
        break;
      case 'howl':
        if (this.t >= GRIMTOOTH.howlSeconds) {
          const count = this.howl!.count;
          this.howl = null;
          this.enter('circle');
          this.hooks.howlRelease(count);
        }
        break;
      case 'broken':
        if (this.t >= GRIMTOOTH.breakSeconds) {
          this.hooks.restorePoise();
          this.enter('circle');
        }
        break;
      default:
        break;
    }
  }

  /** A counted poise break (`boss.break`, `last` or not): the stagger. A `last` break is followed by the window opening. */
  onBreak(): void {
    if (TERMINAL.has(this._state)) return;
    if (!BREAKABLE.has(this._state)) {
      // A break the brain cannot act on (idle, already broken, lying low) must not leave his poise empty for good.
      this.hooks.restorePoise();
      return;
    }
    this.cancelAction(true);
    this.enter('broken');
    this.hooks.stagger();
  }

  /**
   * `boss.phase`: queue the phase's howl (phase 2 then phase 3). A newer queued howl replaces an older pending one, so a
   * hit crossing both thresholds plays one howl, the later count. Once the window has been seen no howl is queued.
   */
  onPhase(phase: number): void {
    if (phase <= this._phase || TERMINAL.has(this._state)) return;
    this._phase = phase;
    const index = phase - 2;
    if (index < 0 || index >= HOWLS.counts.length || this.windowSeen) return;
    this.pending = { index, count: HOWLS.counts[index], retry: false };
  }

  /** `boss.releaseWindow`: he lies low while open; when it closes unused he stands and fights on. Opens repeat. */
  onReleaseWindow(open: boolean): void {
    if (TERMINAL.has(this._state)) return;
    if (open) {
      // The phase-3 howl never starts in or after the window (ruling), whatever order the events arrive in.
      this.windowSeen = true;
      this.pending = null;
      if (this._state === 'window' || this._state === 'idle') return;
      this.cancelAction(false);
      this.enter('window');
      this.hooks.window();
    } else if (this._state === 'window') {
      this.hooks.restorePoise();
      this.enter('circle');
    }
  }

  /** `boss.released` or `boss.defeated`. */
  onOutcome(outcome: 'released' | 'defeated'): void {
    if (TERMINAL.has(this._state)) return;
    this.cancelAction(false);
    this.pending = null;
    this.enter(outcome === 'released' ? 'calmed' : 'dying');
  }

  // ---- internals ----

  private howlAllowed(sense: GrimtoothSense): boolean {
    return this.pending !== null && !this.windowSeen && sense.liveSummons === 0;
  }

  private pounceReady(sense: GrimtoothSense): boolean {
    const [lo, hi] = MOVES.pounce.range;
    return this.cooldowns.pounce <= 0 && sense.dist >= lo && sense.dist <= hi;
  }

  /** The circle ran out: pounce, bite, or close in. */
  private choose(sense: GrimtoothSense): void {
    if (this.pounceReady(sense)) this.startCrouch();
    else if (this.cooldowns.bite <= 0 && sense.dist <= MOVES.bite.range[1]) this.startBite();
    else this.enter('close');
  }

  private startCrouch(): void {
    this.move = MOVES.pounce;
    this.swingId++;
    this.aimed = false;
    this.enter('crouch');
    this.hooks.telegraph(MOVES.pounce, this.swingId, MOVES.pounce.windup);
  }

  private startBite(): void {
    this.move = MOVES.bite;
    this.swingId++;
    this.enter('bite');
    this.hooks.telegraph(MOVES.bite, this.swingId, MOVES.bite.windup);
  }

  private startHowl(): void {
    this.howl = this.pending!;
    this.pending = null;
    if (!this.howl.retry) this._wavesStarted++;
    this.enter('howl');
    this.hooks.howlStart();
  }

  /**
   * Stops whatever is running. A break (`forBreak`) re-queues a cut-off howl once per wave (and never over a newer queued
   * one); a window or an outcome just ends it.
   */
  private cancelAction(forBreak: boolean): void {
    switch (this._state) {
      case 'crouch':
      case 'bite':
        this.hooks.telegraphCancelled(this.swingId);
        break;
      case 'leap':
        this.hooks.leapEnd(this.swingId, true);
        break;
      case 'howl': {
        const cut = this.howl!;
        this.howl = null;
        if (forBreak && !this.windowSeen && this.pending === null && this.retriesUsed[cut.index] < HOWLS.retries) {
          this.retriesUsed[cut.index]++;
          this.pending = { index: cut.index, count: cut.count, retry: true };
        }
        break;
      }
      default:
        break;
    }
  }

  private enter(next: GrimtoothState): void {
    this._state = next;
    this.t = 0;
    if (!CAMPING.has(next)) this.campTime = 0;
    if (next === 'circle') {
      this.circleSeconds = GRIMTOOTH.circleSecondsMin + this.rng() * (GRIMTOOTH.circleSecondsMax - GRIMTOOTH.circleSecondsMin);
    }
  }
}
