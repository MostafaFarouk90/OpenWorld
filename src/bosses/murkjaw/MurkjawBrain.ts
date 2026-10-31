import { CYCLE, MURKJAW, type MurkjawAttack } from './tuning';

export type MurkjawState =
  | 'idle'
  | 'submerged'
  | 'bulge'
  | 'strike'
  | 'surfaced'
  | 'beached'
  | 'sliding'
  | 'sinking'
  | 'broken'
  | 'dying';

/** What the brain asks the world to do (MurkjawEncounter in the game, a recorder in tests). */
export interface MurkjawHooks {
  /** The surfacing point (index into the arena's six) for this attack; the encounter knows where the player is. */
  pickPoint(attack: MurkjawAttack): number;
  /** The 1.0 s water bulge and gurgle at `point` before `attack`. */
  bulge(point: number, attack: MurkjawAttack, swingId: number, leadSeconds: number): void;
  /** The bite's and the lunge's aim locks (`CYCLE.aimLockBefore` ahead of the strike). */
  aim(swingId: number): void;
  /** The attack lands (the wave's ring starts spreading). */
  strike(attack: MurkjawAttack, swingId: number): void;
  /** A lunge reached its beach point: the jaw lies on the walkway. */
  beach(): void;
  /** He slides back off the walkway into the channel. */
  slide(): void;
  sink(): void;
  /** He is under: out of the hit lists. */
  submerged(): void;
  /** A bulge was cut short (a break or the death). */
  cancelTelegraph(swingId: number): void;
  /** A counted break: he is thrown onto the nearest walkway, stunned. */
  broken(): void;
  restorePoise(): void;
}

const EXPOSED: ReadonlySet<MurkjawState> = new Set<MurkjawState>(['surfaced', 'beached', 'sliding', 'broken']);
const JAW: ReadonlySet<MurkjawState> = new Set<MurkjawState>(['beached', 'broken']);

/**
 * Murkjaw's behaviour as a pure state machine (plans/act3-K8.md 3.1): under the water, then a 1.0 s bulge at a surfacing point,
 * then a bite, a wave or a lunge; up for a spell after a bite or a wave, beached on a walkway after a lunge; then down again.
 * A lunge comes at least every `CYCLE.lungeEvery` attacks; from phase 2 the bag holds two lunges; phase 3 chains a bite after
 * each wave. A break (the encounter lets one count only while he is exposed) beaches him stunned for `MURKJAW.breakSeconds`.
 * No mercy state.
 */
export class MurkjawBrain {
  private _state: MurkjawState = 'idle';
  private _phase = 1;
  private _attack: MurkjawAttack | null = null;
  private _point = -1;
  private t = 0;
  private swingId = 0;
  private aimed = false;
  private chained = false;
  private bag: MurkjawAttack[] = [];
  private sinceLunge = 0;
  private upFor = 0;

  constructor(
    private readonly hooks: MurkjawHooks,
    private readonly rng: () => number = Math.random,
  ) {}

  get state(): MurkjawState {
    return this._state;
  }

  get phase(): number {
    return this._phase;
  }

  /** The attack being telegraphed or struck (null between attacks). */
  get attack(): MurkjawAttack | null {
    return this._attack;
  }

  /** The current surfacing point index (-1 before the first). */
  get point(): number {
    return this._point;
  }

  /** Above the water and hittable: up after an attack, beached, sliding back or broken (and the bite's and lunge's strike). */
  get exposed(): boolean {
    if (EXPOSED.has(this._state)) return true;
    return this._state === 'strike' && this._attack !== 'wave';
  }

  /** His jaw lies on a walkway: blades reach it and it takes the jaw bonus. */
  get jawOnWalkway(): boolean {
    return JAW.has(this._state);
  }

  start(): void {
    if (this._state !== 'idle') return;
    this.enter('submerged');
  }

  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this._state === 'idle' || this._state === 'dying') return;
    this.t += dt;
    switch (this._state) {
      case 'submerged':
        if (this.t >= this.pick(CYCLE.submergedSeconds)) this.startAttack(this.nextAttack(), false);
        break;
      case 'bulge':
        if (!this.aimed && this._attack !== 'wave' && this.t >= CYCLE.bulgeSeconds - CYCLE.aimLockBefore) {
          this.aimed = true;
          this.hooks.aim(this.swingId);
        }
        if (this.t >= CYCLE.bulgeSeconds) {
          this.enter('strike');
          this.hooks.strike(this._attack!, this.swingId);
        }
        break;
      case 'strike':
        this.tickStrike();
        break;
      case 'surfaced':
        if (this.t >= this.upFor) this.sink();
        break;
      case 'beached':
        if (this.t >= CYCLE.beachedSeconds) this.slide();
        break;
      case 'sliding':
        if (this.t >= CYCLE.slideSeconds) this.sink();
        break;
      case 'sinking':
        if (this.t >= CYCLE.sinkSeconds) {
          this._attack = null;
          this.enter('submerged');
          this.hooks.submerged();
        }
        break;
      case 'broken':
        if (this.t >= MURKJAW.breakSeconds) {
          this.hooks.restorePoise();
          this.slide();
        }
        break;
      default:
        break;
    }
  }

  /** A counted poise break: he is thrown onto a walkway, stunned. False (nothing changes) while idle, under or dying. */
  onBreak(): boolean {
    if (this._state === 'idle' || this._state === 'dying') return false;
    if (this._state === 'bulge') this.hooks.cancelTelegraph(this.swingId);
    this.chained = false;
    this.enter('broken');
    this.hooks.broken();
    return true;
  }

  /** `boss.phase`. */
  onPhase(phase: number): void {
    if (phase <= this._phase || this._state === 'dying') return;
    this._phase = phase;
    this.bag = [];
  }

  /** `boss.defeated`. */
  onDefeated(): void {
    if (this._state === 'dying') return;
    if (this._state === 'bulge') this.hooks.cancelTelegraph(this.swingId);
    this.chained = false;
    this.enter('dying');
  }

  // ---- internals ----

  private tickStrike(): void {
    const a = this._attack!;
    const len = a === 'bite' ? CYCLE.biteSeconds : a === 'wave' ? CYCLE.waveSeconds : CYCLE.lungeSeconds;
    if (this.t < len) return;
    if (a === 'lunge') {
      this.enter('beached');
      this.hooks.beach();
      return;
    }
    if (a === 'wave' && this._phase >= CYCLE.chainFromPhase && !this.chained) {
      this.startAttack('bite', true);
      return;
    }
    this.upFor = a === 'wave' ? CYCLE.waveSurfacedSeconds : this.pick(CYCLE.surfacedSeconds);
    this.enter('surfaced');
  }

  private startAttack(attack: MurkjawAttack, chained: boolean): void {
    this.swingId++;
    this.aimed = false;
    this.chained = chained;
    this._attack = attack;
    // A chained bite comes from the wave's own spot.
    if (!chained) this._point = this.hooks.pickPoint(attack);
    this.enter('bulge');
    this.hooks.bulge(this._point, attack, this.swingId, CYCLE.bulgeSeconds);
  }

  /** The bag, overridden so a lunge comes at least every `lungeEvery` attacks. */
  private nextAttack(): MurkjawAttack {
    let a: MurkjawAttack;
    if (this.sinceLunge >= CYCLE.lungeEvery - 1) a = 'lunge';
    else {
      if (this.bag.length === 0) this.bag = this.shuffle(this._phase >= 2 ? ['bite', 'wave', 'lunge', 'lunge'] : ['bite', 'wave', 'lunge']);
      a = this.bag.shift()!;
    }
    this.sinceLunge = a === 'lunge' ? 0 : this.sinceLunge + 1;
    return a;
  }

  private shuffle(list: MurkjawAttack[]): MurkjawAttack[] {
    for (let i = list.length - 1; i > 0; i--) {
      const r = this.rng();
      const j = Math.min(i, Math.floor((Number.isFinite(r) ? Math.max(0, r) : 0) * (i + 1)));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  private slide(): void {
    this.enter('sliding');
    this.hooks.slide();
  }

  private sink(): void {
    this.enter('sinking');
    this.hooks.sink();
  }

  private pick(table: readonly number[]): number {
    return table[Math.min(this._phase, table.length) - 1];
  }

  private enter(next: MurkjawState): void {
    this._state = next;
    this.t = 0;
  }
}
