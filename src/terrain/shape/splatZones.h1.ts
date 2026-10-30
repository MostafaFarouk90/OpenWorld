// Harrowmark H1 (south gate and outer ward): the ground-colour zones of trodden earth (streets, narrower than the crowd lanes they follow)
// and packed earth (yards). Zone data only; the mechanism is in groundSplat.ts. H2, H3 and H4 add their own splatZones.<tile>.ts and list
// it in SPLAT_ZONES there. Coordinates are world metres. Values come from the H1 designer sheet (plans/env-pass/h1/cameras.json `world`).
import type { SplatZone } from './groundSplat';

/** Soft edge (m) of a street, measured outward from its half width. */
const STREET_EDGE = 2.5;
/** Width (m) of a yard's soft edge, centred on its rectangle's side. */
const YARD_EDGE = 8;

export const H1_SPLAT_ZONES: readonly SplatZone[] = [
  // Main street south of the market: the crowd lane main-street-south (hw 8) trodden over hw 6. It runs on north past z 1440 (H2 continues
  // it); the end here overshoots the tile core by 12 m so the two tiles' zones overlap at full strength.
  { kind: 'street', id: 'h1.main-street', pts: [[8490, 1290], [8490, 1360], [8490, 1440], [8490, 1452]], halfWidth: 6, edge: STREET_EDGE },
  // The gate queue: crowd lane gate-queue (hw 4), from the portcullis into the square.
  { kind: 'street', id: 'h1.gate-queue', pts: [[8500, 1262], [8500, 1285], [8500, 1312], [8495, 1345]], halfWidth: 4, edge: STREET_EDGE },
  // The M06 gate square: packed earth only under the patrol box plus a 10 m rim (shot review: the whole 100 m square read as a desert). The rim
  // is lawn with blades (CITY_LAWN) and the dressing (supply piles, benches, limes, handcarts).
  { kind: 'yard', id: 'h1.gate-square', x0: 8454, x1: 8546, z0: 1262, z1: 1334, edge: YARD_EDGE },
  // Every other yard is trampled ground, not bare floor: part earth (strength 0.6 to 0.7) with the meadow blades growing through it, so the
  // rest of each yard reads as worn grass between the props. Rectangles are the sheet's yards.
  ...(
    [
      ['drill-yard', 8318, 8404, 1368, 1414, 0.7],
      ['paddock', 8604, 8692, 1358, 1426, 0.6],
      ['carters-yard', 8695, 8790, 1335, 1425, 0.6],
      ['camp-in', 8200, 8312, 1350, 1432, 0.6],
      ['repair-yard', 8150, 8215, 1310, 1372, 0.7],
      ['camp-in-annex', 8200, 8318, 1352, 1442, 0.6],
      ['stables-apron', 8606, 8690, 1384, 1424, 0.6],
      ['camp-out', 8392, 8486, 1180, 1245, 0.6],
      ['carters-out', 8510, 8600, 1180, 1246, 0.6],
    ] as const
  ).map(([name, x0, x1, z0, z1, strength]): SplatZone => ({ kind: 'yard', id: `h1.${name}`, x0, x1, z0, z1, edge: YARD_EDGE, strength, keepBlades: true })),
];
