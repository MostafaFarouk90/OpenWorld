// The other threads' layouts an Act 3 POI keeps clear of (K1's world anchors and fog faces, K3's Greyfen, K4's Dragonspine with
// the R17 waysides, K6b's fauna). K6b's groups that stand at K2's own sites are left out: they are meant to be there.
import { DRAGONSPINE_LAYOUT } from '../../../dragonspine/dragonspine.layout';
import { GREYFEN_FAUNA_LAYOUT } from '../../../enemies/fen/greyfenFauna.layout';
import { GREYFEN_LAYOUT } from '../../../greyfen/greyfen.layout';
import type { LayoutData } from '../../../region/layoutTypes';
import { ACT3_WORLD_LAYOUT } from '../../../region/act3/act3World.layout';

/** K6b fauna groups whose site is one of K2's points of interest (greyfenFauna.layout.ts reads K2's `fauna` anchors). */
export const FAUNA_AT_K2_SITES: readonly string[] = ['leech.reed-island', 'shambler.peat-cutting', 'hunters.stilt-camp', 'wraiths.drowned-church'];

const faunaElsewhere: LayoutData = {
  ...GREYFEN_FAUNA_LAYOUT,
  anchors: GREYFEN_FAUNA_LAYOUT.anchors.filter((a) => !FAUNA_AT_K2_SITES.some((g) => a.id.startsWith(`greyfen.fauna.${g}.`))),
};

export const A3_NEIGHBOUR_LAYOUTS: readonly LayoutData[] = [ACT3_WORLD_LAYOUT, GREYFEN_LAYOUT, DRAGONSPINE_LAYOUT, faunaElsewhere];
