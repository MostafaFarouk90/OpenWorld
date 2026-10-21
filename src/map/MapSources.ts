// Flag- and service-driven map data: forge marks, fog wall marker, shrine markers and the level legend.
// Takes narrow ports so it runs against fakes in tests; every soft service is optional.

import { FOG_OPEN_FLAGS, fogOpen } from '../region/fogWall';
import type { FlagGates } from '../state/FlagGates';
import { buildForgeState, SHRINE_IDS, SHRINE_POSITIONS, type ForgeState, type ShrineId } from './ForgeMarks';
import type { PoiInput } from './MapModel';
import { ACT2_POI_PLACEMENTS, resolvePose } from '../world/poi/placement.act2';
import { discoveredFlag, takenFlag } from '../world/poi/content';

/** Shrines whose position comes from a published anchor (SHRINE_POSITIONS stays Act 1's table). */
export const SHRINE_ANCHORS: Readonly<Partial<Record<ShrineId, string>>> = { 'hushed-anvil': 'cinderreach.hushed-anvil.site' };

export interface Act2PoiSite {
  id: string;
  template: string;
  x: number;
  z: number;
}

/** The Act 2 POI sites with world positions (pure: roads give the pose, no anchors needed). */
export function act2PoiSites(): Act2PoiSite[] {
  return ACT2_POI_PLACEMENTS.map((p) => {
    const pose = resolvePose(p);
    return { id: p.site.id, template: p.site.template, x: pose.x, z: pose.z };
  });
}

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
  /** Flag reader for the discovered and taken POI flags; without it no Act 2 POI is drawn. */
  flag?(key: string): boolean;
  /** Published anchor position, for shrines that have no entry in SHRINE_POSITIONS. */
  anchor?(id: string): { x: number; z: number } | undefined;
}

export interface MapSources {
  forge(): ForgeState;
  legend(x: number, z: number): { min: number; max: number } | null;
  fogWall(): PoiInput | null;
  /** Trainer and vendor markers whose post is revealed on the fog grid; vendors also need the favour flag. */
  posts(isRevealed: (x: number, z: number) => boolean): PoiInput[];
  litShrines(): PoiInput[];
  /** Act 2 points of interest the player has found (`place.poi.a2.<id>.discovered`); emptied ones say so. */
  a2Pois(): PoiInput[];
  dispose(): void;
}

function call<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function createMapSources(
  ports: MapSourcePorts,
  label: (key: string, params?: Record<string, string | number>) => string = (k) => k,
  anchors: readonly PostAnchor[] = POST_ANCHORS,
  poiSites: readonly Act2PoiSite[] = act2PoiSites(),
): MapSources {
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
        const anchorId = SHRINE_ANCHORS[id];
        const p = SHRINE_POSITIONS[id] ?? (anchorId ? call(() => ports.anchor?.(anchorId)) : undefined);
        return p && lit.get(id) ? [{ id: `shrine.${id}`, x: p.x, z: p.z, label: label(`map.shrine.${id}`) }] : [];
      }),
    a2Pois: () =>
      poiSites.flatMap((p) => {
        if (!ports.flag || !call(() => ports.flag!(discoveredFlag(p.id)))) return [];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return [];
        const name = label(`map.poi.${p.template}`);
        const taken = call(() => ports.flag!(takenFlag(p.id))) === true;
        return [{ id: `poi.a2.${p.id}`, x: p.x, z: p.z, label: taken ? label('map.poi.emptied', { name }) : name }];
      }),
    dispose() {
      for (const off of offs.splice(0)) off();
    },
  };
}
