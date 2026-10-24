// The Dragonspine layout (lower slopes), concatenated. Engine metres, +Z north; headings in the builders are compass headings
// (0 north, 90 east) stored as yaw = heading + 180. Ownership: prefix `dragonspine.` and `trg.dragonspine.` are K4's (K1 owns
// `dragonspine.pass.*`, `.track.*`, `.fog.*` and `dragonspine.wyrmwatch.hearth`); the `waystone.*` and `npc-post.*` names keep
// their contract names. Nothing here is a literal map coordinate: `deriveSites` takes every place from K1's plateaus, the Rime
// Pass polyline, the camp hearth and the interior pads, and every y is resolved against `heightAt`.
import type { LayoutData } from '../region/layoutTypes';
import { anvilLayout, type AnvilInfo } from './anvil';
import { caveMouthLayout, type CaveMouthInfo } from './caveMouth';
import { hawkCliffsLayout, type HawkInfo } from './hawkCliffs';
import { defaultInputs, type DragonspineInputs } from './inputs';
import { lodgeLayout, type LodgeInfo } from './lodge';
import { m28Layout, type M28Info } from './m28';
import { DRAGONSPINE_NPCS } from './npcDefs';
import { shelterLayout, type ShelterInfo } from './shelter';
import { deriveSites, type Sites } from './sites';
import { waysideLayout, type WaysideInfo } from './wayside';

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
}

/** Derives every place from the inputs and resolves it against `inputs.heightAt`. Throws when a place has no room. */
export function buildDragonspine(inp: DragonspineInputs = defaultInputs()): DragonspineBuild {
  const sites = deriveSites(inp);
  const lodge = lodgeLayout(sites);
  const shelter = shelterLayout(sites);
  const anvil = anvilLayout(sites);
  const wayside = waysideLayout(sites, shelter.info.roadS, anvil.info.roadS);
  const hawk = hawkCliffsLayout(sites);
  const cave = caveMouthLayout(sites);
  const m28 = m28Layout(sites, lodge.info.passGateS);
  const parts = [lodge.part, shelter.part, anvil.part, wayside.part, hawk.part, cave.part, m28.part];
  const layout: LayoutData = {
    anchors: parts.flatMap((p) => p.anchors),
    triggers: parts.flatMap((p) => p.triggers),
    structures: parts.flatMap((p) => p.structures),
    patrols: [],
    npcs: DRAGONSPINE_NPCS,
    fields: [],
  };
  return { sites, layout, lodge: lodge.info, shelter: shelter.info, anvil: anvil.info, wayside: wayside.info, hawk: hawk.info, cave: cave.info, m28: m28.info };
}

let cached: DragonspineBuild | null = null;
/** The shipped build (K1's exports on the real ground), made on first use so importing this file cannot throw. */
export function dragonspineBuild(): DragonspineBuild {
  return (cached ??= buildDragonspine());
}

export const DRAGONSPINE_DOC = { title: 'Dragonspine anchors, triggers and structures (lower slopes)', source: 'dragonspine.layout.ts' } as const;
