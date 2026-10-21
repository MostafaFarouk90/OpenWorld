import type { ModifiableRequest } from '../actors/DamageResolver';
import { BLESSING } from './weepingBellows.tuning';

export interface BlessingPorts {
  emitApplied(seconds: number): void;
  emitRemoved(): void;
}

/** Whether a request is fire for the Blessing: ignite status ticks, or anything tagged `element: 'fire'`. */
export function isFireDamage(req: Pick<ModifiableRequest, 'kind' | 'statusKind' | 'element'>): boolean {
  return req.element === 'fire' || (req.kind === 'status' && req.statusKind === 'ignite');
}

/** "Bellows Blessing": +15% fire resistance for 30 minutes of simulated time; a new grant refreshes and never stacks. */
export class BellowsBlessing {
  static readonly key = BLESSING.saveKey;
  static readonly version = 1;
  private remaining = 0;

  constructor(private readonly ports: BlessingPorts) {}

  active(): boolean {
    return this.remaining > 0;
  }

  secondsLeft(): number {
    return this.remaining;
  }

  apply(): void {
    this.remaining = BLESSING.seconds;
    this.ports.emitApplied(this.remaining);
  }

  update(dt: number): void {
    if (this.remaining <= 0 || !(dt > 0)) return;
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.ports.emitRemoved();
    }
  }

  /** Multiplies a hit on the player in place. */
  modify(req: ModifiableRequest): void {
    if (this.remaining > 0 && req.outcome === 'hit' && isFireDamage(req)) req.amount *= BLESSING.fireMultiplier;
  }

  serialize(): { remaining: number } | null {
    return this.remaining > 0 ? { remaining: this.remaining } : null;
  }

  load(data: unknown): void {
    const rem = (data as { remaining?: unknown } | null)?.remaining;
    if (typeof rem !== 'number' || !Number.isFinite(rem) || rem <= 0) {
      if (this.remaining > 0) {
        this.remaining = 0;
        this.ports.emitRemoved();
      }
      return;
    }
    this.remaining = Math.min(rem, BLESSING.seconds);
  }

  announce(): void {
    if (this.remaining > 0) this.ports.emitApplied(this.remaining);
  }
}

export interface BellowsBlessingService {
  active(): boolean;
  secondsLeft(): number;
}

declare module '../core/Services' {
  interface GameServices {
    bellowsBlessing: BellowsBlessingService;
  }
}
