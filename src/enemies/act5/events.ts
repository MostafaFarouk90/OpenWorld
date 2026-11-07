// Act 5 N5: the Warhost's events, by module augmentation (core files stay untouched). Readers: N4 (the siege), N9 (the HUD cue).
import '../events';

declare module '../../core/events' {
  interface GameEventMap {
    /** A Warhost shield line broke: two shield members were staggered within a second. `members` kneel with Spare open. */
    'enemies.shieldLine.broken': { lineId: string; members: string[] };
  }
}
