// The Caldera's ambient spawn anchors (Act 5 N5, plans/act5-N5.md section 6; sub-prefix `caldera.fauna.`). One anchor per
// group member on a small ring round the group's site. Every site is one of N1's `CALDERA_FAUNA_SITES` (dry ground, off the
// lava), so nothing here names an absolute position. Plain data; CALDERA_FAUNA_ANCHORS.md is generated from it.
import type { AnchorSpec, LayoutData } from '../../region/layoutTypes';
import { CALDERA_FAUNA_SITES } from '../../caldera/calderaSites';
import type { EnemyKind } from '../types';
import type { EnemySkinId } from '../skins';
import type { AreaId } from '../../region/areas';
import type { WarhostRole } from '../types';

export const CALDERA_FAUNA_DOC = { title: 'Caldera ambient spawn anchors (N5)', source: 'enemies/act5/calderaFauna.layout.ts' } as const;

/** When a group is live: outside the wall once the Caldera opens, inside once the Rim Gate opens, the Foundry's once it is held open. */
export type CalderaGate = 'gate.a5' | 'rimGateOpen' | 'foundryOpen';
export const CALDERA_GATE_FLAGS: Readonly<Record<CalderaGate, string>> = {
  'gate.a5': 'story.gate.a5',
  rimGateOpen: 'story.m47.rimGateOpen',
  foundryOpen: 'story.phase.foundryOpen',
};

export interface CalderaFaunaGroup {
  id: string;
  /** An id in `CALDERA_FAUNA_SITES`. */
  site: string;
  enemy: EnemyKind;
  count: number;
  gate: CalderaGate;
  role?: WarhostRole;
  skin?: EnemySkinId;
  /** The shield line shared by several groups (`SpawnerDef.line`). */
  line?: string;
  firstArrival?: boolean;
  /** Ring radius for the members (default 2.5 m); a steep perch takes a tighter ring. */
  ring?: number;
}

/**
 * About 22 foes. Outside the wall (the rim stairs and perches, `caldera-rim`): the stokers' dead. Inside: Vey's outriders
 * on the Lava Stair (the first arrival, P + 2), gnats, the terraces' scouts (two shields and two pikes, one line), the Cooling
 * Hall's forge-thralls, and at the Foundry door Grisel's loyalists and two household guards (one line). Vey's kennel and the
 * duel floor are inside D09 (N2); the quest and siege groups are N4's, N10's and N11's.
 */
export const CALDERA_FAUNA_GROUPS: readonly CalderaFaunaGroup[] = [
  { id: 'rim.stokers.1', site: 'rim-stairs.hairpin', enemy: 'ash-wraith', skin: 'wraith-stoker', count: 2, gate: 'gate.a5' },
  { id: 'rim.stokers.2', site: 'rim-perch.1', enemy: 'ash-wraith', skin: 'wraith-stoker', count: 2, gate: 'gate.a5', ring: 2.5 },
  { id: 'rim.gnats', site: 'rim-perch.3', enemy: 'cinder-gnat-swarm', count: 1, gate: 'gate.a5' },
  { id: 'stair.outriders', site: 'lava-stair.1', enemy: 'warhost-soldier', role: 'shield', count: 2, gate: 'rimGateOpen', firstArrival: true },
  { id: 'stair.gnats', site: 'lava-stair.2', enemy: 'cinder-gnat-swarm', count: 1, gate: 'rimGateOpen' },
  { id: 'terraces.shields', site: 'terraces.scout.1', enemy: 'warhost-soldier', role: 'shield', count: 2, gate: 'rimGateOpen', line: 'caldera.fauna.terraces' },
  { id: 'terraces.pikes', site: 'terraces.scout.2', enemy: 'warhost-soldier', role: 'pike', count: 2, gate: 'rimGateOpen', line: 'caldera.fauna.terraces' },
  { id: 'terraces.gnats', site: 'terraces.scout.3', enemy: 'cinder-gnat-swarm', count: 1, gate: 'rimGateOpen' },
  { id: 'hall.thralls', site: 'cooling-hall.apron', enemy: 'cinder-golem', skin: 'golem-lava', count: 3, gate: 'rimGateOpen' },
  { id: 'foundry.loyalists', site: 'inner-gate.head', enemy: 'blighted-soldier', skin: 'footman-grisel', count: 4, gate: 'foundryOpen' },
  { id: 'foundry.guards', site: 'inner-gate.head', enemy: 'warhost-guard', role: 'shield', count: 2, gate: 'foundryOpen', line: 'caldera.fauna.foundry' },
];

const RING = 2.5;
const r2 = (n: number): number => Math.round(n * 100) / 100;

export function calderaSiteOf(siteId: string): { at: readonly [number, number]; area: AreaId } {
  const s = CALDERA_FAUNA_SITES.find((x) => x.id === siteId);
  if (!s) throw new Error(`calderaFauna: unknown site '${siteId}'`);
  return { at: s.at, area: s.area };
}

/** The anchor id of member `n` (1-based) of a group. */
export function calderaFaunaAnchorId(group: string, n: number): string {
  return `caldera.fauna.${group}.${n}`;
}

function memberAnchors(g: CalderaFaunaGroup, offset: number): AnchorSpec[] {
  const [cx, cz] = calderaSiteOf(g.site).at;
  const out: AnchorSpec[] = [];
  for (let i = 0; i < g.count; i++) {
    const a = ((i + offset) / (g.count + offset)) * Math.PI * 2 + (offset ? Math.PI / 2 : 0);
    const r = g.count === 1 && !offset ? 0 : (g.ring ?? RING);
    out.push({ id: calderaFaunaAnchorId(g.id, i + 1), x: r2(cx + Math.cos(a) * r), z: r2(cz + Math.sin(a) * r), yawDeg: 0, tags: ['fauna', g.enemy] });
  }
  return out;
}

// Two groups on one site (the Foundry door) take opposite ring phases so no two members share ground.
export const CALDERA_FAUNA_LAYOUT: LayoutData = {
  anchors: CALDERA_FAUNA_GROUPS.flatMap((g, i) => memberAnchors(g, CALDERA_FAUNA_GROUPS.some((o, j) => j < i && o.site === g.site) ? 1 : 0)),
  triggers: [],
  structures: [],
  patrols: [],
  npcs: [],
  fields: [],
};
