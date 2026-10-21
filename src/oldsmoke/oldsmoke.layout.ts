// The Oldsmoke layout: Deepgate's surface, concatenated. Engine metres, +Z north; headings in the builders are compass headings
// (0 north, 90 east) stored as yaw = heading + 180. Ownership: prefix `oldsmoke.` and `trg.oldsmoke.` are thread A4's; the
// `waystone.*`, `npc-post.*`, `spawn.m21.*`, `patrol.m21.*` names keep their contract names. Nothing here is a literal map
// coordinate: sites.ts derives every place from A1's plateau box, pass road and stack positions.
import type { LayoutData } from '../region/layoutTypes';
import { deepgateLayout } from './deepgate';
import { furnacesLayout } from './furnaces';
import { OLDSMOKE_NPCS } from './npcDefs';
import { passLayout } from './passAnchors';
import { shaftHeadLayout } from './shaftHead';

const parts = [deepgateLayout(), shaftHeadLayout(), furnacesLayout(), passLayout()];

export const OLDSMOKE_LAYOUT: LayoutData = {
  anchors: parts.flatMap((p) => p.anchors),
  triggers: parts.flatMap((p) => p.triggers),
  structures: parts.flatMap((p) => p.structures),
  patrols: [],
  npcs: OLDSMOKE_NPCS,
  fields: [],
};

export const OLDSMOKE_DOC = { title: 'Oldsmoke anchors, triggers and structures', source: 'oldsmoke.layout.ts' } as const;
