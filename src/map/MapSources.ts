// Flag- and service-driven map data: forge marks, fog wall marker, shrine markers and the level legend.
// Takes narrow ports so it runs against fakes in tests; every soft service is optional.

import { FOG_OPEN_FLAGS, fogOpen } from '../region/fogWall';
import type { FlagGates } from '../state/FlagGates';
import { buildForgeState, SHRINE_IDS, SHRINE_POSITIONS, type ForgeState, type ShrineId } from './ForgeMarks';
import type { PoiInput } from './MapModel';

export const FOG_WALL = { id: 'trg.fog.harrowmark', x: 1100, z: -150 } as const;
// The wall (and its marker) stands iff none of FOG_OPEN_FLAGS (src/region/fogWall.ts, the one list) is true.
/** Vendors are drawn only once the Favour tab is open. */
export const VENDOR_FLAG = 'story.m08.favourTab';

export interface PostAnchor {
  id: string;
  kind: 'trainer' | 'vendor';
  x: number;
  z: number;
}

/**
 * Trainer posts: the anchors thread 17 publishes in src/harrowmark/ANCHORS.md (2.5 m in front of each post, in the
 * Bastion yard). Vendors (Wystan, Merrin, ...) have no published coordinates yet, so none are listed; add them as
 * kind 'vendor'.
 */
const TRAINER_POSTS = [
  ['gaut', 8150],
  ['stane', 8175],
  ['pennard', 8200],
  ['gerta', 8225],
  ['ashdown', 8250],
] as const;
export const POST_ANCHORS: readonly PostAnchor[] = TRAINER_POSTS.map(([n, x]) => ({
  id: `harrowmark.bastion.trainer.${n}`,
  kind: 'trainer' as const,
  x,
  z: 1742.5,
}));

export interface MapSourcePorts {
  gates: Pick<FlagGates, 'watch' | 'flag'>;
  events: { on(type: 'warmth.changed', fn: (e: { tier: number; previous: number }) => void): () => void };
  /** Soft service lookup by name; may return undefined. */
  service(name: string): unknown;
}

export interface MapSources {
  forge(): ForgeState;
  legend(x: number, z: number): { min: number; max: number } | null;
  fogWall(): PoiInput | null;
  /** Trainer and vendor markers whose post is revealed on the fog grid; vendors also need the favour flag. */
  posts(isRevealed: (x: number, z: number) => boolean): PoiInput[];
  litShrines(): PoiInput[];
  dispose(): void;
}

function call<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function createMapSources(ports: MapSourcePorts, label: (key: string) => string = (k) => k, anchors: readonly PostAnchor[] = POST_ANCHORS): MapSources {
  const lit = new Map<ShrineId, boolean>();
  let fogIsOpen = false;
  let vendorsOpen = false;
  let eventTier: number | null = null;
  const offs: Array<() => void> = [];

  // gates.watch calls at once and again on every change and every load (a load emits no flag.changed).
  for (const id of SHRINE_IDS) {
    offs.push(ports.gates.watch((s) => s.getBool(`shrine.${id}.lit`), (open) => lit.set(id, open), { keys: ['shrine.*'] }));
  }
  // The wall's own rule (region/fogWall fogOpen), re-evaluated on every listed flag change and every load.
  offs.push(ports.gates.watch((st) => fogOpen(st), (open) => (fogIsOpen = open), { keys: [...FOG_OPEN_FLAGS] }));
  offs.push(ports.gates.flag(VENDOR_FLAG, (open) => (vendorsOpen = open)));
  offs.push(
    ports.events.on('warmth.changed', (e) => {
      if (e && typeof e.tier === 'number') eventTier = e.tier;
    }),
  );

  const svc = <T>(name: string): T | undefined => ports.service(name) as T | undefined;

  return {
    forge() {
      const warmth = svc<{ tier(): number }>('warmth');
      const shrine = svc<{ cooledRemaining(): number }>('shrine');
      // The service wins; the last warmth.changed covers a service that is not mounted yet.
      const tier = (warmth && call(() => warmth.tier())) ?? eventTier ?? undefined;
      return buildForgeState({
        isLit: (id) => lit.get(id) === true,
        tier,
        cooledRemaining: shrine ? call(() => shrine.cooledRemaining()) : undefined,
      });
    },
    legend(x, z) {
      const region = svc<{ at(x: number, z: number): { levelBand?: { min: number; max: number } } | null | undefined }>('region');
      const band = region ? call(() => region.at(x, z)?.levelBand) : undefined;
      if (!band || !Number.isFinite(band.min) || !Number.isFinite(band.max)) return null;
      return { min: band.min, max: band.max };
    },
    fogWall: () => (fogIsOpen ? null : { id: FOG_WALL.id, x: FOG_WALL.x, z: FOG_WALL.z, label: label('map.markers.fog') }),
    posts: (isRevealed) =>
      anchors.flatMap((a) => {
        if (!Number.isFinite(a.x) || !Number.isFinite(a.z)) return [];
        if (a.kind === 'vendor' && !vendorsOpen) return [];
        const seen = call(() => isRevealed(a.x, a.z));
        return seen ? [{ id: a.id, x: a.x, z: a.z, label: label(`map.post.${a.id}`) }] : [];
      }),
    litShrines: () =>
      SHRINE_IDS.flatMap((id) => {
        const p = SHRINE_POSITIONS[id];
        return p && lit.get(id) ? [{ id: `shrine.${id}`, x: p.x, z: p.z, label: label(`map.shrine.${id}`) }] : [];
      }),
    dispose() {
      for (const off of offs.splice(0)) off();
    },
  };
}
