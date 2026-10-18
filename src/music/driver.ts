/** Structural types so the pure music code does not import core modules that live on another branch. */
export type DamageKind = 'melee' | 'spell' | 'fall' | 'script' | 'status';
export type TeamName = 'player' | 'ally' | 'hostile' | 'neutral';

/** What the director needs from the StemMixer. */
export interface MixDriver {
  setMix(mix: Readonly<Record<string, number>>, rampSeconds?: number): void;
}
