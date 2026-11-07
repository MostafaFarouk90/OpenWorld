// Act 5 N7 (plans/act5-N7.md section 6): Alric's rim forge and Maud's rim kitchen. Every line is unlimited and neither
// vendor buys, so neither enters the shop save (Shop.serialize) and no shipped fixture changes. Tier 5 is forged, never bought.
import { MAUD_RIM_FOOD } from '../items/act5/catalog';
import type { VendorDef } from './stock';

export const ALRIC: VendorDef = {
  id: 'alric',
  buys: false,
  lines: [
    { itemId: 'healing-flask' },
    { itemId: 'cooling-draught' },
    { itemId: 'walker-poultice' },
    { itemId: 'rime-iron' },
    { itemId: 'shed-wyrm-scale' },
    { itemId: 'wyrm-hide' },
    { itemId: 'crossbow-bolts' },
  ],
};

export const MAUD_RIM: VendorDef = {
  id: 'maud-rim',
  buys: false,
  lines: [
    { itemId: 'maud-stew' },
    { itemId: 'maud-poultice' },
    { itemId: 'hearth-bread' },
    { itemId: 'barley-cake' },
    { itemId: MAUD_RIM_FOOD.hotpot },
    { itemId: MAUD_RIM_FOOD.broth },
  ],
};
