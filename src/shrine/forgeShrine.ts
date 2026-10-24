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

  /** True when this call set the flag. */
  private light(announce: boolean): boolean {
    if (this.ports.isLit()) return false;
    if (this.ports.canLight && !this.ports.canLight()) return false;
    this.ports.setFlag(ForgeShrineBinding.flag(this.id), true);
    if (announce) this.ports.emitRekindled(this.id);
    return true;
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

  /**
   * Older saves and scripts: a lit waystone with no shrine flag lights the shrine silently. Returns true when it set the
   * flag, so a caller can have the quests read their `doneWhen` again (a silent flag raises no event).
   */
  sync(): boolean {
    return this.ports.waystoneLit() ? this.light(false) : false;
  }
}
