import { BOLT, KICK, SKARL } from './tuning';

export type SkarlState = 'idle' | 'aim' | 'loose' | 'reload' | 'kick' | 'backstep' | 'broken' | 'window' | 'dying';
/** How the encounter moves him this tick. */
export type SkarlMove = 'hold' | 'strafe' | 'backstep' | 'clearLane';

/** What the brain reads each tick (the encounter measures it). */
export interface SkarlSense {
  /** Horizontal distance to the player (metres). */
  dist: number;
  /** He stands within `SKARL.postLaneClear` of the line from the player to the chain post. */
  onPostLane: boolean;
}

/** What the brain asks the world to do (SkarlEncounter in the game, a recorder in tests). */
export interface SkarlHooks {
  telegraph(attackId: string, kind: 'block' | 'dodge', swingId: number, leadSeconds: number): void;
  cancelTelegraph(swingId: number): void;
  /** Looses bolt `index` of `count` (a fan's bolts share one tick). */
  loose(swingId: number, index: number, count: number, fan: boolean): void;
  kick(swingId: number): void;
  broken(): void;
  restorePoise(): void;
}

/**
 * Corvin Skarl's behaviour as a pure state machine (plans/act3-K8-pr2.md 3.2): aim a bolt (0.8 s, block it), loose it (phase 2 a
 * burst of two, phase 3 a fan of three), reload while strafing to hold 10 to 18 m; a player who closes inside 4 m makes him hop
 * back (at most once every 3 s) and one who stays there 1.5 s is kicked. Standing on the player's line to the chain post, he
 * leaves it at the next reload (review: the post stays reachable within one bolt cycle). A break kneels him for 3 s; the Spare
 * window holds him kneeling with no attacks; after a lapsed window he fights on.
 */
export class SkarlBrain {
  private _state: SkarlState = 'idle';
  private _phase = 1;
  private t = 0;
  private swingId = 0;
  private telegraphed = -1;
  private loosed = 0;
  /** The volley being loosed, fixed when it starts (a phase change mid-burst does not grow it). */
  private current: { count: number; fan: boolean } = { count: 1, fan: false };
  private closeT = 0;
  private backstepCooldown = 0;
  private laneT = 0;

  constructor(private readonly hooks: SkarlHooks) {}

  get state(): SkarlState {
    return this._state;
  }

  get phase(): number {
    return this._phase;
  }

  /** The current movement (the encounter does the moving). */
  get moving(): SkarlMove {
    switch (this._state) {
      case 'backstep':
        return 'backstep';
      case 'reload':
        return this.laneT > 0 ? 'clearLane' : 'strafe';
      case 'aim':
      case 'loose':
        // Still on the post's lane: keep clearing it while aiming (it never lasts past one cycle).
        return this.laneT > 0 ? 'clearLane' : 'hold';
      default:
        return 'hold';
    }
  }

  /** How many bolts a volley holds in this phase, and whether they leave together (the fan). */
  get volley(): { count: number; fan: boolean } {
    if (this._phase >= 3) return { count: 3, fan: true };
    if (this._phase === 2) return { count: 2, fan: false };
    return { count: 1, fan: false };
  }

  start(): void {
    if (this._state !== 'idle') return;
    this.enter('reload');
  }

  tick(dt: number, sense: SkarlSense): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this._state === 'idle' || this._state === 'dying' || this._state === 'window') return;
    this.t += dt;
    this.backstepCooldown = Math.max(0, this.backstepCooldown - dt);
    const dist = Number.isFinite(sense.dist) ? sense.dist : Infinity;
    this.laneT = sense.onPostLane ? this.laneT + dt : 0;
    if (this._state === 'broken') {
      if (this.t >= SKARL.breakSeconds) {
        this.hooks.restorePoise();
        this.enter('reload');
      }
      return;
    }
    // Close quarters: a hop back first, the kick if the player stays.
    const close = dist < SKARL.closeRange;
    this.closeT = close ? this.closeT + dt : 0;
    if (this._state !== 'kick' && this._state !== 'backstep') {
      if (close && this.closeT >= SKARL.closeKickSeconds) return this.startKick();
      if (close && this.backstepCooldown <= 0 && (this._state === 'reload' || this._state === 'aim')) return this.startBackstep();
    }
    switch (this._state) {
      case 'reload':
        if (this.t >= BOLT.reloadSeconds) this.startAim();
        break;
      case 'aim':
        if (this.t >= BOLT.aimSeconds) {
          this.enter('loose');
          this.loosed = 0;
          this.current = this.volley;
          this.looseNext();
        }
        break;
      case 'loose':
        if (this.loosed < this.current.count && this.t >= BOLT.burstGap * this.loosed) this.looseNext();
        if (this.loosed >= this.current.count) this.enter('reload');
        break;
      case 'kick':
        if (this.t >= KICK.windup && this.telegraphed === this.swingId) {
          this.telegraphed = -1;
          this.hooks.kick(this.swingId);
        }
        if (this.t >= KICK.windup + KICK.recover) {
          this.closeT = 0;
          this.enter('reload');
        }
        break;
      case 'backstep':
        if (this.t >= SKARL.backstepSeconds) this.enter('reload');
        break;
      default:
        break;
    }
  }

  /** A counted break: he kneels, stunned, for `SKARL.breakSeconds`. False while idle, in the window or dying. */
  onBreak(): boolean {
    if (this._state === 'idle' || this._state === 'dying' || this._state === 'window') return false;
    this.cancel();
    this.enter('broken');
    this.hooks.broken();
    return true;
  }

  onPhase(phase: number): void {
    if (phase <= this._phase || this._state === 'dying') return;
    this._phase = phase;
  }

  /** The Spare window: open holds him kneeling (no bolts, no kick); closed without a Spare, he fights on. */
  onReleaseWindow(open: boolean): void {
    if (this._state === 'dying' || this._state === 'idle') return;
    if (open) {
      this.cancel();
      this.enter('window');
    } else if (this._state === 'window') {
      this.enter('reload');
    }
  }

  onOutcome(): void {
    this.cancel();
    this.enter('dying');
  }

  // ---- internals ----

  private startAim(): void {
    this.swingId++;
    this.telegraphed = this.swingId;
    this.enter('aim');
    this.hooks.telegraph(BOLT.attackId, BOLT.telegraph, this.swingId, BOLT.aimSeconds);
  }

  private looseNext(): void {
    const { count, fan } = this.current;
    if (fan) {
      for (let i = 0; i < count; i++) this.hooks.loose(this.swingId, i, count, true);
      this.loosed = count;
    } else {
      this.hooks.loose(this.swingId, this.loosed, count, false);
      this.loosed++;
    }
    if (this.loosed >= count) this.telegraphed = -1;
  }

  private startKick(): void {
    this.cancel();
    this.swingId++;
    this.telegraphed = this.swingId;
    this.enter('kick');
    this.hooks.telegraph(KICK.attackId, KICK.telegraph, this.swingId, KICK.windup);
  }

  private startBackstep(): void {
    this.cancel();
    this.backstepCooldown = SKARL.backstepCooldown;
    this.enter('backstep');
  }

  private cancel(): void {
    if (this.telegraphed >= 0) this.hooks.cancelTelegraph(this.telegraphed);
    this.telegraphed = -1;
  }

  private enter(next: SkarlState): void {
    this._state = next;
    this.t = 0;
  }
}
