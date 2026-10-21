// The Cinderreach layout: every place, concatenated. Engine metres, +Z north; headings in the builders are compass headings
// (0 north, 90 east) stored as yaw = heading + 180. Ownership: prefix `cinderreach.` and `trg.cinderreach.` are thread A3's; the
// `waystone.*`, `npc-post.*` and `scorchhold.keep.arena.*` names keep their contract names. Nothing here is a literal map
// coordinate: sites.ts derives every place from A1's plateau boxes and road polylines.
import type { LayoutData } from '../region/layoutTypes';
import { cinderfordLayout } from './cinderford';
import { huntersCampLayout } from './huntersCamp';
import { hushedAnvilLayout } from './hushedAnvil';
import { CINDERREACH_NPCS } from './npcDefs';
import { pastureLayout } from './pasture';
import { roadStoneLayout } from './roadStone';
import { scorchholdLayout } from './scorchhold';
import { stonefoldLayout } from './stonefold';

const parts = [roadStoneLayout(), cinderfordLayout(), stonefoldLayout(), pastureLayout(), hushedAnvilLayout(), huntersCampLayout(), scorchholdLayout()];

export const CINDERREACH_LAYOUT: LayoutData = {
  anchors: parts.flatMap((p) => p.anchors),
  triggers: parts.flatMap((p) => p.triggers),
  structures: parts.flatMap((p) => p.structures),
  patrols: [],
  npcs: CINDERREACH_NPCS,
  fields: [],
};

export const CINDERREACH_DOC = { title: 'Cinderreach anchors, triggers and structures', source: 'cinderreach.layout.ts' } as const;
