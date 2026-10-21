import type { ItemDef } from '../../../hud/ports';
import { registerItems } from '../../../inventory/items';
import '../../../gear/catalog'; // M11 gives the Ashmare Saddle, a gear-catalog item

const def = (id: string, kind: ItemDef['kind'], rest: Partial<Pick<ItemDef, 'slot' | 'stackMax' | 'stats' | 'use'>> = {}): ItemDef =>
  ({ id, nameKey: `item.${id}.name`, descKey: `item.${id}.desc`, kind, stackMax: 1, ...rest });

/** Act 2 Cinderreach quest items (A12). Kindling Brush is A9's, Cooling Draught A10's. */
export const ACT2_QUEST_ITEMS: readonly ItemDef[] = [
  def('fox-fire-ember', 'consumable', { stackMax: 3, use: { noHeal: true, drinkSeconds: 0.8 } }),
  def('maud-remedy', 'consumable', { stackMax: 3, use: { healFraction: 0.4, drinkSeconds: 1.2 } }),
  def('hrolfs-axe-rune', 'trinket', { slot: 'trinket', stats: { attack: 3 } }),
  def('pup-companion', 'quest'),
  // the slain wyrm's full-power axe, or the lesser one when the wyrm was spared (R11; design: "the axe's full power")
  def('brothers-axe-full', 'weapon', { slot: 'weapon', stats: { attack: 18 } }),
  def('brothers-axe-lesser', 'weapon', { slot: 'weapon', stats: { attack: 13 } }),
  def('wyrmling-scale', 'quest'),
  def('redmanes-lance', 'quest'),
  def('cage-keys', 'quest'),
];

export const ACT2_QUEST_ITEM_STRINGS: Record<string, string> = {
  'item.fox-fire-ember.name': 'Fox-Fire Ember',
  'item.fox-fire-ember.desc': 'A coal that burns without heat. Held in the hand, it lights the way for a while: hidden things glow.',
  'item.maud-remedy.name': "Maud's Remedy",
  'item.maud-remedy.desc': 'A bitter tonic from the Cinderford refuge. Restores health.',
  'item.hrolfs-axe-rune.name': "Hrolf's Axe-Rune",
  'item.hrolfs-axe-rune.desc': 'A warden\'s rune carved on a river stone. Hrolf says it keeps an axe honest.',
  'item.pup-companion.name': 'Pup Collar',
  'item.pup-companion.desc': 'A little leather collar. The pup it fits follows you on the road.',
  'item.brothers-axe-full.name': "Brother's Axe",
  'item.brothers-axe-full.desc': 'Hrolf\'s brother\'s axe, rewon from the den with its full edge.',
  'item.brothers-axe-lesser.name': "Brother's Axe (rested)",
  'item.brothers-axe-lesser.desc': 'Hrolf\'s brother\'s axe. The wyrm lives, and the edge has not forgiven it.',
  'item.wyrmling-scale.name': 'Wyrmling Scale',
  'item.wyrmling-scale.desc': 'A small ember-warm scale, left behind at the cage.',
  'item.redmanes-lance.name': "Redmane's Lance",
  'item.redmanes-lance.desc': 'The Hunt-Captain\'s lance, as proof of the fall of Scorchhold.',
  'item.cage-keys.name': 'Cage Keys',
  'item.cage-keys.desc': 'A ring of iron keys from the hunters\' pens.',
};

registerItems(ACT2_QUEST_ITEMS);
