export interface ForgeShrinePorts {
  /** `waystones.isLit(id)`; undefined while the waystones service is missing. */
  waystoneLit(): boolean;
  isLit(): boolean;
  setFlag(key: string, value: boolean): void;
  emitRekindled(shrineId: string): void;
  /** Extra gate (the Bellows stone must not light the shrine before the puzzle is solved). Default true. */
  canLight?(): boolean;
}

/**
 * Lights `shrine.<id>.lit` from a waystone rekindle for the Act 2 forge-shrines (the Quenchstone has its own code in
 * shrine.plugin.ts). W follows for free: the warmth tracker counts the flags. Ignores every other waystone id.
 */
export class ForgeShrineBinding {
  constructor(
    readonly id: string,
    private readonly ports: ForgeShrinePorts,
  ) {}

  static flag(id: string): string {
    return `shrine.${id}.lit`;
  }

  private light(announce: boolean): void {
    if (this.ports.isLit()) return;
    if (this.ports.canLight && !this.ports.canLight()) return;
    this.ports.setFlag(ForgeShrineBinding.flag(this.id), true);
    if (announce) this.ports.emitRekindled(this.id);
  }

  /** Lights the shrine now (a scripted solve whose waystone anchor does not exist yet). Respects `canLight`. */
  lightNow(): void {
    this.light(true);
  }

  /** `waystone.rekindled`. A script rekindle lights the shrine too, announced the same. */
  onRekindled(waystoneId: string): void {
    if (waystoneId !== this.id) return;
    this.light(true);
  }

  /** Older saves and scripts: a lit waystone with no shrine flag lights the shrine silently. */
  sync(): void {
    if (this.ports.waystoneLit()) this.light(false);
  }
}
