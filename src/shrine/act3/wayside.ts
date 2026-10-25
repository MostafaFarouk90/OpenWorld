// The six R17 wayside shrines (K9 PR 1): candles on the Dragonspine road. Not forge-shrines; they never count toward W.
import { WAYSIDE } from './tuning';

export type LightGate = (index: number) => boolean;

export interface WaysideService {
  /** K13's optional gate (for example "carrying the candle bundle"); one gate, a second replaces the first. Returns the undo. */
  setLightGate(fn: LightGate): () => void;
  lit(index: number): boolean;
  /** How many of the six are lit. */
  count(): number;
}

declare module '../../core/Services' {
  interface GameServices {
    waysideShrines: WaysideService;
  }
}

declare module '../../core/events' {
  interface GameEventMap {
    'wayside.lit': { index: number };
  }
}

export interface WaysidePorts {
  getBool(key: string): boolean;
  setFlag(key: string, value: boolean): void;
  questState(questId: string): string | undefined;
  emitLit(index: number): void;
  warn(message: string): void;
}

export class WaysideShrines implements WaysideService {
  private gate: LightGate | null = null;

  constructor(private readonly ports: WaysidePorts) {}

  setLightGate(fn: LightGate): () => void {
    this.gate = fn;
    return () => {
      if (this.gate === fn) this.gate = null;
    };
  }

  lit(index: number): boolean {
    return this.ports.getBool(WAYSIDE.flag(index));
  }

  count(): number {
    let n = 0;
    for (let i = 1; i <= WAYSIDE.count; i++) if (this.lit(i)) n++;
    return n;
  }

  /** R17 is active, the candle is unlit, and the gate (if any) allows. A gate that throws reads as blocked. */
  canLight(index: number): boolean {
    if (this.ports.questState(WAYSIDE.quest) !== 'active' || this.lit(index)) return false;
    if (!this.gate) return true;
    try {
      return this.gate(index) === true;
    } catch (e) {
      this.ports.warn(`wayside: light gate threw (${String(e)}); treating as blocked`);
      return false;
    }
  }

  light(index: number): boolean {
    if (!Number.isInteger(index) || index < 1 || index > WAYSIDE.count || !this.canLight(index)) return false;
    this.ports.setFlag(WAYSIDE.flag(index), true);
    this.ports.emitLit(index);
    return true;
  }
}
