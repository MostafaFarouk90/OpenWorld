// The capstones' shared mercy floor (K11 PR 4). Used by the Pathfinder and Emberwright capstone plugins, so neither class depends on the other.
import type { DamageModifier } from '../actors/DamageResolver';

export interface YieldFloorPorts {
  playerId(): string;
  /**
   * The foe would yield (kneel) on a poise break under half health: its def says `mercy.when === 'yielding'` and Spare is unlocked.
   * Absent (or false) means the foe simply takes the hit.
   */
  canYield?(actorId: string): boolean;
}

/**
 * The capstones' mercy floor (register as a damage modifier, after the other multipliers). A hit of the player carrying one of
 * `attackIds` on a foe that can yield never carries it from alive to dead: the amount is cut to leave exactly 1 HP, so the poise break the
 * hit brings reaches the Brain's own yield rule and the Spare chance (and its mercy credit) is kept. Any other foe takes the hit whole.
 * A foe already at 1 HP takes no health damage from such a hit, only its poise.
 */
export class AttackYieldFloor {
  constructor(
    private readonly p: YieldFloorPorts,
    private readonly attackIds: ReadonlySet<string>,
  ) {}

  modify: DamageModifier = (req, target) => {
    if (req.attackerId !== this.p.playerId() || !req.attackId || !this.attackIds.has(req.attackId) || req.outcome !== 'hit') return;
    if (!(target.health > 0) || this.p.canYield?.(target.id) !== true) return;
    if (req.amount >= target.health) req.amount = Math.max(0, target.health - 1);
  };
}
