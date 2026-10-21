import { CHARGE, MOVES, REDMANE, TRAP, type RedmaneMoveDef } from './tuning';

export type RedmaneState =
  | 'idle'
  | 'approach'
  | 'thrust'
  | 'couch'
  | 'charge'
  | 'feint'
  | 'net'
  | 'trap'
  | 'recover'
  | 'backstep'
  | 'broken'
  | 'window'
  | 'spared'
  | 'dying';

/** How the encounter should move him this tick. */
export type RedmaneMovement = 'approach' | 'backstep' | 'feint' | 'none';

/** What the brain reads from the world each tick. */
export interface RedmaneSense {
  /** Horizontal distance, Redmane feet to player feet (m). */
  dist: number;
  /** Traps standing or arming now. */
  liveTraps: number;
}

/** How a charge tick ended: still running, ran its length, or hit the arena wall. */
export type ChargeProgress = 'running' | 'done' | 'wall';

/** What the brain asks the world to do (RedmaneEncounter in the game, a recorder in tests). */
export interface RedmaneHooks {
  /** A couch (charge), thrust, net swing or trap placing begins; `leadSeconds` is the time until the effect. */
  telegraph(move: RedmaneMoveDef, swingId: number, leadSeconds: number): void;
  telegraphCancelled(swingId: number): void;
  /** Charge only: the lane locks now (CHARGE.aimLockBefore ahead of take-off). */
  aim(swingId: number): void;
  chargeStart(swingId: number): void;
  /** Every tick while charging; the encounter moves him and tests the hit. */
  chargeTick(swingId: number, dt: number): ChargeProgress;
  /** The charge ended (`interrupted` true when a break or an outcome cut it short). */
  chargeEnd(swingId: number, interrupted: boolean): void;
  strike(move: RedmaneMoveDef, swingId: number): void;
  netRelease(swingId: number): void;
  trapPlace(swingId: number): void;
  /** The anti-camping leap back: movement only, no damage. */
  backstep(): void;
  stagger(): void;
  /** The Spare window opened: he lies low. */
  window(): void;
  restorePoise(): void;
}

/** The camp timer runs through every fighting state, so a player hugging him cannot keep it at 0. */
const CAMPING: ReadonlySet<RedmaneState> = new Set<RedmaneState>(['approach', 'thrust', 'couch', 'charge', 'feint', 'net', 'trap', 'recover']);
const TERMINAL: ReadonlySet<RedmaneState> = new Set<RedmaneState>(['spared', 'dying']);
/** States a break can interrupt (idle, broken and window ignore it). */
const BREAKABLE: ReadonlySet<RedmaneState> = new Set<RedmaneState>(['approach', 'thrust', 'couch', 'charge', 'feint', 'net', 'trap', 'recover', 'backstep']);

/**
 * Thrandil Redmane's behaviour as a pure state machine (plans/act2-A8.md section 3): he stalks in, then picks among the lance
 * thrust, the lance charge, the net and the harpoon trap by range, cooldown and weight; phase 2 shortens every cooldown and may
 * chain a second charge after a feint. A break staggers him; the Spare window makes him lie low and, if it lapses unused, he
 * stands and fights on (the registry reopens it on the next final-phase break, as for the Act 1 bosses).
 * It holds no world state: the encounter feeds it the registry's events and a per-tick sense, and carries out its hooks.
 */
export class RedmaneBrain {
  private _state: RedmaneState = 'idle';
  private _phase = 1;
  /** Seconds in the current state. */
  private t = 0;
  private readonly cooldowns: Record<RedmaneMoveDef['id'], number> = { charge: 0, thrust: 0, net: 0, trap: 0 };
  private swingId = 0;
  private aimed = false;
  private approachSeconds = 0;
  private campTime = 0;
  /** The recover that follows the current action lasts this long. */
  private recoverFor = 0;
  /** Phase 2: the charge just run may be followed by one more. */
  private chained = false;

  constructor(
    private readonly hooks: RedmaneHooks,
    private readonly rng: () => number = Math.random,
  ) {}

  get state(): RedmaneState {
    return this._state;
  }

  get phase(): number {
    return this._phase;
  }

  get moving(): RedmaneMovement {
    switch (this._state) {
      case 'approach':
        return 'approach';
      case 'backstep':
        return 'backstep';
      case 'feint':
        return 'feint';
      default:
        return 'none';
    }
  }

  /** The fight begins (after the intro). */
  start(): void {
    if (this._state !== 'idle') return;
    this.enter('approach');
  }

  tick(dt: number, sense: RedmaneSense): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this._state === 'idle' || TERMINAL.has(this._state)) return;
    this.t += dt;
    for (const id of Object.keys(this.cooldowns) as RedmaneMoveDef['id'][]) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    // A player within camp distance for 10 s of fighting gets a backstep; it may not cut a charge short.
    if (CAMPING.has(this._state)) {
      if (sense.dist < REDMANE.campDistance) this.campTime += dt;
      else this.campTime = 0;
      if (this.campTime >= REDMANE.campSeconds && this._state !== 'charge') {
        this.cancelAction();
        this.enter('backstep');
        this.hooks.backstep();
        return;
      }
    }
    switch (this._state) {
      case 'approach':
        if (this.t >= this.approachSeconds) this.choose(sense);
        break;
      case 'thrust': {
        const m = MOVES.thrust;
        if (this.t >= m.windup) {
          this.cooldowns.thrust = this.cooldown(m);
          this.finishAction(m.recover);
          this.hooks.strike(m, this.swingId);
        }
        break;
      }
      case 'couch': {
        const m = MOVES.charge;
        if (!this.aimed && this.t >= m.windup - CHARGE.aimLockBefore) {
          this.aimed = true;
          this.hooks.aim(this.swingId);
        }
        if (this.t >= m.windup) {
          this.cooldowns.charge = this.cooldown(m);
          this.enter('charge');
          this.hooks.chargeStart(this.swingId);
        }
        break;
      }
      case 'charge': {
        const progress = this.hooks.chargeTick(this.swingId, dt);
        if (progress !== 'running') {
          this.recoverFor = MOVES.charge.recover + (progress === 'wall' ? CHARGE.wallExtraRecover : 0);
          // Phase 2: a charge that found open floor may chain a second one after a feint.
          const chain = this._phase >= 2 && !this.chained && progress === 'done';
          this.chained = chain;
          this.enter(chain ? 'feint' : 'recover');
          this.hooks.chargeEnd(this.swingId, false);
        }
        break;
      }
      case 'feint':
        if (this.t >= REDMANE.feintSeconds) this.startCouch();
        break;
      case 'net': {
        const m = MOVES.net;
        if (this.t >= m.windup) {
          this.cooldowns.net = this.cooldown(m);
          this.finishAction(m.recover);
          this.hooks.netRelease(this.swingId);
        }
        break;
      }
      case 'trap': {
        const m = MOVES.trap;
        if (this.t >= m.windup) {
          this.cooldowns.trap = this.cooldown(m);
          this.finishAction(m.recover);
          this.hooks.trapPlace(this.swingId);
        }
        break;
      }
      case 'recover':
        if (this.t >= this.recoverFor) this.enter('approach');
        break;
      case 'backstep':
        if (this.t >= REDMANE.backstepSeconds) this.enter('approach');
        break;
      case 'broken':
        if (this.t >= REDMANE.breakSeconds) {
          this.hooks.restorePoise();
          this.enter('approach');
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
    this.cancelAction();
    this.chained = false;
    this.enter('broken');
    this.hooks.stagger();
  }

  /** `boss.phase`. */
  onPhase(phase: number): void {
    if (phase <= this._phase || TERMINAL.has(this._state)) return;
    this._phase = phase;
    this.chained = false;
  }

  /** `boss.releaseWindow`: he lies low while open; when it closes unused he stands and fights on. Opens repeat. */
  onReleaseWindow(open: boolean): void {
    if (TERMINAL.has(this._state)) return;
    if (open) {
      if (this._state === 'window' || this._state === 'idle') return;
      this.cancelAction();
      this.chained = false;
      this.enter('window');
      this.hooks.window();
    } else if (this._state === 'window') {
      this.hooks.restorePoise();
      this.enter('approach');
    }
  }

  /** `boss.spared` or `boss.defeated`. */
  onOutcome(outcome: 'spared' | 'defeated'): void {
    if (TERMINAL.has(this._state)) return;
    this.cancelAction();
    this.enter(outcome === 'spared' ? 'spared' : 'dying');
  }

  // ---- internals ----

  private cooldown(m: RedmaneMoveDef): number {
    return m.cooldown * (this._phase >= 2 ? REDMANE.phase2Cooldown : 1);
  }

  private ready(m: RedmaneMoveDef, sense: RedmaneSense): boolean {
    if (this.cooldowns[m.id] > 0) return false;
    if (sense.dist < m.range[0] || sense.dist > m.range[1]) return false;
    if (m.id === 'trap' && sense.liveTraps >= TRAP.maxLive[Math.min(this._phase, TRAP.maxLive.length) - 1]) return false;
    return true;
  }

  /** The approach ran out: pick a ready move by weight, or keep stalking. */
  private choose(sense: RedmaneSense): void {
    const ready = (Object.values(MOVES) as RedmaneMoveDef[]).filter((m) => this.ready(m, sense));
    if (ready.length === 0) {
      this.enter('approach');
      return;
    }
    const total = ready.reduce((n, m) => n + m.weight, 0);
    let roll = this.rng() * total;
    let pick = ready[ready.length - 1];
    for (const m of ready) {
      roll -= m.weight;
      if (roll < 0) {
        pick = m;
        break;
      }
    }
    this.chained = false;
    switch (pick.id) {
      case 'charge':
        this.startCouch();
        break;
      case 'thrust':
        this.startTimed('thrust', pick);
        break;
      case 'net':
        this.startTimed('net', pick);
        break;
      case 'trap':
        this.startTimed('trap', pick);
        break;
    }
  }

  private startCouch(): void {
    this.swingId++;
    this.aimed = false;
    this.enter('couch');
    this.hooks.telegraph(MOVES.charge, this.swingId, MOVES.charge.windup);
  }

  private startTimed(state: 'thrust' | 'net' | 'trap', m: RedmaneMoveDef): void {
    this.swingId++;
    this.enter(state);
    this.hooks.telegraph(m, this.swingId, m.windup);
  }

  private finishAction(recover: number): void {
    this.recoverFor = recover;
    this.enter('recover');
  }

  /** Stops whatever is running (a break, a window, an outcome, a backstep). */
  private cancelAction(): void {
    switch (this._state) {
      case 'couch':
      case 'thrust':
      case 'net':
      case 'trap':
        this.hooks.telegraphCancelled(this.swingId);
        break;
      case 'charge':
        this.hooks.chargeEnd(this.swingId, true);
        break;
      default:
        break;
    }
  }

  private enter(next: RedmaneState): void {
    this._state = next;
    this.t = 0;
    if (!CAMPING.has(next)) this.campTime = 0;
    if (next === 'approach') {
      this.approachSeconds = REDMANE.approachSecondsMin + this.rng() * (REDMANE.approachSecondsMax - REDMANE.approachSecondsMin);
    }
  }
}
