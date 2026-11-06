// The Singing Slag's puzzle (Act 4 L1 PR 2, plans/act4-L1.md section 17): three phrases struck in order on the glass
// pillars, R13's WaterSong pattern. The first press on the strike stone starts a phrase (a one-beat count-in), later presses
// strike. A failed phrase replays its plaque (the pillars ring the pattern); after two fails the plaque hums it and the next
// run shows each pillar a beat early (the lesson); after three the window widens and after five the phrase is struck for
// the player. Pure: the plugin passes times, keys and the persisted counts through the ports.
import type { Judgement } from '../../gear/rhythm';
import { AdaptiveBeatClock, type BeatClock } from '../../shrine/beat';
import { ChimeRun, type ChimeOutcome } from './chimeRun';
import { CHIME_PHRASES, CHIME_TUNING as T } from './phrases';

export interface ChimePorts {
  now(): number;
  /** A fresh step clock (a metronome at the Dust Chant's tempo by default). */
  makeClock?(): BeatClock;
  /** Phrases struck so far, 0 to 3 (persisted). */
  phrase(): number;
  setPhrase(n: number): void;
  /** Fails on the current phrase (persisted; back to 0 when a phrase is struck). */
  fails(): number;
  setFails(n: number): void;
  toast(key: string): void;
  /** The third phrase rang true: light the shrine (once). */
  solved(): void;
}

export type ChimeMode = 'run' | 'replay';

/** What the HUD strip draws. */
export interface ChimeView {
  mode: ChimeMode;
  /** 0-based phrase index. */
  phrase: number;
  steps: readonly number[];
  pillars: readonly number[];
  keys: readonly number[];
  judged: (Judgement | null)[];
  /** Playhead in steps (negative in the count-in). */
  position: number;
  stepsInBar: number;
  wide: boolean;
  lesson: boolean;
  hum: boolean;
}

export const stepMsAt = (bpm: number = T.bpm, divisions: number = T.divisions): number => 60000 / bpm / divisions;

export class ChimePuzzle {
  private run: ChimeRun | null = null;
  private replay: { phrase: number; startMs: number; hum: boolean } | null = null;
  private wide = false;
  private lesson = false;
  readonly stepMs = stepMsAt();

  constructor(private readonly p: ChimePorts) {}

  get running(): boolean {
    return this.run !== null;
  }

  get replaying(): boolean {
    return this.replay !== null;
  }

  get done(): boolean {
    return this.p.phrase() >= CHIME_PHRASES.length;
  }

  private clock(): BeatClock {
    return this.p.makeClock?.() ?? new AdaptiveBeatClock({ beat: () => null, toAudioTime: () => undefined, nowMs: () => this.p.now() }, T.bpm, T.divisions);
  }

  private current(): number {
    return Math.max(0, Math.min(CHIME_PHRASES.length - 1, Math.floor(this.p.phrase())));
  }

  /** Attack key `key` (1 to 4) pressed on the strike stone. Returns what it did. */
  press(key: number, tMs: number = this.p.now()): ChimeOutcome | 'started' | 'busy' | 'done' {
    if (this.done) return 'done';
    if (this.replay) return 'busy';
    if (!this.run) {
      const fails = this.p.fails();
      this.wide = fails >= T.widenAfter;
      this.lesson = fails >= T.lessonAfter;
      const n = this.current();
      this.run = new ChimeRun(this.clock(), CHIME_PHRASES[n]!, tMs, { stepMs: this.stepMs, ...(this.wide ? { goodMs: T.wideGoodMs } : {}) });
      this.p.toast(`waste.chime.phrase.${n + 1}`);
      return 'started';
    }
    return this.run.strike(tMs, key);
  }

  /** Ends a replay that has rung out (the plugin calls it before a tick's presses, so the first press after it counts). */
  expireReplay(tMs: number = this.p.now()): void {
    if (this.replay && (tMs - this.replay.startMs) / this.stepMs - T.leadSteps >= 16) this.replay = null;
  }

  /** Call a few times a second: judges a phrase once it is over and ends a replay. */
  update(tMs: number = this.p.now()): void {
    this.expireReplay(tMs);
    const run = this.run;
    if (!run || !run.finished(tMs)) return;
    const r = run.result(tMs);
    this.run = null;
    const n = this.current();
    const fails = this.p.fails();
    if ((r.judged.every((j) => j !== 'miss') && r.strays <= T.straysAllowed) || fails >= T.assistAfter) {
      this.p.setFails(0);
      this.p.setPhrase(n + 1);
      if (n + 1 >= CHIME_PHRASES.length) {
        this.p.toast('waste.chime.solved');
        this.p.solved();
      } else this.p.toast(fails >= T.assistAfter ? 'waste.chime.assisted' : 'waste.chime.rang');
      return;
    }
    this.p.setFails(fails + 1);
    const hum = fails + 1 >= T.lessonAfter;
    this.replay = { phrase: n, startMs: tMs, hum };
    this.p.toast(fails + 1 >= T.assistAfter ? 'waste.chime.assist' : hum ? 'waste.chime.hum' : 'waste.chime.falter');
  }

  /** The strip as the HUD draws it, or null when nothing plays. */
  view(tMs: number = this.p.now()): ChimeView | null {
    if (this.replay) {
      const ph = CHIME_PHRASES[this.replay.phrase]!;
      const pos = (tMs - this.replay.startMs) / this.stepMs - T.leadSteps;
      return { mode: 'replay', phrase: this.replay.phrase, ...ph, judged: ph.steps.map(() => null), position: pos, stepsInBar: 16, wide: false, lesson: false, hum: this.replay.hum };
    }
    if (!this.run) return null;
    const n = this.current();
    const ph = CHIME_PHRASES[n]!;
    return { mode: 'run', phrase: n, ...ph, judged: this.run.judged(tMs), position: this.run.position(tMs), stepsInBar: 16, wide: this.wide, lesson: this.lesson, hum: false };
  }

  /**
   * How bright each pillar (index 0 to 5 for pillars 1 to 6) is now, 0 to 1: a struck pillar rings at 1, a replay rings
   * the pattern, and the cue for the next strike shows at 0.5 one step early (one beat early in the lesson).
   */
  glow(tMs: number = this.p.now()): number[] {
    const out = [0, 0, 0, 0, 0, 0];
    const v = this.view(tMs);
    if (!v) return out;
    const ringFor = (pillar: number, since: number) => {
      if (since >= 0 && since <= T.ringSteps) out[pillar - 1] = Math.max(out[pillar - 1]!, 1 - since / (T.ringSteps * 2));
    };
    if (v.mode === 'replay') {
      v.steps.forEach((s, k) => ringFor(v.pillars[k]!, v.position - s));
      return out;
    }
    const lead = v.lesson ? T.leadSteps : 1;
    v.steps.forEach((s, k) => {
      if (v.judged[k] === null && v.position >= s - lead && v.position <= s + 0.5) out[v.pillars[k]! - 1] = Math.max(out[v.pillars[k]! - 1]!, 0.5);
    });
    for (const [k, at] of this.run!.struck()) ringFor(v.pillars[k]!, (tMs - at) / this.stepMs);
    return out;
  }

  /** A load, a menu or leaving the stone: any phrase under way starts over (its fails stand). */
  reset(): void {
    this.run = null;
    this.replay = null;
  }
}
