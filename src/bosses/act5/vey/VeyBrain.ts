// Morcant Vey's behaviour as a pure state machine (plans/act5-N6.md section 2). He closes in and fights like a better Knight: a
// three-hit fire-sword combo (each hit after a 0.5 s glow; the third can be parried), and a shockwave every third attack or when
// Cael stands off. A poise break staggers him, then the dragon-heart surge: a roar, a tell, a 6 m fire ring, then 3 s of faster
// combos. The Spare window (the fourth break) makes him kneel; a lapsed window and he rises and fights on, as Redmane does.
// It holds no world state: the encounter feeds it the registry's events and a per-tick sense, and carries out its hooks.
import { COMBO, RHYTHM, SHOCKWAVE, SURGE, VEY, type VeyMoveDef } from './tuning';

export type VeyState =
  | 'idle'
  | 'approach'
  | 'glow'
  | 'between'
  | 'shockTell'
  | 'shockRing'
  | 'recover'
  | 'parried'
  | 'broken'
  | 'roar'
  | 'surgeTell'
  | 'window'
  | 'spared'
  | 'dying';

export interface VeySense {
  /** Horizontal distance, his feet to Cael's (m). */
  dist: number;
}

/** What the brain asks the world to do (VeyEncounter in the game, a recorder in tests). */
export interface VeyHooks {
  /** A combo hit's glow, the shockwave's ring or the surge's tell begins; `leadSeconds` until the effect. */
  telegraph(move: VeyMoveDef | typeof SHOCKWAVE | typeof SURGE, swingId: number, leadSeconds: number): void;
  /** Combo hit `index` (0..2) lands now; returns true when Cael parried it. */
  strike(index: number, swingId: number): boolean;
  shockwave(swingId: number): void;
  /** Every tick of the growing ring (0..1). */
  shockTick(swingId: number, t: number): void;
  surgeRoar(): void;
  surgeBurst(swingId: number): void;
  stagger(): void;
  window(): void;
  rise(): void;
  restorePoise(): void;
}

const TERMINAL: ReadonlySet<VeyState> = new Set<VeyState>(['spared', 'dying']);
const BREAKABLE: ReadonlySet<VeyState> = new Set<VeyState>(['idle', 'approach', 'glow', 'between', 'shockTell', 'shockRing', 'recover', 'parried']);

export class VeyBrain {
  private _state: VeyState = 'idle';
  private t = 0;
  private swingId = 0;
  private hit = 0;
  private attacks = 0;
  private gap = 0;
  private recoverFor = 0;
  private standOff = 0;
  private fast = 0;
  private started = false;
  /** Breaks seen (the surge follows each but the last). */
  private breaks = 0;
  private lastBreak = false;

  constructor(private readonly hooks: VeyHooks) {}

  get state(): VeyState {
    return this._state;
  }

  /** He walks toward Cael this tick. */
  get approaching(): boolean {
    return this._state === 'approach';
  }

  /** He turns toward Cael this tick (not mid-swing once the glow has run half, not staggered or kneeling). */
  get turning(): boolean {
    const s = this._state;
    return s === 'approach' || s === 'idle' || s === 'recover' || s === 'between' || (s === 'glow' && this.t < COMBO.hits[this.hit]!.windup * 0.5);
  }

  /** Seconds of faster combos left (tests, the look). */
  get fastLeft(): number {
    return this.fast;
  }

  /** The roar and the surge tell are invulnerable (his poise and health do not move). */
  get invulnerable(): boolean {
    return this._state === 'roar';
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.enter('idle');
    this.gap = RHYTHM.first;
  }

  tick(dt: number, sense: VeySense): void {
    if (!this.started || TERMINAL.has(this._state) || !(dt > 0)) return;
    this.t += dt;
    this.fast = Math.max(0, this.fast - dt);
    this.standOff = sense.dist > SHOCKWAVE.standOff ? this.standOff + dt : 0;
    const k = this.fast > 0 ? SURGE.fastScale : 1;
    switch (this._state) {
      case 'idle':
      case 'approach': {
        this.gap -= dt;
        const close = sense.dist <= COMBO.startRange;
        if (this.gap <= 0 && this.standOff >= SHOCKWAVE.standOffSeconds) {
          this.beginShock();
          return;
        }
        if (this.gap <= 0 && close) {
          this.attacks++;
          if (this.attacks % SHOCKWAVE.everyNth === 0 && this.fast <= 0) this.beginShock();
          else this.beginCombo();
          return;
        }
        const want: VeyState = sense.dist > VEY.preferredDistance + 0.2 ? 'approach' : 'idle';
        if (want !== this._state) this._state = want;
        return;
      }
      case 'glow': {
        const move = COMBO.hits[this.hit]!;
        if (this.t < move.windup) return;
        const parried = this.hooks.strike(this.hit, this.swingId);
        if (this._state !== 'glow') return; // a hook may have broken him
        if (parried && this.hit === COMBO.parryIndex) {
          this.enter('parried');
          return;
        }
        if (this.hit >= COMBO.hits.length - 1) {
          this.recoverFor = COMBO.recover * k;
          this.enter('recover');
          return;
        }
        this.enter('between');
        return;
      }
      case 'between':
        if (this.t >= COMBO.between * k) this.glowHit(this.hit + 1);
        return;
      case 'shockTell':
        if (this.t < SHOCKWAVE.windup) return;
        this.hooks.shockwave(this.swingId);
        this.enter('shockRing');
        return;
      case 'shockRing': {
        this.hooks.shockTick(this.swingId, Math.min(1, this.t / SHOCKWAVE.growSeconds));
        if (this.t >= SHOCKWAVE.growSeconds) {
          this.recoverFor = SHOCKWAVE.recover;
          this.enter('recover');
        }
        return;
      }
      case 'recover':
        if (this.t >= this.recoverFor) this.toIdle(k);
        return;
      case 'parried':
        if (this.t >= COMBO.parriedSeconds) this.toIdle(1);
        return;
      case 'broken':
        if (this.t < RHYTHM.breakSeconds) return;
        this.hooks.restorePoise();
        if (this.lastBreak) return; // the window state follows from the registry
        this.enter('roar');
        this.hooks.surgeRoar();
        return;
      case 'roar':
        if (this.t < SURGE.roarSeconds) return;
        this.swingId++;
        this.enter('surgeTell');
        this.hooks.telegraph(SURGE, this.swingId, SURGE.windup);
        return;
      case 'surgeTell':
        if (this.t < SURGE.windup) return;
        this.hooks.surgeBurst(this.swingId);
        this.fast = SURGE.fastSeconds;
        this.toIdle(SURGE.fastScale);
        return;
      case 'window':
        return;
    }
  }

  /** `boss.break` for him: stagger (the surge follows, unless it was the last break). */
  onBreak(last: boolean): void {
    if (TERMINAL.has(this._state)) return;
    this.breaks++;
    this.lastBreak = last;
    if (!BREAKABLE.has(this._state) && this._state !== 'window' && this._state !== 'broken') {
      // Mid-surge: the surge plays out; the stagger is skipped (he is invulnerable then).
      return;
    }
    this.enter('broken');
    this.hooks.stagger();
  }

  /** The registry's window opened or closed. Closed without an outcome: he rises and fights on. */
  onReleaseWindow(open: boolean): void {
    if (TERMINAL.has(this._state)) return;
    if (open) {
      this.enter('window');
      this.hooks.window();
      return;
    }
    if (this._state === 'window') {
      this.hooks.rise();
      this.hooks.restorePoise();
      this.lastBreak = false;
      this.toIdle(1);
    }
  }

  onOutcome(kind: 'spared' | 'defeated'): void {
    this.enter(kind === 'spared' ? 'spared' : 'dying');
  }

  // ---- internals ----

  private enter(s: VeyState): void {
    this._state = s;
    this.t = 0;
  }

  private toIdle(k: number): void {
    this.gap = RHYTHM.gap * k;
    this.enter('idle');
  }

  private beginCombo(): void {
    this.glowHit(0);
  }

  private glowHit(i: number): void {
    this.hit = i;
    this.swingId++;
    this.enter('glow');
    const move = COMBO.hits[i]!;
    this.hooks.telegraph(move, this.swingId, move.windup);
  }

  private beginShock(): void {
    this.standOff = 0;
    this.swingId++;
    this.enter('shockTell');
    this.hooks.telegraph(SHOCKWAVE, this.swingId, SHOCKWAVE.windup);
  }
}
