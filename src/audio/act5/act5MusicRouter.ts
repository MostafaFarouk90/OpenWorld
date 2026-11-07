import { SIEGE_MIX_KEY } from '../../music/act5Slots';
import { SIEGE_LULL_MIX_KEY, ULTHRED_BUILD_MIX_KEY, ULTHRED_DROP_MIX_KEY } from '../../music/act5Tracks';

/** Bars the phase 3 drop holds, and the bars the build takes (Ulthred's phase 3: "drops to the bass and a heartbeat kick, then builds back in one bar"). */
export const DROP_BARS = 2;
export const BUILD_BARS = 1;
/** A siege lull with no new wave for this long hands the music back (the siege is over, or paused). */
export const LULL_TIMEOUT_S = 90;
/** Without a beat for this long the drop is skipped: audio is locked or the clock stopped, and the plain phase 3 mix plays. */
const BEAT_WAIT_S = 1.5;

export interface Act5MusicPorts {
  /** `music.setBoss`; absent when there is no music service. */
  setBoss(on: boolean, id?: string): void;
  /** `music.onBeat`; returns the unsubscribe. */
  onBeat(cb: (b: { beat: number }) => void): () => void;
}

/**
 * The Caldera's music cues that are more than one key (N8 plan sections 2 and 3):
 *  - the siege mix and its lull between waves, keyed on the siege events (R27's tunnel siege may not push the `siege`
 *    movement mode); the mode only starts the mix when no wave event has;
 *  - Ulthred's phase 3: the drop to the bass and the heartbeat, then the one-bar build, both stepped on bar lines.
 * Everything goes through `music.setBoss(on, id)`, started before the previous one is released so no ending sting plays
 * between two of them. A load clears all of it.
 */
export class Act5MusicRouter {
  private mix: 'siege' | 'lull' | null = null;
  private viaMode = false;
  private lullFor = 0;
  private step: { kind: 'wait' | 'drop' | 'build'; bars: number; idle: number } | null = null;
  private unbeat: (() => void) | null = null;
  /** The boss-mix ids this router has started and not released. */
  private readonly held = new Set<string>();

  constructor(private readonly ports: Act5MusicPorts) {}

  // --- the siege ------------------------------------------------------------------------------

  waveStarted(): void {
    this.viaMode = false;
    this.lullFor = 0;
    this.to('siege');
  }

  waveCleared(): void {
    this.viaMode = false;
    this.lullFor = 0;
    this.to('lull');
  }

  /** `movement.mode`: the siege mode starts the mix if no wave event has; leaving it ends the siege music. */
  modeChanged(e: { mode: string; previous: string }): void {
    if (e.mode === 'siege' && this.mix === null) {
      this.viaMode = true;
      this.to('siege');
    } else if (e.previous === 'siege' && e.mode !== 'siege') {
      this.to(null);
    }
  }

  // --- Ulthred ---------------------------------------------------------------------------------

  bossPhase(e: { bossId: string; phase: number }): void {
    if (e.bossId !== 'ulthred') return;
    this.clearStep();
    if (e.phase === 3) {
      this.step = { kind: 'wait', bars: 0, idle: 0 };
      this.unbeat = this.ports.onBeat((b) => this.onBeat(b.beat));
    }
  }

  /** The fight is over (defeated, released, despawned or reset): the stepping mixes go. */
  bossOver(bossId: string): void {
    if (bossId === 'ulthred') this.clearStep();
  }

  private onBeat(beat: number): void {
    const s = this.step;
    if (!s || beat !== 0) return; // only bar lines count
    s.idle = 0;
    if (s.kind === 'wait') {
      this.start(ULTHRED_DROP_MIX_KEY);
      s.kind = 'drop';
      s.bars = 0;
      return;
    }
    s.bars++;
    if (s.kind === 'drop' && s.bars >= DROP_BARS) {
      this.start(ULTHRED_BUILD_MIX_KEY);
      this.release(ULTHRED_DROP_MIX_KEY);
      s.kind = 'build';
      s.bars = 0;
    } else if (s.kind === 'build' && s.bars >= BUILD_BARS) {
      this.clearStep(); // the plain phase 3 mix (the registry's boss) is the lead again
    }
  }

  // --- time and loads ----------------------------------------------------------------------------

  tick(dt: number): void {
    if (this.step?.kind === 'wait' && (this.step.idle += dt) > BEAT_WAIT_S) this.clearStep();
    if (this.mix === 'lull' && !this.viaMode && (this.lullFor += dt) > LULL_TIMEOUT_S) this.to(null);
  }

  /** `save.loaded`: the director forgot every boss, so forget ours without releasing; the mode re-derives the siege. */
  saveLoaded(siegeModeNow: boolean): void {
    this.held.clear();
    this.mix = null;
    this.viaMode = false;
    this.lullFor = 0;
    this.step = null;
    this.unbeat?.();
    this.unbeat = null;
    if (siegeModeNow) this.modeChanged({ mode: 'siege', previous: 'walk' });
  }

  dispose(): void {
    this.clearStep();
    this.to(null);
  }

  // --- plumbing -------------------------------------------------------------------------------

  private to(next: 'siege' | 'lull' | null): void {
    if (next === this.mix) return;
    const old = this.mix;
    this.mix = next;
    if (next) this.start(next === 'siege' ? SIEGE_MIX_KEY : SIEGE_LULL_MIX_KEY);
    if (old) this.release(old === 'siege' ? SIEGE_MIX_KEY : SIEGE_LULL_MIX_KEY);
  }

  private clearStep(): void {
    this.step = null;
    this.unbeat?.();
    this.unbeat = null;
    this.release(ULTHRED_DROP_MIX_KEY);
    this.release(ULTHRED_BUILD_MIX_KEY);
  }

  private start(id: string): void {
    if (this.held.has(id)) return;
    this.held.add(id);
    try {
      this.ports.setBoss(true, id);
    } catch {
      // music is never worth a thrown event handler
    }
  }

  private release(id: string): void {
    if (!this.held.delete(id)) return;
    try {
      this.ports.setBoss(false, id);
    } catch {
      // as above
    }
  }
}
