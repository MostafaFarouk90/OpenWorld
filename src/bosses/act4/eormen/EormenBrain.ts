// Archwraith Eormen's state machine (plans/act4-L6.md "PR 2", A). Pure: no three.js, no services; the encounter implements the
// hooks and feeds the sense each tick. States: idle (before start), ready (choosing the next move), telegraph (the blades' 0.8 s
// flash, the toll's 1.2 s raised hands, the swipe's 0.7 s wind-up), recover, staggered (a bar broke at the gong), dying.
//
// The Last Gong's window is separate from the attack states: a toll opens it for TOLL.windowSeconds. A toll while it is open
// extends it to the full length from the new toll and never opens a second one (coordinator review 17:51): one window breaks at
// most one bar, and a break closes the window at once.
import { BLADES, STAGGER, SWIPE, TOLL } from './tuning';

export type EormenAttack = 'blades' | 'toll' | 'swipe';
export type EormenState = 'idle' | 'ready' | 'telegraph' | 'recover' | 'staggered' | 'dying';
export type GongStrike = 'break' | 'dud';

export interface EormenHooks {
  /** A telegraph begins (`lead` seconds before the move lands). */
  telegraph(attack: EormenAttack, swingId: number, lead: number): void;
  cancelTelegraph(swingId: number): void;
  /** Four blades fly now at where Cael stands. */
  blades(swingId: number): void;
  /** The toll's shock ring lands now (the window opens through `windowOpen`). */
  toll(swingId: number): void;
  swipe(swingId: number): void;
  /** The Last Gong opened (`extended`: it was already open and the new toll gave it the full length again). */
  windowOpen(extended: boolean): void;
  /** The window ran out or a break used it. */
  windowClose(): void;
  staggerStart(): void;
  staggerEnd(): void;
}

export interface EormenSense {
  /** Horizontal metres from Eormen to the player. */
  dist: number;
}

const WINDUP: Record<EormenAttack, number> = { blades: BLADES.windup, toll: TOLL.windup, swipe: SWIPE.windup };
const RECOVER: Record<EormenAttack, number> = { blades: BLADES.recover, toll: TOLL.recover, swipe: SWIPE.recover };

export class EormenBrain {
  private _state: EormenState = 'idle';
  private t = 0;
  private wait = 0;
  private swing = 0;
  private attack: EormenAttack | null = null;
  private _phase = 1;
  /** Seconds to the next toll and the next blade volley; the swipe's cooldown. */
  private tollIn: number = TOLL.first;
  private bladesIn = 0;
  private swipeCd = 0;
  /** The Last Gong: seconds left open, and whether this window has given its bar. */
  private windowLeft = 0;

  constructor(private readonly hooks: EormenHooks) {}

  get state(): EormenState {
    return this._state;
  }

  get phase(): number {
    return this._phase;
  }

  get current(): EormenAttack | null {
    return this.attack;
  }

  /** The Last Gong is open (a strike now breaks a bar). */
  get windowOpen(): boolean {
    return this.windowLeft > 0;
  }

  /** Seconds left in the gong's window (tests, the fx). */
  get windowRemaining(): number {
    return Math.max(0, this.windowLeft);
  }

  /** Seconds to the next toll (tests). */
  get tollRemaining(): number {
    return Math.max(0, this.tollIn);
  }

  get active(): boolean {
    return this._state !== 'idle' && this._state !== 'dying';
  }

  start(): void {
    if (this._state !== 'idle') return;
    this.tollIn = TOLL.first;
    this.bladesIn = this.bladeGap() * 0.5;
    this.enter('ready', 0);
  }

  /** The move for now: the toll when it is due, the swipe close in, the blades when their volley is due; null to keep drifting. */
  static pick(dist: number, tollDue: boolean, bladesDue: boolean, swipeReady: boolean): EormenAttack | null {
    if (tollDue) return 'toll';
    if (dist <= SWIPE.reach && swipeReady) return 'swipe';
    if (bladesDue) return 'blades';
    return null;
  }

  tick(dt: number, sense: EormenSense): void {
    if (!(dt > 0) || !this.active) return;
    this.t += dt;
    this.tollIn -= dt;
    this.bladesIn -= dt;
    this.swipeCd -= dt;
    if (this.windowLeft > 0) {
      this.windowLeft -= dt;
      if (this.windowLeft <= 0) {
        this.windowLeft = 0;
        this.hooks.windowClose();
      }
    }
    switch (this._state) {
      case 'ready':
        if (this.t >= this.wait) this.choose(sense);
        break;
      case 'telegraph':
        if (this.t >= this.wait) this.land();
        break;
      case 'recover':
        if (this.t >= this.wait) this.enter('ready', 0);
        break;
      case 'staggered':
        if (this.t >= this.wait) {
          this.hooks.staggerEnd();
          this.enter('ready', 0);
        }
        break;
    }
  }

  /** Cael struck the Last Gong (a hit or F). Inside an open window it breaks: the window closes and he reels. */
  strikeGong(): GongStrike {
    if (!this.active || this.windowLeft <= 0) return 'dud';
    this.windowLeft = 0;
    this.hooks.windowClose();
    return 'break';
  }

  /** A bar broke (the encounter accepted the gong's break): stop the move and reel. */
  onBreak(): void {
    if (!this.active) return;
    this.stopAttack();
    this.enter('staggered', STAGGER.seconds);
    this.hooks.staggerStart();
  }

  /** His health reached this phase's floor: toll soon (TOLL.atFloor) unless one is sooner or the gong is open. */
  onFloor(): void {
    if (!this.active || this.windowLeft > 0) return;
    this.tollIn = Math.min(this.tollIn, TOLL.atFloor);
  }

  /** The registry moved to `phase`: the cadences quicken. */
  onPhase(phase: number): void {
    if (phase <= this._phase) return;
    this._phase = phase;
    this.tollIn = Math.min(this.tollIn, this.tollGap());
    this.bladesIn = Math.min(this.bladesIn, this.bladeGap());
  }

  onDefeated(): void {
    this.stopAttack();
    if (this.windowLeft > 0) {
      this.windowLeft = 0;
      this.hooks.windowClose();
    }
    this._state = 'dying';
  }

  /** Ends any telegraph without landing it (a reset or a break). */
  stopAttack(): void {
    if (this._state === 'telegraph') this.hooks.cancelTelegraph(this.swing);
    this.attack = null;
  }

  // ---- internals ----

  private tollGap(): number {
    return TOLL.gap[Math.min(TOLL.gap.length, this._phase) - 1];
  }

  private bladeGap(): number {
    return BLADES.gap[Math.min(BLADES.gap.length, this._phase) - 1];
  }

  private enter(state: EormenState, wait: number): void {
    this._state = state;
    this.t = 0;
    this.wait = wait;
  }

  private choose(sense: EormenSense): void {
    const attack = EormenBrain.pick(sense.dist, this.tollIn <= 0, this.bladesIn <= 0, this.swipeCd <= 0);
    if (!attack) return;
    this.swing++;
    this.attack = attack;
    this.enter('telegraph', WINDUP[attack]);
    this.hooks.telegraph(attack, this.swing, WINDUP[attack]);
  }

  private land(): void {
    const attack = this.attack;
    this.attack = null;
    if (attack === 'blades') {
      this.hooks.blades(this.swing);
      this.bladesIn = this.bladeGap();
    } else if (attack === 'toll') {
      this.hooks.toll(this.swing);
      this.tollIn = this.tollGap();
      const extended = this.windowLeft > 0;
      this.windowLeft = TOLL.windowSeconds;
      this.hooks.windowOpen(extended);
    } else if (attack === 'swipe') {
      this.hooks.swipe(this.swing);
      this.swipeCd = SWIPE.cooldown;
    }
    this.enter('recover', attack ? RECOVER[attack] : 0);
  }
}
