// The Wyrm's Hearth rules (K9 PR 2): the open gate for M34's stone. The shrine is the waystone `wyrms-hearth`; lighting goes
// through ForgeShrineBinding like the other forge-shrines. Plain class over ports.
import { WYRMS_HEARTH as H } from './tuning';

export interface HearthPorts {
  getBool(key: string): boolean;
  setFlag(key: string, value: boolean): void;
  /** Undefined while the quests service is missing (read as closed). */
  questState(questId: string): string | undefined;
}

export class WyrmsHearth {
  constructor(private readonly ports: HearthPorts) {}

  lit(): boolean {
    return this.ports.getBool(`shrine.${H.id}.lit`);
  }

  /**
   * Open while M34 is active or completed, or `story.m34.complete` is set, or the shrine is already lit. The rekindle is
   * itself an M34 objective, so "active" must open the stone and no missed write can soft-lock the quest.
   */
  openWanted(): boolean {
    const q = this.ports.questState(H.quest);
    return q === 'active' || q === 'completed' || this.ports.getBool(H.completeFlag) || this.lit();
  }

  /** Writes the derived gate flag (only on change). */
  deriveOpen(): void {
    const want = this.openWanted();
    if (this.ports.getBool(H.openFlag) !== want) this.ports.setFlag(H.openFlag, want);
  }
}
