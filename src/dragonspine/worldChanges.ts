// The flag readers (PR 2): every piece of the Dragonspine that a quest flag shows or hides. Each is a toggle (cinderreach's
// ToggleStructure: one mesh and at most one collider, never in the layout) driven through `ctx.gates.watch`, so it re-derives
// at setup, on every change of a flag it reads and on `save.loaded`, both ways.
//   - the aerie gate's blocker: closed until `story.d06.gateOpen`;
//   - Skyhold's net: section n hangs until `story.m33.anchorN`, so the net is gone once all six are cut;
//   - the R16 axe on the hoard: only with `story.r16.choice = give` and `story.m32.complete`;
//   - the midpoint: the lodge's fire pit lit (fire, embers and a light) on `story.m34.complete` (the hunters' posts face out
//     through postRules.ts, on the anchors this file adds);
//   - the ending: Skarl's banner burned in the lodge yard only for `boss.corvin-skarl.outcome = defeated` (not `spared`), and
//     the drake's roost on the Aerie's north-east tower after `story.d06.complete`.
// The two resting wyrms of the midpoint are K6a's (on the lodge's south towers); no perch caps are added unless K6a asks.
import type * as THREE from 'three';
import { ToggleStructure, type ToggleDeps } from '../cinderreach/toggleStructure';
import type { CoreContext } from '../region/coreTypes';
import type { AnchorSpec, StructureSpec } from '../region/layoutTypes';
import type { StructureArt } from '../region/structureArt';
import type { AerieInfo } from './aerie';
import { AERIE_TOWER_H } from './aerie';
import {
  D06_COMPLETE_FLAG,
  D06_GATE_OPEN_FLAG,
  M32_COMPLETE_FLAG,
  M34_COMPLETE_FLAG,
  m33AnchorFlag,
  R16_CHOICE_FLAG,
  R16_GIVE,
  SKARL_DEFEATED,
  SKARL_OUTCOME_FLAG,
} from './flags';
import { a, open } from './helpers';
import type { HeightFn, XZ } from './inputs';
import { TOWER_H, type LodgeInfo } from './lodge';
import type { SkyholdInfo } from './skyhold';
import { freeStand } from './summitSites';
import type { Sites } from './sites';
import type { HearthInfo } from './wyrmsHearth';

export type FlagReader = (key: string) => unknown;

export interface ToggleDef {
  id: string;
  spec: StructureSpec;
  /** Every flag `shown` reads (the gate re-runs on a change of any of them). */
  keys: readonly string[];
  shown: (flag: FlagReader) => boolean;
  /** Metres the toggle stands over the ground at its centre (the drake's roost sits on a tower top). */
  lift?: number;
}

const fail = (msg: string): never => {
  throw new Error(`dragonspine: ${msg}`);
};

/** Every toggle of the build, in a fixed order. */
export function buildToggles(s: Sites, lodge: LodgeInfo, hearth: HearthInfo, skyhold: SkyholdInfo, aerie: AerieInfo): { toggles: ToggleDef[]; anchors: AnchorSpec[] } {
  const L = s.lodge;
  const yardSolids = lodge.specs.filter((x) => x.mode !== 'open');
  const bannerAt =
    freeStand(s.h, { x: L.cx + 10, z: L.cz - 22 }, { radius: 30, maxGrad: 0.2, within: { minX: lodge.edge.w + 6, maxX: lodge.edge.e - 6, minZ: lodge.edge.s + 6, maxZ: lodge.edge.n - 6 }, avoid: yardSolids, clear: 2 }) ??
    fail('no room in the lodge yard for Skarl\'s banner');
  const tower = aerie.roostTower;
  const toggles: ToggleDef[] = [
    { id: 'aerie-gate', spec: aerie.gateSpec, keys: [D06_GATE_OPEN_FLAG], shown: (f) => !f(D06_GATE_OPEN_FLAG) },
    ...skyhold.sections.map((sec): ToggleDef => ({ id: `net-${sec.n}`, spec: sec.spec, keys: [m33AnchorFlag(sec.n)], shown: (f) => !f(m33AnchorFlag(sec.n)) })),
    {
      id: 'hoard-axe',
      spec: open('dragonspine-hearth-hoard-axe', 'dragonspine-hoard-axe', hearth.hoardSpot.x + 1.5, hearth.hoardSpot.z - 1.5, 1.4, 0.5),
      keys: [R16_CHOICE_FLAG, M32_COMPLETE_FLAG],
      shown: (f) => f(R16_CHOICE_FLAG) === R16_GIVE && Boolean(f(M32_COMPLETE_FLAG)),
    },
    { id: 'lodge-fire', spec: open('dragonspine-yard-fire-lit', 'dragonspine-fire-lit', s.hearth.x, s.hearth.z, 2.4, 2.4), keys: [M34_COMPLETE_FLAG], shown: (f) => Boolean(f(M34_COMPLETE_FLAG)) },
    {
      id: 'skarl-banner-burned',
      spec: open('dragonspine-lodge-banner-burned', 'dragonspine-banner-burned', bannerAt.x, bannerAt.z, 1.6, 1.6),
      keys: [SKARL_OUTCOME_FLAG],
      shown: (f) => f(SKARL_OUTCOME_FLAG) === SKARL_DEFEATED,
    },
    {
      id: 'drake-roost',
      spec: open('dragonspine-aerie-drake-roost', 'dragonspine-drake-roost', tower.x, tower.z, tower.footprint[0], tower.footprint[1]),
      keys: [D06_COMPLETE_FLAG],
      shown: (f) => Boolean(f(D06_COMPLETE_FLAG)),
      lift: AERIE_TOWER_H,
    },
  ];
  // The hunters' outward posts (postRules.ts moves them there after M34), just inside the gates and on the south-west tower.
  const sw = lodge.towers[0]!;
  const e = lodge.edge;
  const out = (n: number, p: XZ, heading: number, rest: Partial<AnchorSpec> = {}, tags = ['npc-post']) => a(`npc-post.lodge-hunter-${n}.out`, p.x, p.z, heading, tags, rest);
  const anchors: AnchorSpec[] = [
    out(1, { x: lodge.gateS.x - 5, z: e.s + 3 }, 180),
    out(2, { x: lodge.gateS.x + 5, z: e.s + 3 }, 180),
    out(3, { x: sw.x, z: sw.z }, 180, { onStructure: sw.id, dy: TOWER_H }, ['npc-post', 'elevated']),
    out(4, { x: lodge.gateN.x + 5, z: e.n - 3 }, 0),
    out(5, { x: lodge.gateW.x + 3, z: lodge.gateW.z + 4 }, 270),
    out(6, { x: lodge.gateE.x - 3, z: lodge.gateE.z + 4 }, 90),
    a('dragonspine.lodge.banner', bannerAt.x, bannerAt.z - 2, 0, ['poi']),
  ];
  return { toggles, anchors };
}

/** The ids of the toggles shown for a flag state (the readers as a pure function). */
export const shownToggles = (defs: readonly ToggleDef[], flag: FlagReader): string[] => defs.filter((d) => d.shown(flag)).map((d) => d.id);

/** Builds every toggle on the context and keeps it equal to its flags through `ctx.gates`. Returns the shown ids reader and the remover. */
export function watchToggles(
  ctx: Pick<CoreContext, 'gates' | 'scene' | 'physics'> & { rapier: ToggleDeps['rapier'] },
  defs: readonly ToggleDef[],
  height: HeightFn,
  art: StructureArt,
): { shown(): string[]; dispose(): void } {
  const offs: Array<() => void> = [];
  const built = defs.map((def) => {
    const toggle = new ToggleStructure(ctx, def.spec, height);
    if (def.lift) toggle.root.position.y += def.lift;
    offs.push(() => toggle.dispose());
    void art(def.spec).then(
      (obj: THREE.Object3D | null) => toggle.setArt(obj),
      () => undefined,
    );
    offs.push(ctx.gates.watch((st) => def.shown((k) => st.getFlag(k)), (on) => toggle.setVisible(on), { keys: def.keys }));
    return { def, toggle };
  });
  return {
    shown: () => built.filter((b) => b.toggle.visible).map((b) => b.def.id),
    dispose: () => offs.splice(0).reverse().forEach((o) => o()),
  };
}
