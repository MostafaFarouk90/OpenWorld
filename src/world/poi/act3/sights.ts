// The sight list the road sight rule reads (thread K2): K2's points of interest and dressing, plus what other threads shipped
// near the three roads (K1's places and waystones, the tall structures of the Harrowmark, Oldsmoke, Greyfen and Dragonspine
// layouts, the R17 waysides and every waystone or `poi` anchor). Frozen data, no heights.
import { DRAGONSPINE_LAYOUT } from '../../../dragonspine/dragonspine.layout';
import { GREYFEN_LAYOUT } from '../../../greyfen/greyfen.layout';
import { HARROWMARK_LAYOUT } from '../../../harrowmark/harrowmark.layout';
import { OLDSMOKE_LAYOUT } from '../../../oldsmoke/oldsmoke.layout';
import { ACT3_PLACES, ACT3_WAYSTONES } from '../../../region/act3/act3Places';
import { structureHeight } from '../../../region/greybox';
import type { LayoutData, StructureSpec } from '../../../region/layoutTypes';
import { ACT3_DRESSING_PLACED, DRESSING_HEIGHT } from './dressing';
import { ACT3_POI_PLACED } from './place';
import type { Sight } from './sight';

const SHIPPED: readonly LayoutData[] = [HARROWMARK_LAYOUT, OLDSMOKE_LAYOUT, GREYFEN_LAYOUT, DRAGONSPINE_LAYOUT];

/** A structure's height; kinds other plugins register at setup are not known here, so their spec height (or 4 m) stands. */
function heightOf(s: StructureSpec): number {
  try {
    return structureHeight(s);
  } catch {
    return s.height ?? 4;
  }
}

export function shippedSights(): Sight[] {
  const out: Sight[] = [];
  for (const [id, p] of Object.entries(ACT3_PLACES)) out.push({ id: `place:${id}`, x: p.x, z: p.z, height: 6, range: 700 });
  for (const [id, p] of Object.entries(ACT3_WAYSTONES)) out.push({ id: `waystone:${id}`, x: p.x, z: p.z, height: 3, range: 450 });
  for (const l of SHIPPED) {
    for (const s of l.structures) {
      const h = heightOf(s);
      if (h >= 4) out.push({ id: `structure:${s.id}`, x: s.x, z: s.z, height: h, range: 700 });
    }
    for (const a of l.anchors) {
      const t = a.tags ?? [];
      if (t.includes('waystone') || t.includes('poi') || a.id.includes('wayside')) out.push({ id: `anchor:${a.id}`, x: a.x, z: a.z, height: 2, range: 250 });
    }
  }
  return out;
}

export function k2Sights(): Sight[] {
  const pois = ACT3_POI_PLACED.map((p) => ({ id: `poi:${p.id}`, x: p.pose.x, z: p.pose.z, height: p.leap ? 3.6 : 4, range: 450 }));
  const dressing = ACT3_DRESSING_PLACED.map((d) => ({
    id: `dressing:${d.site.id}`,
    x: d.pose.x,
    z: d.pose.z,
    height: DRESSING_HEIGHT[d.site.kind],
    range: DRESSING_HEIGHT[d.site.kind] >= 6 ? 450 : 220,
  }));
  return [...pois, ...dressing];
}
