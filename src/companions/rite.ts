// The Hearth Rite (design 8.2 and 15 item 979: Sister Aelfreda removes one Scar once per act; plans/act2-A5.md
// section 2). Refused when she has not joined, when this act's rite is spent (`aelfreda.rite.a<act>`) or when Cael has
// no Scars (the flag is not spent then). The act is 1 plus the number of `story.gate.a<n>` flags set.
import type { GameEvents } from '../core/events';
import './events';

export const RITE = {
  scars: 1,
  /** Act gates checked for the act number (story.gate.a2 .. a<n>). */
  maxAct: 6,
} as const;

export type RiteRefusal = 'not-joined' | 'spent' | 'no-scars' | 'no-spells';

export interface RiteService {
  /** The act whose rite is next (1 plus the set act gates). */
  act(): number;
  /** null when the rite can be performed now, else why not. */
  refusal(): RiteRefusal | null;
  available(): boolean;
  /** Removes one Scar and spends this act's rite; false (nothing spent) when refused. */
  perform(): boolean;
}

export interface RitePorts {
  events: GameEvents;
  getFlag(key: string): unknown;
  setFlag(key: string, value: boolean): void;
  joined(): boolean;
  spells(): { readonly scars: number; removeScars?(n: number, reason: 'hearth-rite'): number } | undefined;
}

export const riteFlag = (act: number): string => `aelfreda.rite.a${act}`;

export function createRite(p: RitePorts): RiteService {
  const act = (): number => {
    let n = 1;
    for (let a = 2; a <= RITE.maxAct; a++) if (p.getFlag(`story.gate.a${a}`)) n++;
    return n;
  };
  const refusal = (): RiteRefusal | null => {
    if (!p.joined()) return 'not-joined';
    if (p.getFlag(riteFlag(act()))) return 'spent';
    const s = p.spells();
    if (!s || typeof s.removeScars !== 'function') return 'no-spells';
    if (!(s.scars > 0)) return 'no-scars';
    return null;
  };
  return {
    act,
    refusal,
    available: () => refusal() === null,
    perform: () => {
      if (refusal() !== null) return false;
      const removed = p.spells()!.removeScars!(RITE.scars, 'hearth-rite');
      if (removed <= 0) return false;
      const a = act();
      p.setFlag(riteFlag(a), true);
      p.events.emit('rite.performed', { act: a, removed });
      return true;
    },
  };
}

declare module '../core/Services' {
  interface GameServices {
    /** A5's Hearth Rite (Sister Aelfreda). */
    rite: RiteService;
  }
}
