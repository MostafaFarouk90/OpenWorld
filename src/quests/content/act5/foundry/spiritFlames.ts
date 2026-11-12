// Act 5 N11 (plan 2.7, coordinator ruling 6): D10 phase 3's spirit-flames. N11 owns the list and its order; N6 PR 2 takes
// the first ten at +2% each (at most +20%) and places them on the ring in list order. Pure over the flags.
import { COMPANION_IDS } from '../../../../companions/ids';
import { bannersHeld, dragonsAtSiege, eormenReleased, f8, type FlagReader } from './readers';

export interface SpiritFlame {
  id: string;
  labelKey: string;
  anchorHint?: string;
}

/** Gaut's Oathblade is given at M39 (`story.m39.oathblade`); worn by a Knight or carried by any other class. */
export const OATHBLADE_FLAG = 'story.m39.oathblade';

const flame = (id: string): SpiritFlame => ({ id, labelKey: `quest.d10.flame.${id}` });

/**
 * Every flame earned, in priority order: the three companions, Gaut if the Oathblade was
 * given, each House whose banner held at M52, each dragon that came to the siege, the Ashwalkers if they fought (F8 All),
 * Rook, Edric, and Eormen if he was released. Ids are unique.
 */
export function spiritFlamesFor(flags: FlagReader): readonly SpiritFlame[] {
  const out: SpiritFlame[] = [];
  // Tobb, Aelfreda and Hrolf join on the main line (Acts 1 to 3), so all three have joined by D10, seated or at camp.
  for (const c of COMPANION_IDS) out.push(flame(c));
  if (flags.getFlag(OATHBLADE_FLAG) !== undefined && flags.getFlag(OATHBLADE_FLAG) !== false) out.push(flame('gaut'));
  for (const h of bannersHeld(flags)) out.push(flame(`house-${h}`));
  for (const d of dragonsAtSiege(flags)) out.push(flame(`dragon-${d}`));
  if (f8(flags) === 'all') out.push(flame('ashwalkers'));
  out.push(flame('rook'), flame('edric'));
  if (eormenReleased(flags)) out.push(flame('eormen'));
  return out;
}

/** N6's cap: the first ten flames count, +2% each. */
export const SPIRIT_FLAME_CAP = 10;
export const SPIRIT_FLAME_BONUS = 0.02;

export const SPIRIT_FLAME_STRINGS: Record<string, string> = {
  'quest.d10.flame.tobb': 'Tobb\'s song', 'quest.d10.flame.hrolf': 'Hrolf\'s hammer', 'quest.d10.flame.aelfreda': 'Aelfreda\'s hearth',
  'quest.d10.flame.gaut': 'Gaut\'s oath', 'quest.d10.flame.house-halvard': 'The Halvard banner',
  'quest.d10.flame.house-oswin': 'The Oswin banner', 'quest.d10.flame.house-grisel': 'The Grisel banner',
  'quest.d10.flame.dragon-ysmeryth': 'Ysmeryth\'s fire', 'quest.d10.flame.dragon-hathren': 'Hathren\'s fire',
  'quest.d10.flame.dragon-orsk': 'Orsk\'s fire', 'quest.d10.flame.dragon-hill-wyrm': 'The hill wyrm\'s fire',
  'quest.d10.flame.ashwalkers': 'The Ashwalkers\' pyre', 'quest.d10.flame.rook': 'Rook\'s watch', 'quest.d10.flame.edric': 'Edric\'s crown',
  'quest.d10.flame.eormen': 'Eormen\'s crown',
};
