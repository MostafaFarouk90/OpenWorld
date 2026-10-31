// The summit gate (PR 2) on K1's summit-gate plateau: a stone arch over the Rime Pass at K1's `fog.summit` face, two pillars clear
// of the road and a wall stub each side, cut short where it would reach K1's Skyhold spur. Dressing only: the fog face (K1's) is
// the one blocker; the arch is open and the stubs leave the road and the spur free. Eadgyth's summit-gate post (M31's added beat).
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, open, solid, sphere, type Part } from './helpers';
import type { XZ } from './inputs';
import type { Road } from './road';
import type { SummitSites } from './summitSites';

/** The arch stands this far on the open (south) side of the fog face. */
export const ARCH_SOUTH = 4;
export const PILLAR = 3;
export const ARCH_H = 9;
export const STUB_T = 3;
export const STUB_H = 5;
/** The shortest stub worth building. */
const STUB_MIN = 4;

export interface SummitGateInfo {
  arch: XZ;
  pillars: StructureSpec[];
  stubs: StructureSpec[];
  eadgyth: XZ;
  specs: StructureSpec[];
}

/** True when every corner and edge midpoint of the footprint keeps `clear` metres from the road's centre line. */
function offRoad(spec: StructureSpec, road: Road, clear: number): boolean {
  const [w, d] = spec.footprint;
  const pts: XZ[] = [];
  for (const fx of [-0.5, 0, 0.5]) for (const fz of [-0.5, 0, 0.5]) pts.push({ x: spec.x + fx * w, z: spec.z + fz * d });
  return pts.every((p) => road.nearest(p.x, p.z).d >= clear);
}

export function summitGateLayout(s: SummitSites, pass: Road, roadHalf: number): { part: Part; info: SummitGateInfo } {
  const G = s.gate;
  const z = s.face.z - ARCH_SOUTH;
  const x = s.face.x;
  const span = roadHalf + 2 + PILLAR / 2 + 0.5;
  const pillars = [-1, 1].map((k, i) => solid(`dragonspine-summit-gate-pillar-${i + 1}`, 'dragonspine-gate-pillar', x + k * span, z, PILLAR, PILLAR, ARCH_H));
  const arch = open('dragonspine-summit-gate-arch', 'dragonspine-gate-arch', x, z, 2 * span + PILLAR, PILLAR, ARCH_H);
  const stubs: StructureSpec[] = [];
  for (const k of [-1, 1]) {
    const inner = x + k * (span + PILLAR / 2);
    let outer = k < 0 ? G.minX + 2 : G.maxX - 2;
    // Shorten from the outer end until the stub keeps clear of both roads (the pass and the spur leaving the pad's west edge).
    for (; Math.abs(outer - inner) >= STUB_MIN; outer -= k) {
      const spec = solid(`dragonspine-summit-gate-wall-${k < 0 ? 'w' : 'e'}`, 'wall', (inner + outer) / 2, z, Math.abs(outer - inner), STUB_T, STUB_H);
      if (offRoad(spec, pass, roadHalf + 2) && offRoad(spec, s.spur, s.spurHalf + 2)) {
        stubs.push(spec);
        break;
      }
    }
  }
  const eadgyth = { x: x + span + 4, z: z - 7 };
  const part: Part = {
    ...emptyPart(),
    anchors: [
      a('dragonspine.summit-gate', x, z - 10, 0, ['poi']),
      // Facing the road (west), on the open side, clear of the pillar.
      a('dragonspine.summit-gate.eadgyth', eadgyth.x, eadgyth.z, 270, ['npc-post']),
    ],
    triggers: [sphere('trg.dragonspine.summit-gate', x, z - 6, Math.min(G.w, G.d) / 2)],
    structures: [...pillars, arch, ...stubs],
  };
  return { part, info: { arch: { x, z }, pillars, stubs, eadgyth, specs: part.structures } };
}
