// Act 4 (L4, plans/act4-L4.md section 1.6): lines each companion says exactly once, latched by a persisted flag so a
// load, a repeat `setCompanionRank` or a party change never repeats them:
//   - the M37 bond line, once its rank is 2 or more. A companion seated then says it at once (through the party's
//     one-voice gate, so the second seated one speaks a little later); a benched one says it once it is seated again;
//   - the mourning line for Sir Gaut, after the first rest once `story.m39.complete` holds.
import { GAUT_FALLEN_FLAG } from './banter';
import { act4BarkKey } from './strings.en';

export const ONE_SHOT = {
  /** Seconds between tries (a held line waits for the gate). */
  trySeconds: 1,
  bondRank: 2,
  bondSaidFlag: (id: string) => `companions.a4.bond2Said.${id}`,
  mourningSaidFlag: (id: string) => `companions.a4.mourningSaid.${id}`,
  /** Set by the first rest after M39; persisted, so a load after the rest still has it. */
  mourningArmedFlag: 'companions.a4.mourningArmed',
} as const;

export interface OneShotSpeaker {
  readonly def: { readonly id: string };
  readonly joined: boolean;
  rank(): number;
  sayLine(lineKey: string): boolean;
}

export interface OneShotPorts {
  flag(key: string): unknown;
  setFlag(key: string, value: boolean): void;
  speakers(): readonly OneShotSpeaker[];
}

export class OneShotLines {
  private clock = 0;

  constructor(private readonly p: OneShotPorts) {}

  /** A waystone or camp rest: arms the mourning lines once Gaut has fallen. */
  rested(): void {
    if (this.p.flag(GAUT_FALLEN_FLAG) === true && this.p.flag(ONE_SHOT.mourningArmedFlag) !== true) this.p.setFlag(ONE_SHOT.mourningArmedFlag, true);
  }

  tick(dt: number): void {
    this.clock -= dt;
    if (this.clock > 0) return;
    this.clock = ONE_SHOT.trySeconds;
    for (const s of this.p.speakers()) {
      if (!s.joined) continue;
      const id = s.def.id;
      // the bond line first; one line per companion per try
      if (s.rank() >= ONE_SHOT.bondRank && this.p.flag(ONE_SHOT.bondSaidFlag(id)) !== true) {
        if (s.sayLine(act4BarkKey(id, 'bond2', 1))) this.p.setFlag(ONE_SHOT.bondSaidFlag(id), true);
        continue;
      }
      if (this.p.flag(ONE_SHOT.mourningArmedFlag) === true && this.p.flag(GAUT_FALLEN_FLAG) === true && this.p.flag(ONE_SHOT.mourningSaidFlag(id)) !== true) {
        if (s.sayLine(act4BarkKey(id, 'mourning', 1))) this.p.setFlag(ONE_SHOT.mourningSaidFlag(id), true);
      }
    }
  }
}
