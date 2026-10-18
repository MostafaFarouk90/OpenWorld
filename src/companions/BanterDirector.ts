// When a companion speaks: triggers, a global cooldown, suppression and line choice (companions.md section 6,
// plans/slice-2-tobb.md sections 6 and 13). Pure; the plugin feeds it events and emits what it returns.
import { TOBB_TUNING } from './tuning';

export type BanterTrigger = 'area' | 'combatStart' | 'combatEnd' | 'elapsed';

export interface BanterLines {
  /** Place id to line keys. */
  area: Readonly<Record<string, readonly string[]>>;
  combatStart: readonly string[];
  combatEnd: readonly string[];
  elapsed: readonly string[];
}

export interface Bark {
  lineKey: string;
  trigger: BanterTrigger;
}

export type BanterTuning = Pick<
  typeof TOBB_TUNING,
  'barkCooldownSeconds' | 'areaWaitSeconds' | 'areaRepeatSeconds' | 'elapsedMinSeconds' | 'elapsedMaxSeconds' | 'bossQuietSeconds'
>;

/** Draws without repeats until the pool is used up; never the same line twice in a row across a refill. */
export class LineBag {
  private bag: string[] = [];
  private last: string | null = null;

  constructor(
    private readonly lines: readonly string[],
    private readonly rng: () => number,
  ) {}

  next(): string | null {
    if (this.lines.length === 0) return null;
    if (this.bag.length === 0) {
      this.bag = [...this.lines];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1)) % (i + 1);
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.last) {
        [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1], this.bag[0]];
      }
    }
    this.last = this.bag.pop()!;
    return this.last;
  }
}

export class BanterDirector {
  private clock = 0;
  /** Clock time before which nothing is said. */
  private quietUntil = 0;
  private active = false;
  private readonly reasons = new Set<string>();
  private readonly bosses = new Set<string>();
  private bossQuietUntil = 0;
  private pendingArea: { place: string; since: number } | null = null;
  private readonly placeSaidAt = new Map<string, number>();
  private elapsedLeft: number;
  private readonly bags = new Map<string, LineBag>();

  constructor(
    private readonly lines: BanterLines,
    private readonly rng: () => number = Math.random,
    private readonly tuning: BanterTuning = TOBB_TUNING,
  ) {
    this.elapsedLeft = this.rollElapsed();
  }

  /** Joined, visible and not waiting. Going inactive drops a pending area bark; the elapsed timer pauses. */
  setActive(on: boolean): void {
    this.active = on;
    if (!on) this.pendingArea = null;
  }

  /** Named suppressions: `dialogue`, `cutscene`, `modal:<id>`, `death`. */
  suppress(reason: string, on: boolean): void {
    if (on) this.reasons.add(reason);
    else this.reasons.delete(reason);
  }

  bossStarted(bossId: string): void {
    this.bosses.add(bossId);
  }

  /** `boss.defeated`, `boss.released` or `boss.ended`; quiet for `bossQuietSeconds` after the last boss ends. */
  bossEnded(bossId: string): void {
    if (!this.bosses.delete(bossId)) return;
    if (this.bosses.size === 0) this.bossQuietUntil = this.clock + this.tuning.bossQuietSeconds;
  }

  /** A load clears boss and death suppression so neither can stick. */
  saveLoaded(): void {
    this.bosses.clear();
    this.bossQuietUntil = 0;
    this.reasons.delete('death');
    this.pendingArea = null;
  }

  get suppressed(): boolean {
    return this.reasons.size > 0 || this.bosses.size > 0 || this.clock < this.bossQuietUntil;
  }

  /** An area bark: said now if allowed, else waits up to `areaWaitSeconds`. Known places only, once per repeat window. */
  area(place: string): Bark | null {
    if (!this.active || !this.lines.area[place]?.length) return null;
    const said = this.placeSaidAt.get(place);
    if (said !== undefined && this.clock - said < this.tuning.areaRepeatSeconds) return null;
    if (this.canSpeak()) return this.say('area', place);
    this.pendingArea = { place, since: this.clock };
    return null;
  }

  /** Combat barks are dropped when they cannot be said now. */
  combat(edge: 'start' | 'end'): Bark | null {
    if (!this.active || !this.canSpeak()) return null;
    return this.say(edge === 'start' ? 'combatStart' : 'combatEnd');
  }

  tick(dt: number): Bark | null {
    if (!(dt > 0)) return null;
    this.clock += dt;
    if (!this.active) return null;
    this.elapsedLeft -= dt;
    if (this.pendingArea && this.clock - this.pendingArea.since > this.tuning.areaWaitSeconds) this.pendingArea = null;
    if (!this.canSpeak()) return null;
    if (this.pendingArea) {
      const place = this.pendingArea.place;
      this.pendingArea = null;
      return this.say('area', place);
    }
    if (this.elapsedLeft <= 0) return this.say('elapsed');
    return null;
  }

  private canSpeak(): boolean {
    return this.active && !this.suppressed && this.clock >= this.quietUntil;
  }

  private say(trigger: BanterTrigger, place?: string): Bark | null {
    const pool = trigger === 'area' ? `area.${place}` : trigger;
    let bag = this.bags.get(pool);
    if (!bag) {
      const lines = trigger === 'area' ? this.lines.area[place!] ?? [] : this.lines[trigger];
      bag = new LineBag(lines, this.rng);
      this.bags.set(pool, bag);
    }
    const lineKey = bag.next();
    if (!lineKey) return null;
    this.quietUntil = this.clock + this.tuning.barkCooldownSeconds;
    // Any bark resets the elapsed timer: "every 6 to 9 minutes" means minutes of silence.
    this.elapsedLeft = this.rollElapsed();
    if (place) this.placeSaidAt.set(place, this.clock);
    return { lineKey, trigger };
  }

  private rollElapsed(): number {
    const { elapsedMinSeconds: lo, elapsedMaxSeconds: hi } = this.tuning;
    return lo + Math.min(1, Math.max(0, this.rng())) * (hi - lo);
  }
}
