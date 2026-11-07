// The waking after the credits (N13, plans/act5-N13.md section 2, agreed with N12): N12's ending director sets
// `world.afterEnding`, awaits `afterEnding.wake()`, then releases N11's M56 autosave hold and saves once. wake() moves the
// player to the Rim Camp's rest point by the fire (SafeTeleport), sets the world tint from the choice and shows the waking
// line (and, if Cael died, the ballad's). It writes no flag and never saves. A load never wakes: it lands where it was saved.
import { RIM_CAMP } from '../caldera/calderaSites';
import { caelDied, endingChoice, type FlagReader, type M56Choice } from './flags';

export interface AfterEndingService {
  /** Once per session: resolves when the player is at the Rim Camp, the tint is set and the lines have shown. */
  wake(): Promise<void>;
  /** wake() has run this session. */
  readonly woken: boolean;
  /** The string keys of the lines the last wake showed (for tests and the dev check; the toasts are no-ops headless). */
  readonly lines: readonly string[];
}

declare module '../core/Services' {
  interface GameServices {
    /** N13: the world after the ending (Q1 (a)); absent under Q1 (b), and N12 then skips the call. */
    afterEnding: AfterEndingService;
  }
}

/** Where the player wakes: the Rim Camp's rest point, 4 m from the fire, facing it (taste call T1). */
export const WAKE_POINT = { x: RIM_CAMP.rest[0], z: RIM_CAMP.rest[1] } as const;
/** Engine yaw that faces the fire from the rest point (yaw 0 faces -Z). */
export const WAKE_YAW = Math.atan2(-(RIM_CAMP.fire[0] - RIM_CAMP.rest[0]), -(RIM_CAMP.fire[1] - RIM_CAMP.rest[1]));

export interface WakeHost {
  flags: FlagReader;
  groundAt(x: number, z: number): number;
  teleport(feet: { x: number; y: number; z: number }, yaw: number): Promise<{ ok: boolean }>;
  setTint(choice: M56Choice | null): void;
  show(key: string): void;
  warn(message: string): void;
}

/** The lines a waking shows for these flags (the choice's line, then the ballad's if Cael died). */
export function wakeLines(flags: FlagReader): string[] {
  const choice = endingChoice(flags);
  const out = choice ? [`afterEnding.wake.${choice}`] : [];
  if (caelDied(flags)) out.push('afterEnding.wake.ballad');
  return out;
}

export class AfterEnding implements AfterEndingService {
  woken = false;
  lines: readonly string[] = [];
  private running: Promise<void> | null = null;

  constructor(private readonly host: WakeHost) {}

  wake(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run();
    return this.running;
  }

  /** A load ends this session's waking: a replayed ending (a load before the choice) wakes again. */
  reset(): void {
    this.running = null;
    this.woken = false;
    this.lines = [];
  }

  /** Never rejects: every step only warns. */
  private async run(): Promise<void> {
    try {
      await this.steps();
    } catch (err) {
      this.host.warn(`afterEnding.wake failed: ${String(err)}`);
    }
    this.woken = true;
  }

  private async steps(): Promise<void> {
    const h = this.host;
    const choice = endingChoice(h.flags);
    if (!choice) h.warn('afterEnding.wake: world.afterEnding or story.m56.choice is not set; waking without a tint');
    try {
      const out = await h.teleport({ x: WAKE_POINT.x, y: h.groundAt(WAKE_POINT.x, WAKE_POINT.z) + 0.05, z: WAKE_POINT.z }, WAKE_YAW);
      if (!out.ok) h.warn('afterEnding.wake: the Rim Camp teleport was refused; the player stays where the credits left them');
    } catch (err) {
      h.warn(`afterEnding.wake: the Rim Camp teleport failed: ${String(err)}`);
    }
    h.setTint(choice);
    this.lines = wakeLines(h.flags);
    for (const key of this.lines) h.show(key);
  }
}
