import type { CombinedModifiers, PerceptionModifiers, SightBlocker } from './ai/perception';
import type { ActorId } from './ports';
import type { EnemyView } from './types';

export type { CombinedModifiers, PerceptionModifiers, SightBlocker } from './ai/perception';

type P3 = { x: number; y: number; z: number };

/** The observing enemy as a provider sees it: its view plus where it stands, which way it faces, and whether it only watches. */
export type ObserverPose = EnemyView & { feet: P3; yaw: number; observerOnly: boolean };

export interface PerceptionProvider {
  /** Return `null` when this provider does not apply to this target/observer. */
  modifiers(target: ActorId, observer: ObserverPose): PerceptionModifiers | null;
}

export type Unregister = () => void;

/** The default sneak preset; final numbers are thread 18's. */
export const SNEAK: Readonly<PerceptionModifiers> = Object.freeze({
  sightRangeScale: 0.5,
  coneScale: 0.8,
  hearingQuietScale: 0.4,
  hearingLoudScale: 0.7,
});

/**
 * Combines provider results into one set of modifiers; null for an empty list (so unmodified perception is untouched).
 * Fields, per `PerceptionModifiers`:
 * - `sightRangeScale`, `coneScale`, `hearingQuietScale`, `hearingLoudScale`: multiplied together;
 * - `blockSight` (array of `{ x, z, r }` discs): concatenated;
 * - `hiddenBelow`: the minimum across providers;
 * - `targetHeight`: the minimum across providers (the lowest sight target wins).
 */
export function combineModifiers(list: readonly PerceptionModifiers[]): CombinedModifiers | null {
  if (list.length === 0) return null;
  const out: CombinedModifiers = {
    sightRangeScale: 1,
    coneScale: 1,
    hearingQuietScale: 1,
    hearingLoudScale: 1,
    blockSight: [],
  };
  const blockers: SightBlocker[] = [];
  for (const m of list) {
    out.sightRangeScale *= m.sightRangeScale;
    out.coneScale *= m.coneScale;
    out.hearingQuietScale *= m.hearingQuietScale;
    out.hearingLoudScale *= m.hearingLoudScale;
    if (m.blockSight) blockers.push(...m.blockSight);
    if (m.hiddenBelow !== undefined) out.hiddenBelow = out.hiddenBelow === undefined ? m.hiddenBelow : Math.min(out.hiddenBelow, m.hiddenBelow);
    if (m.targetHeight !== undefined) out.targetHeight = out.targetHeight === undefined ? m.targetHeight : Math.min(out.targetHeight, m.targetHeight);
  }
  out.blockSight = blockers;
  return out;
}

function validModifiers(m: PerceptionModifiers): boolean {
  return (
    Number.isFinite(m.sightRangeScale) &&
    Number.isFinite(m.coneScale) &&
    Number.isFinite(m.hearingQuietScale) &&
    Number.isFinite(m.hearingLoudScale) &&
    (m.hiddenBelow === undefined || Number.isFinite(m.hiddenBelow)) &&
    (m.targetHeight === undefined || Number.isFinite(m.targetHeight))
  );
}

/** The registered providers (`enemies.perception`). A provider that throws is skipped, with one warning per provider. */
export class PerceptionHub {
  private readonly providers: PerceptionProvider[] = [];
  private readonly warned = new WeakSet<PerceptionProvider>();

  constructor(private readonly warn: (message: string) => void) {}

  get size(): number {
    return this.providers.length;
  }

  register = (provider: PerceptionProvider): Unregister => {
    this.providers.push(provider);
    return () => {
      const i = this.providers.indexOf(provider);
      if (i >= 0) this.providers.splice(i, 1);
    };
  };

  /** Null with no providers (or none applying), so the caller's results are identical to unmodified perception. */
  combined(target: ActorId, observer: () => ObserverPose): CombinedModifiers | null {
    if (this.providers.length === 0) return null;
    const pose = observer();
    const list: PerceptionModifiers[] = [];
    for (const p of [...this.providers]) {
      try {
        const m = p.modifiers(target, pose);
        if (!m) continue;
        if (!validModifiers(m)) {
          if (!this.warned.has(p)) {
            this.warned.add(p);
            this.warn('enemies: a perception provider returned a non-finite scale or height and is ignored');
          }
          continue;
        }
        list.push(m);
      } catch (err) {
        if (!this.warned.has(p)) {
          this.warned.add(p);
          this.warn(`enemies: a perception provider threw and is ignored: ${String(err)}`);
        }
      }
    }
    return combineModifiers(list);
  }
}
