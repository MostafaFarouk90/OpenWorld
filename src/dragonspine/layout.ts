// The Dragonspine layout (the lower slopes and, from PR 2, the summit), concatenated. Engine metres, +Z north; headings in the builders are compass headings
// (0 north, 90 east) stored as yaw = heading + 180. Ownership: prefix `dragonspine.` and `trg.dragonspine.` are K4's (K1 owns
// `dragonspine.pass.*`, `.track.*`, `.fog.*` and `dragonspine.wyrmwatch.hearth`); the `waystone.*` and `npc-post.*` names keep
// their contract names. Nothing here is a literal map coordinate: `deriveSites` takes every place from K1's plateaus, the Rime
// Pass polyline, the camp hearth and the interior pads, and every y is resolved against `heightAt`.
import type { LayoutData } from '../region/layoutTypes';
import { aerieLayout, type AerieInfo } from './aerie';
import { anvilLayout, type AnvilInfo } from './anvil';
import { catchVolumes, type CatchVolume } from './chasmCatch';
import { glideLedgesLayout, type GlideLedgeInfo } from './glideLedges';
import { caveMouthLayout, type CaveMouthInfo } from './caveMouth';
import { hawkCliffsLayout, type HawkInfo } from './hawkCliffs';
import { defaultInputs, type DragonspineInputs } from './inputs';
import { lodgeLayout, type LodgeInfo } from './lodge';
import { m28Layout, type M28Info } from './m28';
import { DRAGONSPINE_NPCS } from './npcDefs';
import { shelterLayout, type ShelterInfo } from './shelter';
import { roostLayout, type RoostInfo } from './roost';
import { deriveSites, type Sites } from './sites';
import { skyholdLayout, type SkyholdInfo } from './skyhold';
import { summitGateLayout, type SummitGateInfo } from './summitGate';
import { deriveSummit, type SummitSites } from './summitSites';
import { waysideLayout, type WaysideInfo } from './wayside';
import { buildToggles, type ToggleDef } from './worldChanges';
import { wyrmsHearthLayout, type HearthInfo } from './wyrmsHearth';

export interface DragonspineBuild {
  sites: Sites;
  layout: LayoutData;
  lodge: LodgeInfo;
  shelter: ShelterInfo;
  anvil: AnvilInfo;
  wayside: WaysideInfo;
  hawk: HawkInfo;
  cave: CaveMouthInfo;
  m28: M28Info;
  // ---- the summit (PR 2)
  summit: SummitSites;
  gate: SummitGateInfo;
  hearth: HearthInfo;
  roost: RoostInfo;
  skyhold: SkyholdInfo;
  aerie: AerieInfo;
  glide: GlideLedgeInfo;
  /** The walker catch's volumes over K1's chasm and moat (chasmCatch.ts). */
  catchVolumes: CatchVolume[];
  /** The flag-driven pieces (worldChanges.ts): never in the layout. */
  toggles: ToggleDef[];
}

const memo = new WeakMap<DragonspineInputs, DragonspineBuild>();
let builds = 0;
/** How many uncached builds this module has made (the boot cost guard counts them). */
export const buildCount = (): number => builds;

/** Derives every place from the inputs and resolves it against `inputs.heightAt`. Throws when a place has no room. Memoized per inputs object (the same object builds once). */
export function buildDragonspine(inp: DragonspineInputs = defaultInputs()): DragonspineBuild {
  const known = memo.get(inp);
  if (known) return known;
  const built = buildUncached(inp);
  memo.set(inp, built);
  return built;
}

function buildUncached(inp: DragonspineInputs): DragonspineBuild {
  builds++;
  const sites = deriveSites(inp);
  const lodge = lodgeLayout(sites);
  const shelter = shelterLayout(sites);
  const anvil = anvilLayout(sites);
  const wayside = waysideLayout(sites, shelter.info.roadS, anvil.info.roadS);
  const hawk = hawkCliffsLayout(sites);
  const cave = caveMouthLayout(sites);
  const m28 = m28Layout(sites, lodge.info.passGateS);
  const summit = deriveSummit(inp);
  const gate = summitGateLayout(summit, sites.road, sites.roadHalf);
  const hearth = wyrmsHearthLayout(summit, sites.road, sites.roadClear);
  const roost = roostLayout(summit);
  const skyhold = skyholdLayout(summit);
  const aerie = aerieLayout(summit);
  const lower = [lodge.part, shelter.part, anvil.part, wayside.part, hawk.part, cave.part, m28.part];
  const upper = [gate.part, hearth.part, roost.part, skyhold.part, aerie.part];
  const glide = glideLedgesLayout(summit, [...lower, ...upper].flatMap((p) => p.structures));
  const world = buildToggles(sites, lodge.info, hearth.info, skyhold.info, aerie.info);
  const parts = [...lower, ...upper, glide.part, { anchors: world.anchors, triggers: [], structures: [] }];
  const layout: LayoutData = {
    anchors: parts.flatMap((p) => p.anchors),
    triggers: parts.flatMap((p) => p.triggers),
    structures: parts.flatMap((p) => p.structures),
    patrols: [],
    npcs: DRAGONSPINE_NPCS,
    fields: [],
  };
  return {
    sites,
    layout,
    lodge: lodge.info,
    shelter: shelter.info,
    anvil: anvil.info,
    wayside: wayside.info,
    hawk: hawk.info,
    cave: cave.info,
    m28: m28.info,
    summit,
    gate: gate.info,
    hearth: hearth.info,
    roost: roost.info,
    skyhold: skyhold.info,
    aerie: aerie.info,
    glide: glide.info,
    catchVolumes: catchVolumes(summit.troughs, inp.heightAt),
    toggles: world.toggles,
  };
}

let cached: DragonspineBuild | null = null;
/** The shipped build (K1's exports on the real ground), made on first use so importing this file cannot throw. */
export function dragonspineBuild(): DragonspineBuild {
  return (cached ??= buildDragonspine(defaultInputs()));
}

export const DRAGONSPINE_DOC = { title: 'Dragonspine anchors, triggers and structures (lower slopes and summit)', source: 'dragonspine.layout.ts' } as const;
