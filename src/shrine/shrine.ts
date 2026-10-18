import { Cooled } from './cooled';
import { SHRINE_TUNING } from './tuning';

const B = SHRINE_TUNING.basin;

export interface ShrinePorts {
  setFlag(key: string, value: boolean): void;
  emitRekindled(shrineId: string): void;
  /** Refresh max health, then fill to the new maximum. */
  topUpHealth(): void;
  heal(amount: number): void;
  maxHealth(): number;
  burn(): number;
  clearBurn(reason: string): void;
  reveal?(): void;
}

/**
 * The Quenchstone Shrine's own rules (design 7.1). Waystone state, respawn, saving and the Burn
 * charge on rekindle belong to other threads; this owns what the shrine adds: Cooled on rest, the
 * basin and the `shrine.quenchstone.lit` flag.
 */
export class Shrine {
  private burnTimer = 0;
  private wasInBasin = false;

  constructor(
    private readonly ports: ShrinePorts,
    readonly cooled: Cooled,
  ) {}

  /** `waystone.rekindled` for the Quenchstone, from the player or a script. Charges no Burn. */
  onRekindled(): void {
    this.ports.setFlag('shrine.quenchstone.lit', true);
    this.ports.emitRekindled('quenchstone');
    this.ports.reveal?.();
  }

  /** `rest` at the Quenchstone: waystones healed and spells cleared Burn first; add Cooled and refill to the new maximum. */
  onRest(): void {
    this.cooled.apply();
    this.ports.topUpHealth();
  }

  /**
   * The basin: restores health and clears Burn, never Scars, no stamina, no `rest`, no save. Burn is
   * cleared on entering and then at a low rate, because each change re-runs the max-health refresh.
   */
  basinTick(dt: number, active: boolean): void {
    if (!active) {
      this.wasInBasin = false;
      this.burnTimer = 0;
      return;
    }
    this.ports.heal(this.ports.maxHealth() * B.healFractionPerSecond * dt);
    this.burnTimer -= dt;
    if (!this.wasInBasin || this.burnTimer <= 0) {
      if (this.ports.burn() > 0) this.ports.clearBurn('basin');
      this.burnTimer = B.burnClearPeriod;
    }
    this.wasInBasin = true;
  }
}
