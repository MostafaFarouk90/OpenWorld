// Stonefold on A1's STONEFOLD_PLATEAU: the Warden holdfast (a 120 m walled yard with a south gate, four corner towers, the
// trial ring, the brothers' hall with its shield, cairn and rune-stone), the waystone outside the gate, the hound den
// (R07) and the wyrm den above the settlement (R11) on A1's den shelf with its two Leap ledges.
import { ledgeCluster } from '../region/corridor.layout';
import { LAUNCH_BACK } from './ledgeFit';
import type { LayoutData, StructureSpec } from '../region/layoutTypes';
import { a, numbered, open, ring, solid, sphere } from './helpers';
import { DEN_SHELF as D, LEDGE_SPOTS, STONEFOLD as S } from './sites';
import { SITES_FIT } from './sitesFit';

const HALF = 60;
const TOWER = 7;
const WALL_T = 2.4;
const WALL_H = 5;
const GATE_HALF = 7;
const along = (from: number, to: number) => ({ centre: (from + to) / 2, len: to - from });

/** A leap ledge cluster with its top anchor and the launch anchor south of it (the Act 1 template), on fitted ground. */
export function ledgeSite(prefix: string, anchorId: string, spot: { x: number; z: number }): { structures: StructureSpec[]; anchors: LayoutData['anchors'] } {
  const { x: cx, z: cz } = spot;
  return {
    structures: ledgeCluster(prefix, cx, cz),
    anchors: [
      a(anchorId, cx, cz + 1, 180, ['poi', 'leap-gated'], { dy: 2, onStructure: `${prefix}-ledge` }),
      a(`${anchorId}.launch`, cx, cz - LAUNCH_BACK, 0, ['poi']),
    ],
  };
}

export function stonefoldLayout(): Pick<LayoutData, 'anchors' | 'triggers' | 'structures'> {
  const lo = HALF - TOWER / 2 - 0.3;
  const wallX = along(-lo, lo);
  const south = [along(-lo, -GATE_HALF), along(GATE_HALF, lo)];
  const walls: StructureSpec[] = [
    solid('cinderreach-stonefold-wall-n', 'wall', S.x + wallX.centre, S.z + HALF, wallX.len, WALL_T, WALL_H),
    solid('cinderreach-stonefold-wall-s1', 'wall', S.x + south[0].centre, S.z - HALF, south[0].len, WALL_T, WALL_H),
    solid('cinderreach-stonefold-wall-s2', 'wall', S.x + south[1].centre, S.z - HALF, south[1].len, WALL_T, WALL_H),
    solid('cinderreach-stonefold-wall-w', 'wall', S.x - HALF, S.z + wallX.centre, WALL_T, wallX.len, WALL_H),
    solid('cinderreach-stonefold-wall-e', 'wall', S.x + HALF, S.z + wallX.centre, WALL_T, wallX.len, WALL_H),
    ...[
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([sx, sz], i) => solid(`cinderreach-stonefold-tower-${i + 1}`, 'tower', S.x + sx * HALF, S.z + sz * HALF, TOWER, TOWER, 9)),
  ];
  const hall = { x: S.x, z: S.z + 40 };
  const gateStone = { x: S.x + 18, z: S.z - 75 };
  const lax = ledgeSite('cinderreach-den-ledge-1', 'cinderreach.den.ledge.1', LEDGE_SPOTS['den-1']);
  const lbx = ledgeSite('cinderreach-den-ledge-2', 'cinderreach.den.ledge.2', LEDGE_SPOTS['den-2']);
  const den = SITES_FIT.houndDen;

  return {
    anchors: [
      a('waystone.stonefold', gateStone.x, gateStone.z - 1.8, 0, ['waystone']),
      // M13: the trial ring (A5's duel), the log-carry laps, the boulder, the brothers' hall search points.
      a('cinderreach.stonefold.ring.centre', S.x, S.z, 0, ['objective']),
      a('cinderreach.stonefold.ring.player', S.x, S.z - 6, 0, ['objective']),
      a('cinderreach.stonefold.ring.hrolf', S.x, S.z + 6, 180, ['objective']),
      ...numbered('cinderreach.m13.log', [[S.x - 30, S.z - 30], [S.x + 30, S.z - 30], [S.x + 30, S.z + 10]], ['objective']),
      a('cinderreach.m13.boulder', S.x - 45, S.z - 20, 0, ['objective']),
      a('cinderreach.m13.boulder.goal', S.x - 45, S.z + 25, 0, ['objective']),
      ...numbered('cinderreach.m13.hall', [[S.x - 14, S.z + 25], [S.x, S.z + 26], [S.x + 14, S.z + 25]], ['objective'], 0),
      a('npc-post.hrolf', S.x + 10, S.z, 270, ['npc-post']),
      a('npc-post.ketta.stonefold', S.x - 10, S.z - 2, 90, ['npc-post']),
      ...numbered('cinderreach.post.stonefold', [[S.x - 20, S.z + 12], [S.x + 20, S.z + 12]], ['npc-post'], 0),
      ...numbered('cinderreach.spawn.stonefold', [[S.x - 120, S.z - 120], [S.x - 100, S.z - 140], [S.x + 120, S.z - 130]], ['spawn'], 0),
      // R07: the hound den.
      ...numbered('cinderreach.spawn.houndden', ring(den.x, den.z, 8, 4, 45), ['spawn']),
      ...numbered('cinderreach.r07.sign', ring(den.x, den.z, 14, 5, 0), ['objective']),
      ...numbered('cinderreach.r07.pup', [[den.x - 2, den.z + 1], [den.x + 2, den.z - 1]], ['objective']),
      // R11: the wyrm den on the shelf, the brother's camp and axe, the resting wyrm's mark.
      a('cinderreach.den.wyrm.rest', D.x, D.z, 90, ['spawn']),
      ...numbered('cinderreach.r11.camp', [[D.x - 18, D.z - 10], [D.x - 18, D.z + 10], [D.x - 24, D.z]], ['objective']),
      a('cinderreach.r11.axe', D.x - 22, D.z + 12, 90, ['objective']),
      ...lax.anchors,
      ...lbx.anchors,
    ],
    triggers: [sphere('trg.cinderreach.den', D.x, D.z, 40), sphere('trg.cinderreach.r07.den', den.x, den.z, 20)],
    structures: [
      ...walls,
      solid('cinderreach-stonefold-hall', 'house', hall.x, hall.z, 16, 10),
      solid('cinderreach-stonefold-house-1', 'house', S.x - 38, S.z - 30, 8, 8),
      solid('cinderreach-stonefold-house-2', 'house', S.x + 38, S.z - 30, 8, 8),
      open('cinderreach-stonefold-ring', 'cinder-trial-ring', S.x, S.z, 16, 16),
      solid('cinderreach-stonefold-cairn', 'cinder-cairn', S.x - 14, S.z + 29, 2.4, 2.4),
      solid('cinderreach-stonefold-shield', 'cinder-shield', S.x, S.z + 29, 1.2, 0.4),
      solid('cinderreach-stonefold-rune-stone', 'cinder-rune-stone', S.x + 14, S.z + 29, 1.4, 0.8),
      solid('cinderreach-waystone-stonefold', 'waystone', gateStone.x, gateStone.z, 1.6, 1.6, 2.4),
      ...lax.structures,
      ...lbx.structures,
    ],
  };
}
