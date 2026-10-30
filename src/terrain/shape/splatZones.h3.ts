// Harrowmark H3 (the keep and the Rooftop Ward) and the H4 soot: trodden earth on the keep road and the ward streets, packed earth in the
// service yard, tiltyard and river-gate yard, stone courts under the keep court, the counting yard, the Archive steps and the ward square,
// and the grey soot round Forge Row, the old smelter yard and the charcoal yard (plans/env-pass/h3/concept.md section 6, rulings 2026-10-24
// 20:57). Zone data only; the mechanism is in groundSplat.ts. Coordinates are world metres (the designer's cameras.json `world` block).
import type { SplatZone } from './groundSplat';

const STREET_EDGE = 2.5;
const YARD_EDGE = 8;
/** Stone courts end at a kerb: a tight edge. */
const COURT_EDGE = 3;

export const H3_SPLAT_ZONES: readonly SplatZone[] = [
  // The keep road (crowd lane main-street-north, hw 8, trodden over hw 6). H2 owns the stretch below z 1960; this one starts 12 m south of the
  // tile so the zones overlap at full strength, and ends at the keep court.
  { kind: 'street', id: 'h3.keep-road', pts: [[8490, 1948], [8490, 2010], [8490, 2090], [8490, 2170], [8490, 2250], [8490, 2330], [8490, 2375], [8490, 2420], [8490, 2470], [8490, 2540]], halfWidth: 6, edge: STREET_EDGE },
  // The Rooftop Ward's street (crowd lane rooftop-ward-streets, hw 1) and the M10 run from the vault to the ward stair (2 m).
  { kind: 'street', id: 'h3.ward-street', pts: [[8897, 2250], [8897, 2310], [8897, 2380], [8897, 2430], [8897, 2480], [8897, 2528], [8897, 2540]], halfWidth: 1, edge: STREET_EDGE },
  { kind: 'street', id: 'h3.m10-run', pts: [[8900, 2040], [8900, 2200], [8850, 2231]], halfWidth: 2, edge: STREET_EDGE },
  // Packed yards (no blades): the keep's service yard, the tiltyard and the river-gate yard.
  ...(
    [
      ['service-yard', 8628, 8704, 2552, 2660],
      ['tiltyard', 8252, 8382, 2534, 2586],
      ['river-gate-yard', 9115, 9215, 2115, 2215],
    ] as const
  ).map(([name, x0, x1, z0, z1]): SplatZone => ({ kind: 'yard', id: `h3.${name}`, x0, x1, z0, z1, edge: YARD_EDGE, strength: 0.8 })),
  // The counting yard itself (M09 stealth ground, 8722..8763 x 1972..2023 + 6 m): trodden lawn with the blades growing through it, not paving:
  // a 41 m deep stone floor read as a grey desert from the eye (shot review). Only the door apron is stone.
  { kind: 'yard', id: 'h3.counting-yard', x0: 8716, x1: 8769, z0: 1966, z1: 2029, edge: YARD_EDGE, strength: 0.45, keepBlades: true },
  // Stone courts: the keep court (patrol box plus a rim), the counting yard, the Archive steps and the ward square at the stair foot.
  ...(
    [
      // Trimmed to the frozen box plus 4 to 8 m (the H1 rule): the keep court's patrol box 8466..8534 x 2541..2594 + 4, the counting yard's
      // 8722..8763 x 1972..2023 + 6, the Archive steps, and the ward market round the stair foot (stalls 8846..8924 x 2203..2236 + 6).
      ['keep-court', 8462, 8538, 2537, 2598],
      ['counting-door-apron', 8766, 8790, 1976, 2004],
      ['archive-steps', 8794, 8810, 2066, 2094],
      ['ward-square', 8838, 8932, 2196, 2249],
    ] as const
  ).map(([name, x0, x1, z0, z1]): SplatZone => ({ kind: 'court', id: `h3.${name}`, x0, x1, z0, z1, edge: COURT_EDGE })),
  // Forge Row soot (H4's ground, Act 1 grey inside the wall): the yards along the row, the old smelter yard by the plugged Smelter Gate (the
  // greyest ground in the city) and the charcoal yard. The three ellipses of the designer's soot_at() in gen_h34.py.
  { kind: 'soot', id: 'h3.soot-forge-row', cx: 8180, cz: 1522, rx: 150, rz: 64, inner: 0.55, strength: 0.55 },
  { kind: 'soot', id: 'h3.soot-smelter-yard', cx: 7995, cz: 1555, rx: 100, rz: 82, inner: 0.55, strength: 0.8 },
  { kind: 'soot', id: 'h3.soot-charcoal-yard', cx: 8030, cz: 1662, rx: 72, rz: 46, inner: 0.45, strength: 0.35 },
];
