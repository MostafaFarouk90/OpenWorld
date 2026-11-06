// The Bellows-Engine's state machine (plans/act4-L6.md section 2). Pure: no three.js, no services; the encounter implements the
// hooks and feeds the sense each tick. States: idle (before start), ready (waiting for the next attack), telegraph (the 1.0 s
// draw-back or vent flash), jet (the steam jet is blowing), recover, vented (a bar broke: 8 s stalled), sealed (a phase change:
// the coal volleys), dying.
import { COAL, PUNCH, RHYTHM, STEAM, TELEGRAPH_SECONDS, VENT } from './tuning';

export type BellowsAttack = 'punch' | 'steam' | 'lob';
export type BellowsState = 'idle' | 'ready' | 'telegraph' | 'jet' | 'recover' | 'vented' | 'sealed' | 'dying';

export interface BellowsHooks {
  /** A punch or jet telegraph begins (`lead` seconds before it lands). */
  telegraph(attack: 'punch' | 'steam', swingId: number, lead: number): void;
  cancelTelegraph(swingId: number): void;
  punch(swingId: number): void;
  jetStart(swingId: number): void;
  /** One damage tick of the jet. */
  jetTick(swingId: number): void;
  jetEnd(): void;
  /** One coal shot fired now at the player's feet, landing after COAL.flightSeconds (`offset` -1, 0, 1: the flanking pattern). */
  coal(swingId: number, offset: number): void;
  ventStart(): void;
  ventEnd(): void;
  sealStart(): void;
  sealEnd(): void;
}

export interface BellowsSense {
  /** Horizontal metres from the engine's centre to the player. */
  dist: number;
}

export class BellowsBrain {
  private _state: BellowsState = 'idle';
  private t = 0;
  private wait: number = RHYTHM.first;
  private swing = 0;
  private attack: BellowsAttack | null = null;
  private attacksInReach = 0;
  private jetTickT = 0;
  private _phase = 1;
  /** A phase change arrived while vented: seal when the vent ends. */
  private pendingSeal = false;
  private volleysFired = 0;

  constructor(private readonly hooks: BellowsHooks) {}

  get state(): BellowsState {
    return this._state;
  }

  get phase(): number {
    return this._phase;
  }

  /** The attack being telegraphed or performed (tests). */
  get current(): BellowsAttack | null {
    return this.attack;
  }

  /** Can take a valve's break now (not stalled, sealed, dying or idle). */
  get canBreak(): boolean {
    return this._state === 'ready' || this._state === 'telegraph' || this._state === 'jet' || this._state === 'recover';
  }

  /** Sealed for the volleys: immune. */
  get sealed(): boolean {
    return this._state === 'sealed';
  }

  /** A phase change waits for the vent to end. */
  get sealPending(): boolean {
    return this.pendingSeal;
  }

  get vented(): boolean {
    return this._state === 'vented';
  }

  /** Seconds left in the current state (tests). */
  get timeLeft(): number {
    return Math.max(0, this.wait - this.t);
  }

  start(): void {
    if (this._state !== 'idle') return;
    this.enter('ready', RHYTHM.first);
  }

  /** The attack for the range: a punch close in (every third a jet), a jet at middle range, a lobbed coal shot past it. */
  static pick(dist: number, attacksInReach: number): BellowsAttack {
    if (dist > STEAM.range) return 'lob';
    if (dist > PUNCH.reach) return 'steam';
    return (attacksInReach + 1) % STEAM.everyNth === 0 ? 'steam' : 'punch';
  }

  tick(dt: number, sense: BellowsSense): void {
    if (!(dt > 0) || this._state === 'idle' || this._state === 'dying') return;
    this.t += dt;
    switch (this._state) {
      case 'ready':
        if (this.t >= this.wait) this.begin(sense);
        break;
      case 'telegraph':
        if (this.t >= this.wait) this.land();
        break;
      case 'jet':
        this.jetTickT += dt;
        while (this.jetTickT >= STEAM.tickSeconds && this._state === 'jet') {
          this.jetTickT -= STEAM.tickSeconds;
          this.hooks.jetTick(this.swing);
        }
        if (this._state === 'jet' && this.t >= this.wait) {
          this.hooks.jetEnd();
          this.enter('recover', STEAM.recover);
        }
        break;
      case 'recover':
        if (this.t >= this.wait) this.enter('ready', this.gap());
        break;
      case 'vented':
        if (this.t >= this.wait) {
          this.hooks.ventEnd();
          if (this.pendingSeal) this.seal();
          else this.enter('ready', this.gap() * 0.5);
        }
        break;
      case 'sealed':
        this.tickSeal();
        break;
    }
  }

  /** A bar broke (a valve): stop everything and stall for the vent. */
  onBreak(): void {
    if (this._state === 'idle' || this._state === 'dying') return;
    this.stopAttack();
    this.enter('vented', VENT.seconds);
    this.hooks.ventStart();
  }

  /** The registry moved to `phase`: seal for the volleys now, or once a vent ends. */
  onPhase(phase: number): void {
    if (phase <= this._phase) return;
    this._phase = phase;
    if (this._state === 'idle' || this._state === 'dying') return;
    if (this._state === 'vented') {
      this.pendingSeal = true;
      return;
    }
    this.stopAttack();
    this.seal();
  }

  onDefeated(): void {
    this.stopAttack();
    this._state = 'dying';
  }

  /** Ends any telegraph or jet without landing it (a reset or a break). */
  stopAttack(): void {
    if (this._state === 'telegraph') this.hooks.cancelTelegraph(this.swing);
    if (this._state === 'jet') this.hooks.jetEnd();
    this.attack = null;
  }

  // ---- internals ----

  private gap(): number {
    return RHYTHM.gap[Math.min(RHYTHM.gap.length, this._phase) - 1];
  }

  private enter(state: BellowsState, wait: number): void {
    this._state = state;
    this.t = 0;
    this.wait = wait;
  }

  private begin(sense: BellowsSense): void {
    const attack = BellowsBrain.pick(sense.dist, this.attacksInReach);
    this.swing++;
    this.attack = attack;
    if (attack === 'lob') {
      this.hooks.coal(this.swing, 0);
      this.attack = null;
      this.enter('recover', COAL.flightSeconds + COAL.recover);
      return;
    }
    this.attacksInReach++;
    this.enter('telegraph', TELEGRAPH_SECONDS);
    this.hooks.telegraph(attack, this.swing, TELEGRAPH_SECONDS);
  }

  private land(): void {
    if (this.attack === 'punch') {
      this.hooks.punch(this.swing);
      this.attack = null;
      this.enter('recover', PUNCH.recover);
      return;
    }
    // The first tick lands as the jet opens, then one every STEAM.tickSeconds.
    this.jetTickT = 0;
    this.enter('jet', STEAM.seconds);
    this.hooks.jetStart(this.swing);
    this.hooks.jetTick(this.swing);
  }

  private seal(): void {
    this.pendingSeal = false;
    this.volleysFired = 0;
    const last = COAL.volleyAt[COAL.volleyAt.length - 1];
    this.enter('sealed', last + COAL.flightSeconds + COAL.sealTail);
    this.hooks.sealStart();
  }

  private tickSeal(): void {
    while (this.volleysFired < COAL.volleyAt.length && this.t >= COAL.volleyAt[this.volleysFired]) {
      this.volleysFired++;
      this.swing++;
      for (let i = 0; i < COAL.perVolley; i++) this.hooks.coal(this.swing, i === 0 ? 0 : i % 2 === 1 ? -1 : 1);
    }
    if (this.t >= this.wait) {
      this.hooks.sealEnd();
      this.enter('ready', this.gap());
    }
  }
}
