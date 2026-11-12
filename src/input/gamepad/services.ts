import type { GamepadInput } from './GamepadInput';
import type { PadBindings } from './PadBindings';

/** G2: the gamepad, provided by the world scene before plugins set up (startWorld), like `audio`. */
export interface GamepadService {
  readonly pad: GamepadInput;
  readonly bindings: PadBindings;
}

declare module '../../core/Services' {
  interface GameServices {
    gamepad: GamepadService;
  }
}
