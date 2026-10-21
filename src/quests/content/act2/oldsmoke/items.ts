import type { ItemDef } from '../../../../hud/ports';
import { registerItems } from '../../../../inventory/items';

const def = (id: string, kind: ItemDef['kind'], rest: Partial<Pick<ItemDef, 'slot' | 'stackMax' | 'stats' | 'use'>> = {}): ItemDef =>
  ({ id, nameKey: `item.${id}.name`, descKey: `item.${id}.desc`, kind, stackMax: 1, ...rest });

/** Oldsmoke quest items built so far (A13). The mine quests' rewards join with them. */
export const OLDSMOKE_QUEST_ITEMS: readonly ItemDef[] = [
  def('grisel-writ', 'quest'),
  def('union-badge', 'quest'),
  def('favour-mark', 'quest'),
  def('grisel-spy-letter', 'quest'),
  def('house-pledge-banner', 'quest'),
];

export const OLDSMOKE_QUEST_ITEM_STRINGS: Record<string, string> = {
  'item.grisel-writ.name': 'Grisel Writ',
  'item.grisel-writ.desc': 'A sealed writ in Aldous Grisel\'s hand. It opens his hall and, in time, his purse.',
  'item.union-badge.name': 'Union Badge',
  'item.union-badge.desc': 'A tin badge of crossed picks. Miners nod to whoever wears it.',
  'item.favour-mark.name': 'Favour Mark',
  'item.favour-mark.desc': 'A small green-wax mark. Whoever carries it has been weighed by House Grisel.',
  'item.grisel-spy-letter.name': 'Grisel Spy-Letter',
  'item.grisel-spy-letter.desc': 'A letter from Aldous\'s study that names a harbour. Wenna says it will matter later.',
  'item.house-pledge-banner.name': 'House Pledge Banner',
  'item.house-pledge-banner.desc': 'The banner raised at the Council: Halvard and Oswin pledged beneath it.',
};

registerItems(OLDSMOKE_QUEST_ITEMS);
