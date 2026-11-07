// Act 5 N9 (plans/act5-N9.md section 7): the credits roll's model. Pure: a list of blocks, a scroll position, a verse step.
export type CreditBlock =
  | { kind: 'heading'; text: string; names?: readonly string[] }
  | { kind: 'verse'; step: 'verse1' | 'chosen' | 'last'; lines: readonly string[] }
  | { kind: 'card'; id: string; title: string; lines: readonly string[] };

export interface CreditsDef {
  blocks: readonly CreditBlock[];
}

/** Pixels a second the text rolls. */
export const CREDITS_SPEED = 42;
/** Seconds a DLC card holds. */
export const CARD_HOLD_S = 6;
/** Approximate height (px) of a text block, per line plus the gap; the layout is fixed so the end is deterministic headless. */
export const LINE_PX = 28;
export const BLOCK_GAP_PX = 96;

function blockSeconds(b: CreditBlock): number {
  if (b.kind === 'card') return CARD_HOLD_S;
  const lines = b.kind === 'heading' ? 1 + (b.names?.length ?? 0) : b.lines.length;
  return (lines * LINE_PX + BLOCK_GAP_PX) / CREDITS_SPEED;
}

export type VerseStep = 'verse1' | 'chosen' | 'last';

/** The roll is a timeline: each block owns a span; the timeline's end is the roll's end. */
export class CreditsModel {
  private t = 0;
  private ended = false;
  private readonly starts: number[] = [];
  private readonly total: number;
  private readonly seenSteps = new Set<VerseStep>();
  /** Called once per ballad step as the roll reaches it (N8's `stepCredits`). */
  onStep: ((step: VerseStep) => void) | null = null;

  constructor(readonly def: CreditsDef) {
    let at = 0;
    for (const b of def?.blocks ?? []) {
      this.starts.push(at);
      at += blockSeconds(b);
    }
    this.total = at;
    if (this.total === 0) this.ended = true;
  }

  get seconds(): number {
    return this.t;
  }
  get duration(): number {
    return this.total;
  }
  get finished(): boolean {
    return this.ended;
  }
  /** 0..1 */
  get progress(): number {
    return this.total > 0 ? Math.min(1, this.t / this.total) : 1;
  }

  /** The block index the roll is at, or -1 once ended. */
  get blockIndex(): number {
    if (this.ended) return -1;
    let i = 0;
    for (let k = 0; k < this.starts.length; k++) if (this.t >= this.starts[k]) i = k;
    return i;
  }

  /** Advances the roll; returns true on the tick it ends. */
  update(dt: number): boolean {
    if (this.ended || !(dt > 0)) return false;
    this.t = Math.min(this.total, this.t + dt);
    const blocks = this.def.blocks;
    for (let k = 0; k < blocks.length; k++) {
      const b = blocks[k];
      if (b.kind === 'verse' && this.t >= this.starts[k] && !this.seenSteps.has(b.step)) {
        this.seenSteps.add(b.step);
        this.onStep?.(b.step);
      }
    }
    if (this.t >= this.total) {
      this.ended = true;
      return true;
    }
    return false;
  }

  /** Skips to the end; returns true if it just ended. Fires any ballad step not yet reached once so music ends in step. */
  finish(): boolean {
    if (this.ended) return false;
    return this.update(this.total - this.t + 1e-6) || this.ended;
  }
}
