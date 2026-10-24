// The Last Anvil's M30 steps (K9 PR 1): sweep, relight, sound, in that order, while M30 is active or completed. The fourth
// step, the waystone rekindle, is the shared ForgeShrineBinding path. Plain class over ports.
import { LAST_ANVIL } from './tuning';

export type AnvilStepId = (typeof LAST_ANVIL.steps)[number]['id'];

export interface AnvilPorts {
  getBool(key: string): boolean;
  setFlag(key: string, value: boolean): void;
  questState(questId: string): string | undefined;
}

export class LastAnvilSteps {
  constructor(private readonly ports: AnvilPorts) {}

  private index(step: AnvilStepId): number {
    return LAST_ANVIL.steps.findIndex((s) => s.id === step);
  }

  done(step: AnvilStepId): boolean {
    return this.ports.getBool(LAST_ANVIL.steps[this.index(step)].flag);
  }

  questOpen(): boolean {
    const s = this.ports.questState(LAST_ANVIL.quest);
    return s === 'active' || s === 'completed';
  }

  lit(): boolean {
    return this.ports.getBool(`shrine.${LAST_ANVIL.id}.lit`);
  }

  /** Writes the derived stone gate: sounded, or the shrine is already lit. Only on change. */
  deriveOpen(): void {
    const want = this.done('sound') || this.lit();
    if (this.ports.getBool(LAST_ANVIL.openFlag) !== want) this.ports.setFlag(LAST_ANVIL.openFlag, want);
  }

  /** M30 is open, the step is not done, and every earlier step is. */
  canDo(step: AnvilStepId): boolean {
    const i = this.index(step);
    if (i < 0 || !this.questOpen() || this.done(step)) return false;
    return LAST_ANVIL.steps.slice(0, i).every((s) => this.ports.getBool(s.flag));
  }

  /** Does the step if it is allowed now; false (and nothing written) otherwise. */
  doStep(step: AnvilStepId): boolean {
    if (!this.canDo(step)) return false;
    this.ports.setFlag(LAST_ANVIL.steps[this.index(step)].flag, true);
    return true;
  }
}
