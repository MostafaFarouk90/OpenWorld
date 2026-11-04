// The peak packs' shared view (K6b, the M28 crag balance ruling): each hawk and ogre overlay of a group registers here under
// its spawner id, so a member can see its pack-mates. It drives two spawner options: `waveSize` (at most that many members of
// the group fight at once; the rest hold off until one is down, calmed or lets go) and `stoopClearOfOgre` (a hawk does not
// stoop while an engaged ogre of its group stands within that many metres of the target).
import type { ActorId } from '../ports';

export interface PackMember {
  readonly actorId: ActorId;
  readonly kind: 'hawk' | 'ogre';
  /** Fighting now (has a target and is alive); the order members took up the fight in, for `waveSize`. */
  engagedSince(): number | null;
  /** Simulated feet. */
  feet(): { x: number; z: number };
}

/** Keyed by the manager's host (one world), then by spawner id: two managers' groups of one id never see each other. */
const WORLDS = new WeakMap<object, Map<string, Set<PackMember>>>();
const packs = (host: object): Map<string, Set<PackMember>> => {
  let m = WORLDS.get(host);
  if (!m) WORLDS.set(host, (m = new Map()));
  return m;
};
let clock = 0;

/** A monotonic counter for `engagedSince` (ticks are not shared between managers, so a plain sequence is enough). */
export function packStamp(): number {
  return ++clock;
}

export function joinPack(host: object, spawnerId: string | null, m: PackMember): () => void {
  if (!spawnerId) return () => {};
  const PACKS = packs(host);
  const set = PACKS.get(spawnerId) ?? new Set<PackMember>();
  set.add(m);
  PACKS.set(spawnerId, set);
  return () => {
    set.delete(m);
    if (set.size === 0 && PACKS.get(spawnerId) === set) PACKS.delete(spawnerId);
  };
}

/** True while `self` may fight under its group's `waveSize`: it is among the first `size` engaged members. */
export function inWave(host: object, spawnerId: string | null, self: PackMember, size: number | undefined): boolean {
  if (!spawnerId || !size || !(size > 0)) return true;
  const set = packs(host).get(spawnerId);
  if (!set) return true;
  const mine = self.engagedSince();
  const engaged = [...set].map((m) => ({ m, at: m.engagedSince() })).filter((e) => e.at !== null && e.m !== self);
  const ahead = mine === null ? engaged.length : engaged.filter((e) => e.at! < mine).length;
  return ahead < size;
}

/** An engaged ogre of the group within `metres` of `p` (the hawk's target). */
export function ogreNear(host: object, spawnerId: string | null, p: { x: number; z: number }, metres: number | undefined): boolean {
  if (!spawnerId || !metres || !(metres > 0)) return false;
  for (const m of packs(host).get(spawnerId) ?? []) {
    if (m.kind !== 'ogre' || m.engagedSince() === null) continue;
    const f = m.feet();
    if (Math.hypot(f.x - p.x, f.z - p.z) <= metres) return true;
  }
  return false;
}
