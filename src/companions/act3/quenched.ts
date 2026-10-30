// Act 3 (K5, Q13, v0.7 item 17): Hathren's Quenched aura. Burn gains x 0.75 in the Greyfen once `story.m26.complete` is
// set, and everywhere once `story.m34.complete` is set. K5 is the SOLE owner of the `Burn.setGainScale` slot (one slot,
// the last setter wins): the scale is registered once and reads the flags and the player's region at each gain, so a
// load, a teleport or a Greyfen interior float (same x, z as its door) needs no event. Events only drive the toast.
import { QUENCHED_AURA } from '../../status/quenched';
import { regionAt } from '../../region/regionMask';

export const QUENCHED_GREYFEN_FLAG = 'story.m26.complete';
export const QUENCHED_EVERYWHERE_FLAG = 'story.m34.complete';
/** Set the first time the aura is on; the toast is shown once ever, never on a load. */
export const QUENCHED_SEEN_FLAG = 'companions.a3.quenchedSeen';
export const QUENCHED_TOAST_KEY = 'hud.aura.quenched.on';

/** Whether the aura holds for a player standing in `regionId`. */
export function quenchedOn(flag: (key: string) => unknown, regionId: string | null): boolean {
  if (flag(QUENCHED_EVERYWHERE_FLAG) === true) return true;
  return flag(QUENCHED_GREYFEN_FLAG) === true && regionId === 'greyfen';
}

export interface QuenchedPorts {
  flag(key: string): unknown;
  setFlag(key: string, value: boolean): void;
  /** The player's feet (engine coordinates). */
  feet(): { x: number; z: number };
  /** The spells service's slot, or undefined while the spells plugin is absent. */
  setBurnGainScale(): ((fn: () => number) => () => void) | undefined;
  toast(textKey: string): void;
}

export class QuenchedAura {
  private undo: (() => void) | null = null;

  constructor(private readonly ports: QuenchedPorts) {}

  /** True while the aura holds where the player stands now. */
  active(): boolean {
    const f = this.ports.feet();
    return quenchedOn((k) => this.ports.flag(k), regionAt(f.x, f.z)?.id ?? null);
  }

  /** The Burn gain multiplier now. */
  scale(): number {
    return this.active() ? QUENCHED_AURA.burnGainScale : 1;
  }

  /** Registers the scale once (a no-op once registered, or while the spells service lacks the slot). */
  ensureRegistered(): boolean {
    if (this.undo) return true;
    const set = this.ports.setBurnGainScale();
    if (!set) return false;
    this.undo = set(() => this.scale());
    return true;
  }

  get registered(): boolean {
    return this.undo !== null;
  }

  /** A runtime change (region entered, a flag set): toasts the first time ever the aura is on. */
  onChange(): void {
    if (!this.active() || this.ports.flag(QUENCHED_SEEN_FLAG) === true) return;
    this.ports.setFlag(QUENCHED_SEEN_FLAG, true);
    this.ports.toast(QUENCHED_TOAST_KEY);
  }

  /** A load: latches the seen flag silently when the aura already holds, so no toast follows. */
  onLoaded(): void {
    if (this.active() && this.ports.flag(QUENCHED_SEEN_FLAG) !== true) this.ports.setFlag(QUENCHED_SEEN_FLAG, true);
  }

  dispose(): void {
    this.undo?.();
    this.undo = null;
  }
}
