/**
 * Hathren's M26 set piece as a pure state machine (K6a, plans/act3-K6a.md 2; the Orsk pattern): no three.js, no clock of
 * its own. The plugin derives presence from the quest and flags, feeds the player's distance and K12's calls, and steps it
 * once per fixed tick; the scene draws from `state`, `phase` and `time`.
 *
 *  absent -> nets (wake once, then the thrash loop; each cut net eases it) -> calming (locked, skippable, 38 s) -> gone.
 *
 * Nothing here waits on an event that may already have fired: `calm()` is accepted from `absent` and from either nets
 * phase, and a reload simply re-enters the nets (state is never saved; K12 re-calls `calm()` after a load with its
 * `story.m26.riteDone` set).
 */
export type HathrenBeat = 'wake' | 'thrash' | 'spray' | 'netDropped' | 'rise' | 'roar' | 'quiet' | 'dive' | 'scale' | 'gone';
export type HathrenState = 'absent' | 'nets' | 'calming' | 'gone';
/** In the nets: `waiting` (under the water until the player comes near), `waking`, `loop`. */
export type NetsPhase = 'waiting' | 'waking' | 'loop';

export const HATHREN = {
  /** Uniform size (Ysmeryth keeps 6x; taste call 2026-10-30). */
  scale: 4.5,
  /** The player within this of the shore point starts the wake. */
  wakeRadius: 60,
  /** The wake's length; then the thrash loop. */
  wakeSeconds: 12,
  /** Mouth shimmer before every water breath (design 10 row 29 telegraph). */
  shimmerSeconds: 1.0,
  /** Thrash loop: a thrash every this many seconds, a spray every `sprayEvery` (both stretched as nets are cut). */
  thrashEvery: 6,
  sprayEvery: 14,
  /** Each cut net slows the loop by this share (4 cut: x 1 + 4 * share). */
  easePerNet: 0.25,
  nets: 4,
} as const;

/** The wake's beats (seconds into the wake). */
export const WAKE_BEATS: readonly { beat: HathrenBeat; at: number }[] = [
  { beat: 'wake', at: 0 },
  { beat: 'spray', at: 6 },
  { beat: 'thrash', at: 9 },
];

/** The calm's beats (seconds into the calm). The locked part ends at `gone` (38 s, under the 40 s ruling). */
export const CALM_BEATS: readonly { beat: HathrenBeat; at: number }[] = [
  { beat: 'rise', at: 0 },
  { beat: 'roar', at: 6 },
  { beat: 'spray', at: 7.2 },
  { beat: 'quiet', at: 12 },
  { beat: 'dive', at: 26 },
  { beat: 'scale', at: 33 },
  { beat: 'gone', at: 38 },
];

export const CALM_SECONDS = CALM_BEATS[CALM_BEATS.length - 1]!.at;

export class HathrenSequence {
  private _state: HathrenState = 'absent';
  private _phase: NetsPhase = 'waiting';
  private t = 0;
  private next = 0;
  private loopT = 0;
  private nextThrash = 0;
  private nextSpray = 0;
  private readonly cut = new Set<number>();
  private queued: HathrenBeat[] = [];

  get state(): HathrenState {
    return this._state;
  }

  get phase(): NetsPhase {
    return this._phase;
  }

  /** Seconds into the current wake, loop or calm. */
  get time(): number {
    return this._state === 'nets' && this._phase === 'loop' ? this.loopT : this.t;
  }

  /** Which nets (1..4) are cut. */
  get netsCut(): ReadonlySet<number> {
    return this.cut;
  }

  /** The loop's slow-down from cut nets (1 = all four tight). */
  get ease(): number {
    return 1 + this.cut.size * HATHREN.easePerNet;
  }

  /**
   * Puts her in the nets (idempotent while there). `cut` is the set of nets already cut (K12's saved flags); with any net
   * cut the wake is skipped (she woke before the save). From `calming` this is the reload path: back to the nets.
   */
  enterNets(cut: Iterable<number> = []): void {
    if (this._state === 'gone') return;
    this.cut.clear();
    for (const n of cut) if (validNet(n)) this.cut.add(n);
    if (this._state === 'nets') return;
    this._state = 'nets';
    this._phase = this.cut.size > 0 ? 'loop' : 'waiting';
    this.t = 0;
    this.next = 0;
    this.startLoop();
  }

  /** The player is this far from the shore point: close enough starts the wake (once per entry). */
  playerDistance(d: number): void {
    if (this._state === 'nets' && this._phase === 'waiting' && Number.isFinite(d) && d <= HATHREN.wakeRadius) {
      this._phase = 'waking';
      this.t = 0;
      this.next = 0;
    }
  }

  /** A net was cut (live). False for an unknown index, a net already cut, or when she is not in the nets. */
  netCut(n: number): boolean {
    if (this._state !== 'nets' || !validNet(n) || this.cut.has(n)) return false;
    this.cut.add(n);
    this.queued.push('netDropped');
    return true;
  }

  /** Starts the calm. False while already calming or once gone. */
  calm(): boolean {
    if (this._state === 'calming' || this._state === 'gone') return false;
    this._state = 'calming';
    this.t = 0;
    this.next = 0;
    return true;
  }

  /** Gone without the sequence (the quest was abandoned or completed off-screen). No beats. */
  dismiss(): void {
    this._state = 'gone';
    this.queued = [];
  }

  /** Back to `absent` (M26 left the active set but may come back). No beats. */
  reset(): void {
    this._state = 'absent';
    this._phase = 'waiting';
    this.cut.clear();
    this.queued = [];
    this.t = 0;
    this.next = 0;
  }

  /** One tick: the beats crossed, in order. */
  step(dt: number): HathrenBeat[] {
    const out = this.queued;
    this.queued = [];
    const d = dt > 0 && Number.isFinite(dt) ? dt : 0;
    if (this._state === 'calming') {
      if (this.next === 0 && this.t === 0) out.push(...this.take(CALM_BEATS, 0));
      this.t += d;
      out.push(...this.take(CALM_BEATS, this.t));
      if (this.next >= CALM_BEATS.length) this._state = 'gone';
    } else if (this._state === 'nets') {
      if (this._phase === 'waking') {
        if (this.next === 0 && this.t === 0) out.push(...this.take(WAKE_BEATS, 0));
        this.t += d;
        out.push(...this.take(WAKE_BEATS, this.t));
        if (this.t >= HATHREN.wakeSeconds) {
          this._phase = 'loop';
          this.startLoop();
        }
      } else if (this._phase === 'loop') {
        this.loopT += d;
        if (this.loopT >= this.nextThrash) {
          out.push('thrash');
          this.nextThrash = this.loopT + HATHREN.thrashEvery * this.ease;
        }
        if (this.loopT >= this.nextSpray) {
          out.push('spray');
          this.nextSpray = this.loopT + HATHREN.sprayEvery * this.ease;
        }
      }
    }
    return out;
  }

  /** Calming only: jumps to the end, every remaining beat once, in order. */
  skip(): HathrenBeat[] {
    if (this._state !== 'calming') return [];
    const out = CALM_BEATS.slice(this.next).map((b) => b.beat);
    this.next = CALM_BEATS.length;
    this.t = CALM_SECONDS;
    this._state = 'gone';
    return out;
  }

  /** Seconds until the next loop spray (the scene opens the mouth `shimmerSeconds` before it). */
  get untilSpray(): number {
    return this._state === 'nets' && this._phase === 'loop' ? this.nextSpray - this.loopT : Infinity;
  }

  private startLoop(): void {
    this.loopT = 0;
    this.nextThrash = HATHREN.thrashEvery * 0.5;
    this.nextSpray = HATHREN.sprayEvery * 0.6;
  }

  private take(table: readonly { beat: HathrenBeat; at: number }[], t: number): HathrenBeat[] {
    const out: HathrenBeat[] = [];
    while (this.next < table.length && table[this.next]!.at <= t + 1e-9) out.push(table[this.next++]!.beat);
    return out;
  }
}

function validNet(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= HATHREN.nets;
}
