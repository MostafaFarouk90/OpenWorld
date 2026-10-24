// The five Deepgate mine interiors and their strings, registered once through `src/interiors/act2/index.ts` and the plugin.
import type { InteriorDef } from '../../interiors/types';
import { BELLOWS_CAVERN_DEF, BELLOWS_CAVERN_STRINGS_EN } from './bellowsCavern';
import { DEEPDELVE_DEF, DEEPDELVE_STRINGS_EN } from './deepdelve';
import { LOWER_GALLERIES_DEF, LOWER_GALLERIES_STRINGS_EN } from './lowerGalleries';
import { OLD_GALLERIES_DEF, OLD_GALLERIES_STRINGS_EN } from './oldGalleries';
import { SHAFT_MINE_DEF, SHAFT_MINE_STRINGS_EN } from './shaft';

export const MINE_DEFS: readonly InteriorDef[] = [SHAFT_MINE_DEF, OLD_GALLERIES_DEF, LOWER_GALLERIES_DEF, BELLOWS_CAVERN_DEF, DEEPDELVE_DEF];

export const MINE_STRINGS_EN: Record<string, string> = {
  ...SHAFT_MINE_STRINGS_EN,
  ...OLD_GALLERIES_STRINGS_EN,
  ...LOWER_GALLERIES_STRINGS_EN,
  ...BELLOWS_CAVERN_STRINGS_EN,
  ...DEEPDELVE_STRINGS_EN,
};
