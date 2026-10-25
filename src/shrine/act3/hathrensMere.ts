// Hathren's Mere rules (K9 PR 1): the open gate for M26's stone, the Mere's rest, and Hathren's Scale. The shrine is the
// waystone `hathrens-mere`; lighting goes through ForgeShrineBinding like the Act 2 shrines. Plain class over ports.
import { MERE } from './tuning';

export interface MerePorts {
  getBool(key: string): boolean;
  setFlag(key: string, value: boolean): void;
  questState(questId: string): string | undefined;
  /** Held count of an item; 0 while the inventory is missing. */
  itemCount(itemId: string): number;
  /** False while `spells.removeScars` is unavailable (the scale is then not spent). */
  canRemoveScars(): boolean;
  removeScars(n: number): number;
  clearIgnite(): void;
  toast(key: string, params?: Record<string, string | number>): void;
}

export class HathrensMere {
  constructor(private readonly ports: MerePorts) {}

  lit(): boolean {
    return this.ports.getBool(`shrine.${MERE.id}.lit`);
  }

  /**
   * The stone opens when M26's nets are cut, or while M26 is active or completed, or the shrine is already lit, or
   * `story.m26.complete` is set. The rite is itself an M26 objective, so M26 being active must open the stone: a missed
   * `netsCut` write can then never soft-lock the quest. Only M23 to M25 (M26 inactive, no flag) keep it closed.
   */
  openWanted(): boolean {
    const q = this.ports.questState(MERE.quest);
    return (
      this.ports.getBool(MERE.netsCutFlag) ||
      q === 'active' ||
      q === 'completed' ||
      this.ports.getBool(MERE.completeFlag) ||
      this.lit()
    );
  }

  /** Writes the derived gate flag (only on change). */
  deriveOpen(): void {
    const want = this.openWanted();
    if (this.ports.getBool(MERE.openFlag) !== want) this.ports.setFlag(MERE.openFlag, want);
  }

  /** The Mere's rest (design 7.4): once lit, a rest here also puts out `ignite` (the shipped rest already clears Burn). */
  onRest(waystoneId: string): void {
    if (waystoneId !== MERE.id || !this.lit()) return;
    this.ports.clearIgnite();
    this.ports.toast('mere.rest.ignite');
  }

  /**
   * Hathren's Scale: the first time the player holds the item and the flag is unset, the flag is set FIRST, then up to 3
   * Scars go. Once means once: dropping and picking the item up again, or a reload, never repeats it; 0 Scars still spends it.
   */
  checkScale(): boolean {
    if (this.ports.getBool(MERE.scaleUsedFlag) || this.ports.itemCount(MERE.scaleItem) < 1) return false;
    if (!this.ports.canRemoveScars()) return false;
    this.ports.setFlag(MERE.scaleUsedFlag, true);
    const removed = this.ports.removeScars(MERE.scaleScars);
    if (removed > 0) this.ports.toast('mere.scale.eased', { count: removed });
    else this.ports.toast('mere.scale.none');
    return true;
  }
}
