// Harrowmark H2 (main street and market): trodden earth on the main street, the market ring, the Guild alley and the fountain circuit, a stone
// apron round the dry fountain, and packed ground in the market centre, the dyers' yard and the timber yard (plans/env-pass/h2/concept.md
// section 5, rulings 2026-10-24 19:26 and 20:57). Zone data only; the mechanism is in groundSplat.ts. Coordinates are world metres.
// The market and fountain "plazas" of the sheet are not paved over their whole 36 to 38 m radius (the H3 shot review: a deep stone floor
// reads as a grey desert and cannot be dressed): the fountain gets a stone apron to its footprint plus 4 m, and the market centre
// (8752..8812 x 1490..1550, ground cover only by the sheet) is trodden lawn with the blades growing through it.
import type { SplatZone } from './groundSplat';

const STREET_EDGE = 2.5;
const YARD_EDGE = 8;
const COURT_EDGE = 3;

/** The eight corners of an octagon lane (the layout's `ring`), closed so the street zone runs all the way round. */
const ring = (cx: number, cz: number, r: number, phase = 0): Array<[number, number]> => {
  const pts = Array.from({ length: 8 }, (_, k) => {
    const t = phase + (k * 2 * Math.PI) / 8;
    return [Math.round(cx + r * Math.sin(t)), Math.round(cz + r * Math.cos(t))] as [number, number];
  });
  return [...pts, pts[0]!];
};

export const H2_SPLAT_ZONES: readonly SplatZone[] = [
  // Main street south (crowd lane main-street-south, hw 8, trodden over hw 6) from H1's end (H1's zone overshoots to z 1452) to the fountain.
  { kind: 'street', id: 'h2.main-street-south', pts: [[8490, 1428], [8490, 1520], [8490, 1590], [8490, 1640], [8462, 1670], [8460, 1700]], halfWidth: 6, edge: STREET_EDGE },
  // Main street north / the keep road from the fountain to the tile's north edge (z 1960); H3's zone starts at z 1948 and overlaps.
  { kind: 'street', id: 'h2.keep-road', pts: [[8490, 1730], [8490, 1770], [8490, 1850], [8490, 1930], [8490, 1972]], halfWidth: 6, edge: STREET_EDGE },
  // The fountain circuit (crowd lane hw 4) and the market ring (hw 3).
  { kind: 'street', id: 'h2.fountain-circuit', pts: ring(8500, 1700, 32, Math.PI / 8), halfWidth: 3.2, edge: STREET_EDGE },
  { kind: 'street', id: 'h2.market-ring', pts: ring(8780, 1520, 30), halfWidth: 2.4, edge: STREET_EDGE },
  // The Guild alley (crowd lane hw 1.5, the patrol line z 1523.5): trodden 2.5 wide.
  { kind: 'street', id: 'h2.guild-alley', pts: [[8940, 1525], [8958, 1525], [8985, 1525], [9015, 1525], [9040, 1532], [9060, 1542]], halfWidth: 2, edge: STREET_EDGE },
  // The market centre (ground cover only by the sheet; the coin trail runs through it): trodden lawn, not paving.
  { kind: 'yard', id: 'h2.market-centre', x0: 8748, x1: 8816, z0: 1486, z1: 1554, edge: YARD_EDGE, strength: 0.5, keepBlades: true },
  // Stone apron round the dry Silver Fountain: its 12 x 12 m footprint plus 4 m. The flower ring (r 7.6) stands in it as planting beds; the
  // benches (r 10.5) and lanterns (r 12.5) are the rim.
  { kind: 'court', id: 'h2.fountain-apron', x0: 8490, x1: 8510, z0: 1690, z1: 1710, edge: COURT_EDGE },
  // Dyers' yard where the alley comes out (vats, cloth lines: x 9000..9032, z 1474..1510) and the timber yard (x 9124..9140, z 1760..1790).
  ...(
    [
      ['dyers-yard', 8998, 9036, 1470, 1514, 0.6],
      ['timber-yard', 9118, 9146, 1754, 1796, 0.55],
    ] as const
  ).map(([name, x0, x1, z0, z1, strength]): SplatZone => ({ kind: 'yard', id: `h2.${name}`, x0, x1, z0, z1, edge: YARD_EDGE, strength, keepBlades: true })),
];
