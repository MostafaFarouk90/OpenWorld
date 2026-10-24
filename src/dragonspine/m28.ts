// M28's climb (the lower spine above the lodge): a trailhead beside the pass road about 1,200 m up from the lodge, an off-road
// climb of about 500 m to the Wyrmwatch crag lookout (K1's `m28-crag` plateau), two Leap ledges, four cairns (a frozen climber, a
// rope anchor, a hawk-pecked pack, a rime marker) and the spawn anchors for six hawks, the crag ogre and a hunter scout.
// Structures and anchors only; K13 owns the interactables and the quest.
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, headingTo, ledge, LEDGE_HEIGHT, numbered, polar, solid, sphere, type Part } from './helpers';
import { fitLedge, standableNear } from './fit';
import type { XZ } from './inputs';
import { pathLength, pathPoint, windingPath } from './paths';
import { routeOver } from './route';
import type { Sites } from './sites';

/** The trailhead is this far up the pass road from the lodge's pass gate (the plan's 1,200 m ridden). */
export const M28_TRAILHEAD_S = 1200;
/** The trailhead is the road point nearest the crag within this many metres of the plan's 1,200 m (the plan: a 500 m climb there). */
const TRAILHEAD_WINDOW = 400;
/** The crag view anchor stands this far over the crag ground. */
export const CRAG_VIEW_ABOVE = 32;
const LEDGE_AT = [0.35, 0.72];
const CAIRN_AT = [0.2, 0.45, 0.65, 0.85];

export interface M28Info {
  trailhead: XZ;
  trailheadS: number;
  climb: XZ[];
  climbLength: number;
  /** False when K1's ground has no walkable line to the crag and the climb is only the straight line. */
  walkable: boolean;
  leaps: StructureSpec[];
  launches: XZ[];
  specs: StructureSpec[];
}

export function m28Layout(s: Sites, passGateS: number): { part: Part; info: M28Info } {
  const G = s.crag;
  // Where the climb leaves the road: the road point nearest the crag within TRAILHEAD_WINDOW of the plan's distance up the road.
  const want = Math.min(passGateS + M28_TRAILHEAD_S, s.road.length);
  let trailheadS = want;
  let nearest = Infinity;
  for (let ds = -TRAILHEAD_WINDOW; ds <= TRAILHEAD_WINDOW; ds += 10) {
    const at = Math.min(Math.max(want + ds, passGateS + 100), s.road.length);
    const p = s.road.point(at, s.roadHalf + 4);
    const d = Math.hypot(p.x - G.cx, p.z - G.cz);
    if (d < nearest) {
      nearest = d;
      trailheadS = at;
    }
  }
  const th = s.road.point(trailheadS, s.roadHalf + 4);
  const trailhead = { x: th.x, z: th.z };
  const routed = routeOver(s.h, trailhead, { x: G.cx, z: G.cz });
  const climb = routed ?? windingPath(trailhead, { x: G.cx, z: G.cz }, 0, 1);
  const climbLength = pathLength(climb);
  const along = (f: number, side: number): XZ => {
    const p = pathPoint(climb, climbLength * f);
    return { x: p.x - p.dirZ * side, z: p.z + p.dirX * side };
  };

  // Each Leap ledge sits where the climb has ground it can be fitted on: nearest the wanted share of the climb, then further along or back.
  const taken: XZ[] = [];
  const leaps = LEDGE_AT.map((f, i) => {
    for (let k = 0; k <= 16; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const at = f + sign * k * 0.025;
        if (at < 0.08 || at > 0.92) continue;
        const fitted = fitLedge(s.h, along(at, 4));
        if (!fitted || taken.some((t) => Math.hypot(t.x - fitted.x, t.z - fitted.z) < 25)) continue;
        taken.push(fitted);
        return { spec: ledge(`dragonspine-m28-ledge-${i + 1}`, fitted.x, fitted.z), launch: fitted.launch };
      }
    }
    throw new Error(`dragonspine: no climbable ground for M28's Leap ledge ${i + 1}`);
  });
  const leapSpecs = leaps.map((l) => l.spec);
  const cairns = CAIRN_AT.map((f, i) => {
    const p = along(f, -3);
    return solid(`dragonspine-m28-cairn-${i + 1}`, 'rock', p.x, p.z, 1.4, 1.4, 1.4);
  });
  const lookout = solid('dragonspine-m28-lookout-cairn', 'rock', G.cx + 4, G.cz + 4, 2, 2, 1.8);
  const scout = standableNear(s.h, along(0.55, 9));

  const part: Part = {
    ...emptyPart(),
    anchors: [
      a('dragonspine.m28.trailhead', trailhead.x, trailhead.z, 0, ['objective']),
      ...leaps.map((l, i) => a(`dragonspine.m28.leap.${i + 1}`, l.spec.x, l.spec.z, 0, ['poi', 'leap-gated'], { onStructure: l.spec.id, dy: LEDGE_HEIGHT })),
      ...leaps.map((l, i) => a(`dragonspine.m28.leap.${i + 1}.launch`, l.launch.x, l.launch.z, headingTo(l.launch.x, l.launch.z, l.spec.x, l.spec.z), ['poi'])),
      ...numbered('dragonspine.m28.cairn', cairns.map((c) => { const p = standableNear(s.h, { x: c.x, z: c.z + 2 }); return [p.x, p.z] as const; }), ['objective'], 0),
      a('dragonspine.m28.crag', G.cx, G.cz, 0, ['objective']),
      // K13's camera override: the eye-level line from the crag to the lodge is blocked, so the shot is taken from above.
      a('dragonspine.m28.crag.view', G.cx, G.cz, 0, ['poi', 'elevated'], { dy: CRAG_VIEW_ABOVE }),
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
  return { part, info: { trailhead, trailheadS, climb, climbLength, walkable: routed !== null, leaps: leapSpecs, launches: leaps.map((l) => l.launch), specs: part.structures } };
}
