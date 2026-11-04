// Skyhold Cliffs (M33, PR 2) on K1's skyhold-top plateau at the end of the Skyhold spur: the hunters' rig camp (a tent, the
// rigging table, a rope coil and the net rack: the rigging plan, a Vey seal, the Aerie map, a coil of Vey rope and a net-maker's
// tally are its searches), six net anchors along the cliff edge west of the camp (`dragonspine.skyhold.net-anchor.1..6`, each the
// last standable point before the edge), the net's six sections (rope-card spans hung over the edge, one per anchor: shown by
// worldChanges.ts until K13's `story.m33.anchorN`), the cliff-ledge footpath (camp, the six anchors, back), two hunter packs of
// four, the posts and the wyrmling flight's escape mark.
import type { StructureSpec } from '../region/layoutTypes';
import { a, emptyPart, headingTo, numbered, open, sphere, type Part } from './helpers';
import type { HeightFn, XZ } from './inputs';
import { pathLength } from './paths';
import { Placer } from './placer';
import { routeOver } from './route';
import { clearOfRuns, freeStand, type SummitSites } from './summitSites';

export const NET_ANCHORS = 6;
/** The anchors run along the cliff from this far south of the plateau to this far north of it. */
const CLIFF_SOUTH = 140;
const CLIFF_NORTH = 40;
/** Ground steeper than this is the cliff; the anchor is the last point before it. */
const EDGE_GRAD = 0.3;
/** How far west of the plateau the edge search goes. */
const EDGE_REACH = 60;
/** The net hangs this far out from its anchor, over the edge. */
export const NET_OUT = 3;
/** The flight escapes this high over the cliff. */
const ESCAPE_ABOVE = 40;

export interface NetSection {
  n: number;
  spec: StructureSpec;
}

export interface SkyholdInfo {
  camp: XZ;
  spurEnd: XZ;
  anchors: XZ[];
  sections: NetSection[];
  /** The cliff-ledge footpath: camp, the six anchors, back to the camp (routed over the ground). */
  ledgePath: XZ[];
  ledgeLength: number;
  specs: StructureSpec[];
}

const fail = (msg: string): never => {
  throw new Error(`dragonspine: ${msg}`);
};

const grad = (h: HeightFn, x: number, z: number): number => Math.hypot((h(x + 1, z) - h(x - 1, z)) / 2, (h(x, z + 1) - h(x, z - 1)) / 2);

/** The last standable point marching west at `z` from inside the plateau, before the ground steepens past EDGE_GRAD. */
export function cliffEdge(h: HeightFn, fromX: number, toX: number, z: number): XZ {
  let last: XZ | null = null;
  for (let x = fromX; x >= toX; x -= 1) {
    if (grad(h, x, z) > EDGE_GRAD) {
      if (last) break;
      continue;
    }
    last = { x, z };
  }
  return last ?? fail(`no standable cliff edge at z ${z.toFixed(0)}`);
}

export function skyholdLayout(s: SummitSites): { part: Part; info: SkyholdInfo } {
  const S = s.skyhold;
  const spurEnd = s.spur.point(s.spur.length);
  const placer = new Placer({ minX: S.minX + 3, maxX: S.maxX - 3, minZ: S.minZ + 3, maxZ: S.maxZ - 3 }, s.spur, s.spurHalf + 2);
  const camp = { x: S.cx + S.w * 0.12, z: S.cz };
  const tent = placer.place('dragonspine-skyhold-tent', 'dragonspine-rig-tent', { x: camp.x + 8, z: camp.z + 20 }, 5, 4, { height: 3, margin: 2 });
  const table = placer.place('dragonspine-skyhold-table', 'dragonspine-rig-table', { x: camp.x, z: camp.z + 8 }, 2.4, 1.2, { mode: 'open', margin: 2 });
  const coil = placer.place('dragonspine-skyhold-rope-coil', 'dragonspine-rope-coil', { x: camp.x + 10, z: camp.z - 6 }, 1.6, 1.6, { mode: 'open', margin: 2 });
  const rack = placer.place('dragonspine-skyhold-net-rack', 'dragonspine-net-rack', { x: camp.x - 4, z: camp.z - 16 }, 4, 1, { mode: 'open', margin: 2 });
  const campSpecs = [tent, table, coil, rack];

  // Six anchors along the cliff edge west of the plateau.
  const z0 = S.minZ - CLIFF_SOUTH;
  const z1 = S.maxZ + CLIFF_NORTH;
  const anchors = Array.from({ length: NET_ANCHORS }, (_, i) => cliffEdge(s.h, S.cx, S.minX - EDGE_REACH, z0 + ((z1 - z0) * i) / (NET_ANCHORS - 1)));
  const sections = anchors.map((p, i): NetSection => {
    const prev = anchors[Math.max(0, i - 1)]!;
    const next = anchors[Math.min(NET_ANCHORS - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const l = Math.hypot(dx, dz) || 1;
    // Outward is to the left of the south-to-north line (west).
    const out = { x: -dz / l, z: dx / l };
    const width = (i === 0 || i === NET_ANCHORS - 1 ? l : l / 2) * 0.95;
    const yaw = ((Math.atan2(-dz, dx) * 180) / Math.PI + 360) % 360;
    const spec = open(`dragonspine-skyhold-net-${i + 1}`, 'dragonspine-net', p.x + out.x * NET_OUT, p.z + out.z * NET_OUT, width, 1.5, 3, Math.round(yaw * 100) / 100);
    if (!clearOfRuns(spec, s.runs)) fail(`net section ${i + 1} stands in a launch run`);
    return { n: i + 1, spec };
  });

  // The cliff-ledge footpath: from the camp to anchor 1, along the six anchors, and back to the camp.
  const stops: XZ[] = [camp, ...anchors, camp];
  const ledgePath: XZ[] = [camp];
  for (let i = 1; i < stops.length; i++) {
    const leg = routeOver(s.h, stops[i - 1]!, stops[i]!, { margin: 80, cell: 6 }) ?? fail(`no walkable cliff-ledge path to stop ${i}`);
    ledgePath.push(...leg.slice(1));
  }

  const avoid = [...campSpecs];
  const stand = (want: XZ, what: string): XZ => freeStand(s.h, want, { radius: 30, maxGrad: 0.5, avoid, clear: 1.5 }) ?? fail(`no standable ground for ${what}`);
  const inland = (p: XZ, d: number, side: number): XZ => ({ x: p.x + d, z: p.z + side });
  const pack = (from: number, tag: string) =>
    [0, 1, 2, 3].map((k) => {
      const p = stand(inland(anchors[from + (k % 3)]!, 10 + 4 * (k >> 1), k % 2 ? 4 : -4), `the ${tag} hunter pack`);
      return a(`dragonspine.spawn.skyhold.${tag}-${k + 1}`, p.x, p.z, 270, ['spawn']);
    });
  const mid = anchors[2]!;
  const midN = anchors[3]!;
  const thorgar = stand({ x: camp.x + 4, z: camp.z + 2 }, 'Thorgar');
  const rigger = stand({ x: camp.x - 6, z: camp.z + 4 }, 'the net-rigger');
  const handler = stand(inland(midN, 6, 0), 'the wyrmling handler');
  const part: Part = {
    ...emptyPart(),
    anchors: [
      a('dragonspine.skyhold.camp', camp.x, camp.z, 270, ['objective']),
      a('dragonspine.skyhold.search.1', table.x, table.z - 1.8, 0, ['objective']),
      a('dragonspine.skyhold.search.2', table.x, table.z + 1.8, 180, ['objective']),
      a('dragonspine.skyhold.search.3', tent.x, tent.z - 3.6, 0, ['objective']),
      a('dragonspine.skyhold.search.4', coil.x - 2, coil.z, 90, ['objective']),
      a('dragonspine.skyhold.search.5', rack.x, rack.z - 1.8, 0, ['objective']),
      ...numbered('dragonspine.skyhold.net-anchor', anchors.map((p) => [p.x, p.z] as const), ['objective'], 270),
      ...pack(0, 'pack-a'),
      ...pack(3, 'pack-b'),
      a('dragonspine.skyhold.thorgar', thorgar.x, thorgar.z, 270, ['npc-post']),
      a('dragonspine.skyhold.rigger', rigger.x, rigger.z, headingTo(rigger.x, rigger.z, table.x, table.z), ['npc-post']),
      a('dragonspine.skyhold.handler', handler.x, handler.z, 270, ['npc-post']),
      a('dragonspine.skyhold.flight.escape', (mid.x + midN.x) / 2 - 60, (mid.z + midN.z) / 2, 270, ['poi', 'elevated'], { dy: ESCAPE_ABOVE }),
    ],
    triggers: [
      sphere('trg.dragonspine.skyhold', S.cx, S.cz, Math.max(S.w, S.d) / 2 + 10),
      sphere('trg.dragonspine.skyhold.cliff', (mid.x + midN.x) / 2, (mid.z + midN.z) / 2, (z1 - z0) / 2 + 20),
    ],
    structures: campSpecs,
  };
  return { part, info: { camp, spurEnd: { x: spurEnd.x, z: spurEnd.z }, anchors, sections, ledgePath, ledgeLength: pathLength(ledgePath), specs: campSpecs } };
}

