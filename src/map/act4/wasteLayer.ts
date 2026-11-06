// Act 4 L9 (plans/act4-L9.md section 4): the Ashen Waste on the full map. Pure: the plugin passes the open regions, the fog
// grid's reveal test and a flag reader; nothing here is cached, so a load or a newly revealed cell shows on the next draw.
import { ACT4_PLACES, type Act4PlaceId } from '../../region/act4/act4Places';
import { ROPE_LINE_GEOMS, SHELTER_SPOTS, pointAt } from '../../region/act4/ropeLines';
import type { RegionId } from '../../region/regions';
import type { MapLabel, MapLine } from '../viewTypes';

export const WASTE_REGION: RegionId = 'ashen-waste';
/** Metres between the samples a rope-line is cut into for the fog test (well under a fog cell). */
export const ROPE_SAMPLE_METRES = 40;

export interface WastePorts {
  open: readonly string[];
  isRevealed(x: number, z: number): boolean;
  flag(key: string): boolean;
  t(key: string): string;
}

/** The Waste's named places, in drawing order. Ashgate sits outside the Waste's edge (Q2), so it needs no open Waste. */
export const WASTE_LABEL_PLACES: readonly { id: Act4PlaceId; insideWaste: boolean }[] = [
  { id: 'ashgate', insideWaste: false },
  { id: 'crossing', insideWaste: true },
  { id: 'walker-camp', insideWaste: true },
  { id: 'cinder-chapel', insideWaste: true },
  { id: 'glasslands', insideWaste: true },
  { id: 'husk-cathedral', insideWaste: true },
  { id: 'rimfoot', insideWaste: true },
];

/** The places with a waystone (L1's `waystone.<id>`): a lit stone shows its label even under fog. */
const WASTE_WAYSTONE_PLACES: ReadonlySet<string> = new Set(['ashgate', 'walker-camp', 'cinder-chapel', 'glasslands']);
/** The flag that marks a place as found beyond the fog (its waystone lit), or null for a place with none. */
export const placeDiscoveredFlag = (id: string): string | null => (WASTE_WAYSTONE_PLACES.has(id) ? `waystone.${id}.lit` : null);

const safe = (f: () => boolean): boolean => {
  try {
    return f() === true;
  } catch {
    return false;
  }
};

/** Each rope-line cut into runs of revealed samples; nothing while the Waste is shut (Phase G never shows them). */
export function wasteLines(p: WastePorts): MapLine[] {
  if (!p.open.includes(WASTE_REGION)) return [];
  const out: MapLine[] = [];
  for (const line of ROPE_LINE_GEOMS) {
    let len = 0;
    for (let i = 1; i < line.points.length; i++) len += Math.hypot(line.points[i][0] - line.points[i - 1][0], line.points[i][1] - line.points[i - 1][1]);
    const steps = Math.max(1, Math.ceil(len / ROPE_SAMPLE_METRES));
    let run: { x: number; z: number }[] = [];
    let n = 0;
    const flush = (): void => {
      if (run.length >= 2) out.push({ id: `${line.id}#${n++}`, points: run, style: 'rope' });
      run = [];
    };
    for (let s = 0; s <= steps; s++) {
      const q = pointAt(line.points, (len * s) / steps);
      if (safe(() => p.isRevealed(q.x, q.z))) run.push({ x: q.x, z: q.z });
      else flush();
    }
    flush();
  }
  return out;
}

/** Place names once the place is revealed on the fog grid or discovered; Waste places only while the Waste is open. */
export function wasteLabels(p: WastePorts): MapLabel[] {
  const open = p.open.includes(WASTE_REGION);
  const out: MapLabel[] = [];
  for (const w of WASTE_LABEL_PLACES) {
    if (w.insideWaste && !open) continue;
    const at = ACT4_PLACES[w.id];
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) continue;
    const found = placeDiscoveredFlag(w.id);
    const seen = safe(() => p.isRevealed(at.x, at.z)) || (found !== null && safe(() => p.flag(found)));
    if (seen) out.push({ id: `place.${w.id}`, x: at.x, z: at.z, text: p.t(`map.place.${w.id}`) });
  }
  return out;
}

/** The storm shelters as map points (not travelable), revealed by the fog grid, only while the Waste is open. */
export function wasteShelters(p: WastePorts): { id: string; x: number; z: number; label: string }[] {
  if (!p.open.includes(WASTE_REGION)) return [];
  return SHELTER_SPOTS.filter((s) => safe(() => p.isRevealed(s.at.x, s.at.z))).map((s) => ({
    id: `waste.${s.id}`,
    x: s.at.x,
    z: s.at.z,
    label: p.t('map.shelter'),
  }));
}

/** Stable signature, so a caller can reuse arrays while nothing changed. */
export const linesKey = (lines: readonly MapLine[]): string => lines.map((l) => `${l.id}:${l.points.length}`).join('|');
