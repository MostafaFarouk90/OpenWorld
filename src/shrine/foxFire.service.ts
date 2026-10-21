export interface FoxFireService {
  active(): boolean;
  secondsLeft(): number;
  /** Metres; A2's hidden chests show inside it while `active()`. The mirror flag `buff.foxFire.active` says the same. */
  readonly radius: number;
  /** Starts or refreshes the 30 minute buff (the Dell bed; A12's Fox-Fire Ember item). */
  apply(): void;
}

declare module '../core/Services' {
  interface GameServices {
    foxFire: FoxFireService;
  }
}
