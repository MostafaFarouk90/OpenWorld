import type { InnFailure } from './Inn';
import type { VendorId } from './stock';

/** The `vendors` service (contracts section 6): `open` shows the shop modal. */
export interface VendorsService {
  open(vendorId: string): void;
}

/** The `inn` service: `rest` pays, rests and grants Hearty. */
export interface InnService {
  rest(): void;
  /** Aldith's Stout and the rest share Hearty; it refreshes and never stacks. */
  applyHearty(seconds: number): void;
  /** Why a night cannot be had now, or null. */
  canRest(): InnFailure | null;
  readonly vendors?: readonly VendorId[];
}

declare module '../core/Services' {
  interface GameServices {
    vendors: VendorsService;
    inn: InnService;
  }
}
