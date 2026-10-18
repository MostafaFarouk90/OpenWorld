import { Foe } from './Foe';
import { TOLL } from './tuning';
import type { FoeEnv, FoeSpawnInfo } from './types';
import { buildTollPostVisual } from './visuals';

/**
 * M04's ford barrier: a post with a bar. Mortal (health 120), no poise, heavy-only: a hit under
 * `TOLL.heavyPoise` is blocked by the foe manager's defender modifier. It never acts; it dies through the
 * normal `actor.died` path and gives no XP (no progression row).
 */
export class TollPost extends Foe {
  constructor(env: FoeEnv, info: FoeSpawnInfo) {
    super(env, info, buildTollPostVisual(info.slug));
  }

  protected override deathFadeSeconds(): number {
    return TOLL.fadeSeconds;
  }

  /** The post splinters: it tips over as it fades. */
  override react(dt: number): void {
    super.react(dt);
    if (this.phase === 'fading' || this.phase === 'dying') this.visual.root.rotation.z = Math.min(1.4, this.visual.root.rotation.z + dt * 2);
  }
}
