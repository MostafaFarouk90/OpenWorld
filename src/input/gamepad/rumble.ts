import type { GamepadLike } from './GamepadInput';

/** Rumble strengths and lengths (design section 11 table: small on a normal hit, longer on a heavy one). */
export const RUMBLE = {
  hitDealt: { ms: 60, weak: 0.35, strong: 0.1 },
  heavyDealt: { ms: 150, weak: 0.6, strong: 0.5 },
  hitTaken: { ms: 120, weak: 0.5, strong: 0.35 },
  bossPhase: { ms: 300, weak: 0.6, strong: 0.8 },
  gateBreach: { ms: 300, weak: 0.7, strong: 0.9 },
} as const;
export type RumbleKind = keyof typeof RUMBLE;

export interface RumbleDeps {
  pad(): GamepadLike | null;
  /** Only while the pad is the device in use. */
  padActive(): boolean;
  /** G1 setting `padRumble` (default on). */
  enabled(): boolean;
  /** False while the tab is hidden. */
  visible(): boolean;
}

/** Plays a dual-rumble effect when the pad has an actuator; silent otherwise. Never throws. */
export class Rumble {
  /** Effects played (tests, diagnostics). */
  played = 0;

  constructor(private readonly deps: RumbleDeps) {}

  play(kind: RumbleKind): boolean {
    if (!this.deps.padActive() || !this.deps.enabled() || !this.deps.visible()) return false;
    const act = this.deps.pad()?.vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return false;
    const r = RUMBLE[kind];
    try {
      const p = act.playEffect('dual-rumble', { startDelay: 0, duration: r.ms, weakMagnitude: r.weak, strongMagnitude: r.strong });
      if (p && typeof (p as Promise<unknown>).catch === 'function') (p as Promise<unknown>).catch(() => {});
    } catch {
      return false;
    }
    this.played++;
    return true;
  }
}
