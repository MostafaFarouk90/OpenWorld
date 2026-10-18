// Flag- and service-driven map data: forge marks, fog wall marker, shrine markers and the level legend.
// Takes narrow ports so it runs against fakes in tests; every soft service is optional.

import type { FlagGates } from '../state/FlagGates';
import { buildForgeState, SHRINE_IDS, SHRINE_POSITIONS, type ForgeState, type ShrineId } from './ForgeMarks';
import type { PoiInput } from './MapModel';

export const FOG_WALL = { id: 'trg.fog.harrowmark', x: 1100, z: -150 } as const;
export const HARROWMARK_FLAG = 'story.slice.harrowmarkOpen';

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

export function createMapSources(ports: MapSourcePorts, label: (key: string) => string = (k) => k): MapSources {
  const lit = new Map<ShrineId, boolean>();
  let fogOpen = false;
  let eventTier: number | null = null;
  const offs: Array<() => void> = [];

  // gates.watch calls at once and again on every change and every load (a load emits no flag.changed).
  for (const id of SHRINE_IDS) {
    offs.push(ports.gates.watch((s) => s.getBool(`shrine.${id}.lit`), (open) => lit.set(id, open), { keys: ['shrine.*'] }));
  }
  offs.push(ports.gates.flag(HARROWMARK_FLAG, (open) => (fogOpen = open)));
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
    fogWall: () => (fogOpen ? null : { id: FOG_WALL.id, x: FOG_WALL.x, z: FOG_WALL.z, label: label('map.markers.fog') }),
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
