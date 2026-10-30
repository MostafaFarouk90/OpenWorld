// When the Ashmare may be mounted or called (plans/slice-2-ashmare.md section 1). Pure: the plugin builds the
// state from the game context and the services, tests from plain objects.

export type MountRefusal = 'unavailable' | 'interior' | 'travel' | 'stealth' | 'chase' | 'combat' | 'busy' | 'movement';

export interface MountState {
  /** `story.m10.ashmare` (through ctx.gates). */
  available: boolean;
  /** `interiors.current !== null` or `interiors.transitioning`. */
  indoors: boolean;
  /** `waystones.travelling`. */
  travelling: boolean;
  /** Thread 18's `stealth.active()` and `chase.active()`; false when the services are absent. */
  stealth: boolean;
  chase: boolean;
  /** `waystones.hostileAggro`: a hostile has noticed the player. */
  aggro: boolean;
  /** Dead, mid-leap, a combat verb running, or a menu or dialogue on top of gameplay. */
  busy: boolean;
  /** v0.7: the movement mode refuses the Ashmare (gliding, the ferry, diving, hauling); absent reads false. */
  movement?: boolean;
}

/** The first reason the player may not mount or whistle, in this order; null when allowed. */
export function mountRefusal(s: Readonly<MountState>): MountRefusal | null {
  if (!s.available) return 'unavailable';
  if (s.indoors) return 'interior';
  if (s.travelling) return 'travel';
  if (s.stealth) return 'stealth';
  if (s.chase) return 'chase';
  if (s.aggro) return 'combat';
  if (s.busy) return 'busy';
  if (s.movement) return 'movement';
  return null;
}

/** Interactions that unseat the rider before they run (rest, kneel and rekindle, the shrine, hiding). */
export function dismountsBefore(kind: string, id: string): boolean {
  if (kind === 'waystone' || kind === 'kneel' || kind === 'hide') return true;
  return kind === 'use' && (id.includes('quenchstone') || id.includes('basin') || id.includes('shrine'));
}

/** Damage that throws the rider: a melee or spell hit that dealt health or staggered. Status and script ticks never do. */
export function unseatingHit(r: { kind: string; dealt: number; staggered: boolean; outcome?: string }): boolean {
  if (r.kind !== 'melee' && r.kind !== 'spell') return false;
  return r.dealt > 0 || r.staggered;
}
