// M28's climb (the lower spine above the lodge): a trailhead beside the pass road about 1,200 m up from the lodge, an off-road
// climb of about 500 m to the Wyrmwatch crag lookout (K1's `m28-crag` plateau), two Leap ledges, four cairns (a frozen climber, a
// rope anchor, a hawk-pecked pack, a rime marker) and the spawn anchors for six hawks, the crag ogre and a hunter scout.
// Structures and anchors only; K13 owns the interactables and the quest.
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, headingTo, ledge, LEDGE_HEIGHT, numbered, polar, solid, sphere, type Part } from './helpers';
import { fitLedge } from './fit';
import type { XZ } from './inputs';
import { pathLength, pathPoint, windingPath } from './paths';
import type { Sites } from './sites';

/** The trailhead is this far up the pass road from the lodge's pass gate (the plan's 1,200 m ridden). */
export const M28_TRAILHEAD_S = 1200;
/** The climb is about this long on foot (the plan: 1,000 m there and back). */
export const M28_CLIMB_LENGTH = 500;
const LEDGE_AT = [0.35, 0.72];
const CAIRN_AT = [0.2, 0.45, 0.65, 0.85];

export interface M28Info {
  trailhead: XZ;
  trailheadS: number;
  climb: XZ[];
  climbLength: number;
  leaps: StructureSpec[];
  launches: XZ[];
  specs: StructureSpec[];
}

export function m28Layout(s: Sites, passGateS: number): { part: Part; info: M28Info } {
  const G = s.crag;
  const trailheadS = Math.min(passGateS + M28_TRAILHEAD_S, s.road.length);
  const th = s.road.point(trailheadS, s.roadHalf + 4);
  const trailhead = { x: th.x, z: th.z };
  const climb = windingPath(trailhead, { x: G.cx, z: G.cz }, M28_CLIMB_LENGTH, 5);
  const climbLength = pathLength(climb);
  const along = (f: number, side: number): XZ => {
    const p = pathPoint(climb, climbLength * f);
    return { x: p.x - p.dirZ * side, z: p.z + p.dirX * side };
  };

  const leaps = LEDGE_AT.map((f, i) => {
    const fitted = fitLedge(s.h, along(f, 4));
    if (!fitted) throw new Error(`dragonspine: no climbable ground for M28's Leap ledge ${i + 1}`);
    return { spec: ledge(`dragonspine-m28-ledge-${i + 1}`, fitted.x, fitted.z), launch: fitted.launch };
  });
  const leapSpecs = leaps.map((l) => l.spec);
  const cairns = CAIRN_AT.map((f, i) => {
    const p = along(f, -3);
    return solid(`dragonspine-m28-cairn-${i + 1}`, 'rock', p.x, p.z, 1.4, 1.4, 1.4);
  });
  const lookout = solid('dragonspine-m28-lookout-cairn', 'rock', G.cx + 4, G.cz + 4, 2, 2, 1.8);
  const scout = along(0.55, 9);

  const part: Part = {
    ...emptyPart(),
    anchors: [
      a('dragonspine.m28.trailhead', trailhead.x, trailhead.z, 0, ['objective']),
      ...leaps.map((l, i) => a(`dragonspine.m28.leap.${i + 1}`, l.spec.x, l.spec.z, 0, ['poi', 'leap-gated'], { onStructure: l.spec.id, dy: LEDGE_HEIGHT })),
      ...leaps.map((l, i) => a(`dragonspine.m28.leap.${i + 1}.launch`, l.launch.x, l.launch.z, headingTo(l.launch.x, l.launch.z, l.spec.x, l.spec.z), ['poi'])),
      ...numbered('dragonspine.m28.cairn', cairns.map((c) => [c.x, c.z + 2] as const), ['objective'], 0),
      a('dragonspine.m28.crag', G.cx, G.cz, 0, ['objective']),
      ...Array.from({ length: 6 }, (_, i) => {
        const [x, z] = polar(G.cx, G.cz, 20 + 60 * i, 12);
        return a(`dragonspine.spawn.m28.hawk-${i + 1}`, x, z, 0, ['spawn']);
      }),
      a('dragonspine.spawn.m28.ogre', G.cx - 8, G.cz - 12, 0, ['spawn']),
      a('dragonspine.spawn.m28.scout', scout.x, scout.z, 0, ['spawn']),
    ],
    triggers: [sphere('trg.dragonspine.m28.trailhead', trailhead.x, trailhead.z, 12), sphere('trg.dragonspine.m28.crag', G.cx, G.cz, 20)],
    structures: [...leapSpecs, ...cairns, lookout],
  };
  return { part, info: { trailhead, trailheadS, climb, climbLength, leaps: leapSpecs, launches: leaps.map((l) => l.launch), specs: part.structures } };
}
