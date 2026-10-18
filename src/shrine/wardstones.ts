import type { BeatClock } from './beat';
import { SHRINE_TUNING } from './tuning';

const W = SHRINE_TUNING.wardstones;

export type MissReason = 'early' | 'late' | 'order';

export interface StonePos {
  /** 1..5, west to east. */
  index: number;
  x: number;
  z: number;
}

export interface WardstonePorts {
  clock: BeatClock;
  stones(): readonly StonePos[];
  player(): { x: number; z: number; yaw: number };
  isStruck(index: number): boolean;
  setStruck(index: number, on: boolean): void;
  setAllDone(): void;
  emitStruck(index: number, errorMs: number): void;
  emitMissed(index: number, reason: MissReason): void;
  emitComplete(): void;
  /** Bare SFX keys `sfx.wardstone.<n>` and `sfx.wardstone.miss`; thread 9 registers them. */
  play(key: string): void;
}

interface Phrase {
  hits: number;
  lastIndex: number;
  errors: number[];
}

/**
 * The M05 rhythm (plans/slice-2-shrine-warmth.md section 4). Each stone needs a phrase of three
 * strikes on three consecutive beats; a miss resets that stone only; stones go west to east.
 * `wardstone.struck` fires once per stone, when its phrase completes.
 */
export class Wardstones {
  private readonly phrases = new Map<number, Phrase>();
  private gen: number;
  private listenUntil = Number.NEGATIVE_INFINITY;
  private lastSource;

  constructor(private readonly ports: WardstonePorts) {
    this.gen = ports.clock.generation();
    this.lastSource = ports.clock.source();
  }

  /** Index of the next stone to strike, or null once all are struck. */
  nextIndex(): number | null {
    for (let i = 1; i <= W.count; i++) if (!this.ports.isStruck(i)) return i;
    return null;
  }

  /** In-progress hits on a stone (0 when idle). */
  progress(index: number): number {
    return this.phrases.get(index)?.hits ?? 0;
  }

  reset(): void {
    this.phrases.clear();
  }

  /** A key-1 press at `tMs`. Returns what happened, for tests and the visuals. */
  strike(tMs: number): 'none' | 'ignored' | 'hit' | 'complete' | 'miss' | 'order' {
    const stone = this.stoneInReach();
    if (!stone) return 'none';
    if (this.ports.isStruck(stone.index)) return 'ignored';
    this.syncSource(tMs);
    const next = this.nextIndex();
    if (next !== null && stone.index > next) {
      this.ports.emitMissed(stone.index, 'order');
      this.ports.play('sfx.wardstone.miss');
      return 'order';
    }
    const at = this.ports.clock.locate(tMs);
    if (at.index <= this.listenUntil) return 'ignored';
    if (Math.abs(at.errorMs) > W.windowMs) {
      this.miss(stone.index, at.errorMs < 0 ? 'early' : 'late');
      return 'miss';
    }
    const p = this.phrases.get(stone.index);
    if (p && at.index === p.lastIndex) return 'ignored'; // a second press on the same beat
    if (p && at.index !== p.lastIndex + 1) {
      this.miss(stone.index, 'late'); // a beat went by without a strike
      return 'miss';
    }
    const phrase = p ?? { hits: 0, lastIndex: at.index - 1, errors: [] };
    phrase.hits++;
    phrase.lastIndex = at.index;
    phrase.errors.push(at.errorMs);
    this.phrases.set(stone.index, phrase);
    this.ports.play(`sfx.wardstone.${stone.index}`);
    if (phrase.hits < W.phraseLength) return 'hit';
    this.phrases.delete(stone.index);
    this.ports.setStruck(stone.index, true);
    const mean = phrase.errors.reduce((a, b) => a + b, 0) / phrase.errors.length;
    this.ports.emitStruck(stone.index, mean);
    if (this.nextIndex() === null) {
      this.ports.setAllDone();
      this.ports.emitComplete();
    }
    return 'complete';
  }

  /** Per tick: a started phrase whose next beat has gone by unstruck is a late miss. */
  update(tMs: number): void {
    this.syncSource(tMs);
    if (this.phrases.size === 0) return;
    const passed = this.ports.clock.passedIndex(tMs, W.windowMs);
    if (passed <= this.listenUntil) return;
    for (const [index, p] of [...this.phrases]) {
      if (passed >= p.lastIndex + 1) this.miss(index, 'late');
    }
  }

  /** On a source switch or a re-sync: drop every phrase quietly and sit out one beat. */
  private syncSource(tMs: number): void {
    const gen = this.ports.clock.generation();
    const source = this.ports.clock.source();
    if (gen === this.gen && source === this.lastSource) return;
    this.gen = gen;
    this.lastSource = source;
    this.phrases.clear();
    const near = this.ports.clock.locate(tMs);
    const upcoming = near.errorMs < 0 ? near.index : near.index + 1;
    this.listenUntil = upcoming + W.listenBeats - 1;
  }

  private miss(index: number, reason: MissReason): void {
    this.phrases.delete(index);
    this.ports.emitMissed(index, reason);
    this.ports.play('sfx.wardstone.miss');
  }

  private stoneInReach(): StonePos | null {
    const p = this.ports.player();
    const half = (W.strikeConeDegrees * Math.PI) / 360;
    let best: StonePos | null = null;
    let bestD = Infinity;
    for (const s of this.ports.stones()) {
      const dx = s.x - p.x;
      const dz = s.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > W.strikeRange || d >= bestD) continue;
      // Yaw 0 faces -Z (world-layout contract): the facing vector is (-sin yaw, -cos yaw).
      if (d > 1e-6) {
        const dot = (dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / d;
        if (Math.acos(Math.max(-1, Math.min(1, dot))) > half) continue;
      }
      best = s;
      bestD = d;
    }
    return best;
  }
}
