import type { ActorId } from '../ports';
import type { FoxGuide, Point } from '../fox/guide';

/** The `foxes` service: leading the player along anchors (R05's fox path and the cache). */
export interface FoxService {
  /**
   * Makes the living fox of spawner `spawnerId` lead the player through the anchors (in order); emits `fox.arrived { foxId,
   * stop }` at each. False when the spawner has no living fox, an anchor is unknown, or the list is empty.
   */
  guide(spawnerId: string, anchorIds: readonly string[]): boolean;
  /** Back to idling at home. */
  release(spawnerId: string): void;
}

export interface FoxHandle {
  readonly id: ActorId;
  readonly spawnerId: string | null;
  readonly fox: FoxGuide | null;
}

export function createFoxService(deps: {
  foxes(): Iterable<FoxHandle>;
  anchor(id: string): Point | undefined;
  arrived(foxId: ActorId, stop: number): void;
}): FoxService {
  const find = (spawnerId: string): FoxHandle | undefined => {
    for (const f of deps.foxes()) if (f.spawnerId === spawnerId && f.fox) return f;
    return undefined;
  };
  return {
    guide(spawnerId, anchorIds) {
      const f = find(spawnerId);
      if (!f?.fox || !anchorIds.length) return false;
      const stops: Point[] = [];
      for (const id of anchorIds) {
        const a = deps.anchor(id);
        if (!a) return false;
        stops.push({ x: a.x, z: a.z });
      }
      return f.fox.lead(stops, { stop: (i) => deps.arrived(f.id, i) });
    },
    release(spawnerId) {
      find(spawnerId)?.fox?.stop();
    },
  };
}
