// Harrowmark H4 (Forge Row and the chapel): trodden earth on Forge Row, the ore track to the Underways door, the Bastion's edge lane and
// the chapel approach, and packed, trodden yards (the blades keep growing through them) where the work is: the smithy yards along the row,
// the Tilted Anvil's yard, the Bastion yard, the apron of the Underways door, the charcoal yard and the West Gate's inside yard
// (plans/env-pass/h4/concept.md section 6, rulings 2026-10-24 20:57). The soot round Forge Row, the old smelter yard and the charcoal yard is
// in splatZones.h3.ts (the H3 builder landed it first). No stone courts here. Zone data only; the mechanism is in groundSplat.ts.
// Yards follow the H1 to H3 rule: the frozen trigger box or the objects they serve plus 4 to 8 m, never the sheet's whole yard rectangles
// (the old smelter yard of the sheet is 165 x 155 m, the Bastion's trigger box 140 x 110 m: trodden lawn at partial strength, not a floor).
import type { SplatZone } from './groundSplat';

const STREET_EDGE = 2.5;
const YARD_EDGE = 6;

/** The Bastion yard's trigger box (trg.harrowmark.bastion-yard: centre 8200, 1735, half 70 x 55). */
export const BASTION_BOX = { x0: 8130, x1: 8270, z0: 1680, z1: 1790 } as const;

export const H4_SPLAT_ZONES: readonly SplatZone[] = [
  // Forge Row (crowd lane forge-row, hw 6, trodden over hw 5).
  { kind: 'street', id: 'h4.forge-row', pts: [[8096, 1520], [8140, 1520], [8180, 1520], [8230, 1520], [8296, 1520]], halfWidth: 5, edge: STREET_EDGE },
  // The ore track from Forge Row's west end to the Underways door (the D02 corridor, 4.5 m: trodden 2.5 m wide inside it).
  { kind: 'street', id: 'h4.ore-track', pts: [[8098, 1520], [8060, 1527], [8020, 1534], [7985, 1540], [7961, 1545]], halfWidth: 2.5, edge: STREET_EDGE },
  // The Bastion's edge lane (crowd lane bastion-edge, hw 5, trodden over hw 4).
  { kind: 'street', id: 'h4.bastion-edge', pts: [[8292, 1690], [8292, 1740], [8292, 1790], [8292, 1850]], halfWidth: 4, edge: STREET_EDGE },
  // The chapel approach (crowd lane chapel-approach, hw 4, trodden over hw 3), from the keep road's trodden edge to the chapel door.
  { kind: 'street', id: 'h4.chapel-approach', pts: [[8486, 2150], [8430, 2150], [8392, 2150], [8358, 2150]], halfWidth: 3, edge: STREET_EDGE },
  // Packed, trodden yards (the blades keep growing; the soot ellipses darken the ground round Forge Row).
  // The smithy yards between the houses and the lane (z 1493..1513 and 1527..1547) and the back lane behind the north row: strips 20 to 24 m deep.
  ...(
    [
      ['forge-yards-north', 8095, 8295, 1493, 1513, 0.55],
      ['forge-yards-south', 8095, 8295, 1527, 1547, 0.55],
      ['forge-back-lane', 8095, 8290, 1448, 1464, 0.45],
      // The Tilted Anvil's yard: the sign trigger (r 7 at 8204, 1645: box 8197..8211 x 1638..1652) plus 8 m, and the clerk's bench round (8236, 1640).
      ['anvil-yard', 8189, 8250, 1630, 1660, 0.5],
      // The Underways door: its gatehouse apron where the ore track ends (the door's trigger r 2 at 7958, 1545, plus 8 m and the track's mouth).
      ['underways-apron', 7940, 7990, 1531, 1559, 0.5],
      // The charcoal yard: the clamps' bounding box (7976..8036 x 1640..1676) plus 8 m.
      ['charcoal-yard', 7968, 8044, 1632, 1684, 0.45],
      // The West Gate's inside yard: the gate throat's inside anchor (7780, 2164) plus 8 m and the wagon turn.
      ['west-gate-yard', 7772, 7812, 2148, 2182, 0.5],
    ] as const
  ).map(([name, x0, x1, z0, z1, strength]): SplatZone => ({ kind: 'yard', id: `h4.${name}`, x0, x1, z0, z1, edge: YARD_EDGE, strength, keepBlades: true })),
  // The Bastion yard (M07 drill, R02): the trigger box plus 4 m, trodden lawn with the blades through it (a 148 x 118 m packed floor read as a desert).
  { kind: 'yard', id: 'h4.bastion-yard', x0: BASTION_BOX.x0 - 4, x1: BASTION_BOX.x1 + 4, z0: BASTION_BOX.z0 - 4, z1: BASTION_BOX.z1 + 4, edge: YARD_EDGE, strength: 0.5, keepBlades: true },
];
