// The Greyfen layout: every outdoor place, concatenated. Engine metres, +Z north; headings in the builders are compass headings
// (0 north, 90 east) stored as yaw = heading + 180. Ownership: `greyfen.*` and `trg.greyfen.*` are K3's (K6b owns
// `greyfen.fauna.*`); `waystone.*` and `npc-post.*` keep their contract names. Positions come from sites.ts and places.ts only.
import type { LayoutData } from '../region/layoutTypes';
import { causewayLayout } from './causeway';
import { greywatchLayout } from './greywatch';
import { mereLayout } from './mere';
import { deepsLayout, mireweatherLayout } from './mireweather';
import { GREYFEN_NPCS } from './npcDefs';
import { ferryLandingLayout, reedgateLayout } from './reedgate';

const parts = [reedgateLayout(), ferryLandingLayout(), causewayLayout(), mereLayout(), greywatchLayout(), mireweatherLayout(), deepsLayout()];

export const GREYFEN_LAYOUT: LayoutData = {
  anchors: parts.flatMap((p) => p.anchors),
  triggers: parts.flatMap((p) => p.triggers),
  structures: parts.flatMap((p) => p.structures),
  patrols: [],
  npcs: GREYFEN_NPCS,
  fields: [],
};

export const GREYFEN_DOC = { title: 'Greyfen anchors, triggers and structures', source: 'greyfen.layout.ts' } as const;
