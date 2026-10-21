import { Herd, type Circle, type HerdEnv, type Point } from '../sheep/Herd';
import { HERD } from '../sheep/tuning';

/** The `herd` service: R05's flock of sheep (A12 drives the quest through it). */
export interface HerdService {
  /**
   * Spawns the flock at `flockAnchors` (up to 8; replaces a herd with the same id). `fogAnchors` mark ash-fog hollows (radius
   * `fogRadius`, default 14 m): a sheep inside one scatters. False when an anchor is unknown or none is given.
   */
  start(herdId: string, flockAnchors: readonly string[], opts?: { fogAnchors?: readonly string[]; fogRadius?: number }): boolean;
  /** The sheep follow the player (true) or go back to grazing. */
  follow(herdId: string, on: boolean): boolean;
  /** Sheep within `radius` metres (default 8) of the anchor `homeAnchor`, not lost in the fog; 0 for an unknown herd or anchor. */
  count(herdId: string, homeAnchor: string, radius?: number): number;
  /** Removes the flock. */
  stop(herdId: string): void;
}

export interface HerdHost {
  anchor(id: string): Point | undefined;
  env(): HerdEnv;
  joined(herdId: string, n: number): void;
  scattered(herdId: string, n: number): void;
}

export const DEFAULT_COUNT_RADIUS = 8;

/** The service plus the per-tick step and teardown the plugin wires into systems. */
export function createHerdService(host: HerdHost): HerdService & { step(dt: number): void; clear(): void } {
  const herds = new Map<string, Herd>();
  const stopOne = (id: string): void => {
    herds.get(id)?.dispose();
    herds.delete(id);
  };
  return {
    start(herdId, flockAnchors, opts = {}) {
      const anchors = flockAnchors.map((a) => host.anchor(a));
      if (!anchors.length || anchors.some((a) => !a)) return false;
      const radius = opts.fogRadius ?? HERD.fogRadius;
      const fog: Circle[] = [];
      for (const id of opts.fogAnchors ?? []) {
        const a = host.anchor(id);
        if (!a) return false;
        fog.push({ x: a.x, z: a.z, radius });
      }
      stopOne(herdId);
      herds.set(
        herdId,
        new Herd(herdId, host.env(), { anchors: anchors as Point[], fog }, {
          joined: (n) => host.joined(herdId, n),
          scattered: (n) => host.scattered(herdId, n),
        }),
      );
      return true;
    },
    follow(herdId, on) {
      const h = herds.get(herdId);
      if (!h) return false;
      h.setFollowing(on);
      return true;
    },
    count(herdId, homeAnchor, radius = DEFAULT_COUNT_RADIUS) {
      const h = herds.get(herdId);
      const a = host.anchor(homeAnchor);
      return h && a ? h.count(a, radius) : 0;
    },
    stop: stopOne,
    step(dt) {
      for (const h of herds.values()) h.step(dt);
    },
    clear() {
      for (const id of [...herds.keys()]) stopOne(id);
    },
  };
}
