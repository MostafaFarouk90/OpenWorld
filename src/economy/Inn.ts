export const INN = {
  roomGold: 15,
  forgivenGold: 8,
  heartySeconds: 20 * 60,
  /** +10% max health, matching Cooled so "strongest wins" is a tie that Cooled keeps. */
  heartyFactor: 1.1,
  placeId: 'inn.tilted-anvil',
  roomFlag: 'world.harrowmark.inn.room',
  priceFlag: 'world.harrowmark.inn.price',
  buffId: 'inn.hearty',
  nameKey: 'inn.hearty',
} as const;

export type InnFailure = 'no-room' | 'no-gold' | 'dead' | 'cutscene' | 'dialogue' | 'in-combat';

export interface InnPorts {
  roomRented(): boolean;
  price(): 'forgiven' | 'collected' | undefined;
  gold(): number;
  takeGold(n: number, reason: 'inn'): number;
  canRestNow(): 'dead' | 'cutscene' | 'dialogue' | 'in-combat' | null;
  restAt(placeId: string): { ok: boolean; reason?: string };
  /** Seconds of Cooled left, read live. */
  cooledSeconds(): number;
  /** Cooled's max-health multiplier (SHRINE_TUNING.cooled.multiplier). */
  cooledFactor: number;
  addMaxHealthModifier(id: string, fn: () => number): () => void;
  refreshMaxHealth(): void;
  topUp(): void;
  emitApplied(seconds: number): void;
  emitRemoved(): void;
}

export interface InnSave {
  heartyRemaining: number;
  /** Health at save time, so a load that clamps health before the modifier returns can restore it. */
  health?: number;
}

export function roomPrice(price: 'forgiven' | 'collected' | undefined): number {
  return price === 'forgiven' ? INN.forgivenGold : INN.roomGold;
}

/** The Tilted Anvil's room: pays, rests away from any waystone and grants Hearty. */
export class Inn {
  static readonly key = 'inn';
  static readonly version = 1;
  private remaining = 0;
  private dispose: (() => void) | null = null;

  constructor(private readonly ports: InnPorts) {}

  get active(): boolean {
    return this.remaining > 0;
  }

  secondsLeft(): number {
    return this.remaining;
  }

  quote(): number {
    return roomPrice(this.ports.price());
  }

  /** Why a night cannot be had now, or null. Nothing is charged for a refusal. */
  canRest(): InnFailure | null {
    if (!this.ports.roomRented()) return 'no-room';
    const blocked = this.ports.canRestNow();
    if (blocked) return blocked;
    if (this.ports.gold() < this.quote()) return 'no-gold';
    return null;
  }

  rest(): { ok: true; paid: number } | { ok: false; reason: InnFailure } {
    const why = this.canRest();
    if (why) return { ok: false, reason: why };
    const price = this.quote();
    const taken = this.ports.takeGold(price, 'inn');
    // canRestNow passed a moment ago in the same call, so restAt cannot refuse.
    this.ports.restAt(INN.placeId);
    this.applyHearty(INN.heartySeconds);
    return { ok: true, paid: taken };
  }

  /** Starts or refreshes Hearty. Aldith's Stout shares the id and calls this too; it never stacks. */
  applyHearty(seconds: number): void {
    if (!(seconds > 0)) return;
    this.remaining = Math.max(this.remaining, seconds);
    this.install();
    this.ports.refreshMaxHealth();
    this.ports.topUp();
    this.ports.emitApplied(this.remaining);
  }

  private install(): void {
    if (this.dispose) return;
    // Strongest wins: while Cooled runs, Hearty only adds what Cooled lacks (nothing at equal strength).
    this.dispose = this.ports.addMaxHealthModifier(INN.buffId, () => {
      if (this.remaining <= 0) return 1;
      const cooled = this.ports.cooledSeconds() > 0 ? this.ports.cooledFactor : 1;
      return Math.max(1, INN.heartyFactor / cooled);
    });
  }

  update(dt: number): void {
    if (this.remaining <= 0 || !(dt > 0)) return;
    this.remaining -= dt;
    if (this.remaining <= 0) this.stop();
  }

  private stop(): void {
    this.remaining = 0;
    this.dispose?.();
    this.dispose = null;
    this.ports.refreshMaxHealth();
    this.ports.emitRemoved();
  }

  serialize(health?: number): InnSave | null {
    if (this.remaining <= 0) return null;
    return health === undefined ? { heartyRemaining: this.remaining } : { heartyRemaining: this.remaining, health };
  }

  /** Corrupt data is ignored. Returns the health to restore, if saved. */
  load(data: unknown, version: number): number | undefined {
    if (this.remaining > 0 || this.dispose) this.stop();
    if (version !== Inn.version || typeof data !== 'object' || data === null) return undefined;
    const d = data as Partial<InnSave>;
    if (typeof d.heartyRemaining !== 'number' || !Number.isFinite(d.heartyRemaining) || d.heartyRemaining <= 0) return undefined;
    this.remaining = Math.min(d.heartyRemaining, INN.heartySeconds);
    this.install();
    this.ports.refreshMaxHealth();
    this.ports.emitApplied(this.remaining);
    return typeof d.health === 'number' && Number.isFinite(d.health) ? d.health : undefined;
  }
}
