import { GEAR_TUNING } from './tuning';

export const AFFIX_IDS = ['ember', 'gleam', 'cinder', 'hearth', 'sworn'] as const;
export type AffixId = (typeof AFFIX_IDS)[number];

/** What an affix does. `wired` ones act through the damage modifiers (combat.ts); Gleam and Hearth are data only for now. */
export interface AffixDef {
  id: AffixId;
  nameKey: string;
  descKey: string;
  wired: boolean;
}

export const AFFIXES: Readonly<Record<AffixId, AffixDef>> = Object.fromEntries(
  AFFIX_IDS.map((id) => [id, { id, nameKey: `gear.affix.${id}`, descKey: `gear.affix.${id}.desc`, wired: id !== 'gleam' && id !== 'hearth' }]),
) as Record<AffixId, AffixDef>;

export const isAffixId = (v: unknown): v is AffixId => typeof v === 'string' && (AFFIX_IDS as readonly string[]).includes(v);

/** FNV-1a over the seed text, then one mulberry32 step: stable across runs and platforms. */
function seededUnit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  let t = (h + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The affix a perfect Anvil run grants: seeded by item id and the level reached, so saves and tests agree. */
export function pickAffix(itemId: string, level: number): AffixId {
  return AFFIX_IDS[Math.floor(seededUnit(`${itemId}#${level}`) * AFFIX_IDS.length)];
}

export const AFFIX_EFFECTS = {
  ember: GEAR_TUNING.combat.ember,
  sworn: { bonus: GEAR_TUNING.combat.swornBonus },
  cinder: { resist: GEAR_TUNING.combat.cinderResist },
} as const;
