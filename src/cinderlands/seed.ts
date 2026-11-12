// G4 Cinderlands (design 12.2): shareable seed codes such as `EMBR-ASH-D41B-7`: class word, biome word, four hex
// digits and one check character that folds in the Heat, so a code typed with the wrong Heat (or a typo) is refused.
// The 32-bit run seed derives from all four parts; every generator draws from `seededRng`, never Math.random.
import type { ClassId } from '../actors/classes';

export const CLASS_WORDS: Readonly<Record<ClassId, string>> = {
  knight: 'KNGT',
  warden: 'WRDN',
  emberwright: 'EMBR',
  ashblade: 'ASHB',
  pathfinder: 'PATH',
};

export type BiomeId = 'ashfield' | 'glassland' | 'fenland' | 'rimeridge' | 'magmafield';

export const BIOME_WORDS: Readonly<Record<BiomeId, string>> = {
  ashfield: 'ASH',
  glassland: 'GLS',
  fenland: 'FEN',
  rimeridge: 'RIM',
  magmafield: 'MAG',
};

/** Biomes the board can roll in this build (phase 1: Ashfield only). Other words parse but are refused as unavailable. */
export const AVAILABLE_BIOMES: readonly BiomeId[] = ['ashfield'];

const CHECK_ALPHABET = '0123456789ACEFHJKMNPRTWXY';

export interface RunSeed {
  classId: ClassId;
  biome: BiomeId;
  /** 0..0xffff, the four hex digits. */
  hex: number;
  heat: number;
}

export function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const hex4 = (n: number): string => (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');

function checkChar(classWord: string, biomeWord: string, hex: string, heat: number): string {
  const h = fnv1a(`${classWord}|${biomeWord}|${hex}|heat:${heat}`);
  return CHECK_ALPHABET[h % CHECK_ALPHABET.length];
}

export function formatSeed(s: RunSeed): string {
  const c = CLASS_WORDS[s.classId];
  const b = BIOME_WORDS[s.biome];
  const x = hex4(s.hex);
  return `${c}-${b}-${x}-${checkChar(c, b, x, s.heat)}`;
}

export type ParseSeedResult = { ok: true; seed: RunSeed } | { ok: false; reason: 'format' | 'class' | 'biome' | 'unavailable' | 'check' | 'heat' };

const findKey = <K extends string>(table: Readonly<Record<K, string>>, word: string): K | undefined =>
  (Object.keys(table) as K[]).find((k) => table[k] === word);

/**
 * Parses a code for a Heat. The Heat is not written in the code, only checked: `heat` is the board's chosen Heat (a
 * code shared at another Heat is refused with 'check'). `maxHeat` refuses a Heat above the player's cap.
 */
export function parseSeed(code: string, heat: number, maxHeat = Infinity): ParseSeedResult {
  if (typeof code !== 'string') return { ok: false, reason: 'format' };
  const m = /^\s*([A-Za-z]{4})-([A-Za-z]{3})-([0-9A-Fa-f]{4})-([0-9A-Za-z])\s*$/.exec(code);
  if (!m) return { ok: false, reason: 'format' };
  const [, cw, bw, hx, ck] = m.map((p) => p.toUpperCase());
  const classId = findKey(CLASS_WORDS, cw);
  if (!classId) return { ok: false, reason: 'class' };
  const biome = findKey(BIOME_WORDS, bw);
  if (!biome) return { ok: false, reason: 'biome' };
  if (!AVAILABLE_BIOMES.includes(biome)) return { ok: false, reason: 'unavailable' };
  if (!Number.isInteger(heat) || heat < 1) return { ok: false, reason: 'heat' };
  if (heat > maxHeat) return { ok: false, reason: 'heat' };
  if (checkChar(cw, bw, hx, heat) !== ck) return { ok: false, reason: 'check' };
  return { ok: true, seed: { classId, biome, hex: parseInt(hx, 16), heat } };
}

/** The 32-bit seed every generator of this run draws from. */
export function runSeedValue(s: RunSeed): number {
  return fnv1a(`cinder|${s.classId}|${s.biome}|${hex4(s.hex)}|${s.heat}`) || 1;
}

/** A fresh code's hex digits from any random source (the board's "New seed"). */
export function rollHex(random: () => number): number {
  return Math.floor(random() * 0x10000) & 0xffff;
}

export interface SeededRng {
  next(): number;
  int(a: number, b: number): number;
  range(a: number, b: number): number;
  pick<T>(xs: readonly T[]): T;
}

/** mulberry32 from a 32-bit seed, with a salt so independent streams (terrain, POIs, encounters) do not correlate. */
export function seededRng(seed: number, salt = ''): SeededRng {
  let t = (salt ? fnv1a(`${seed}|${salt}`) : seed >>> 0) || 1;
  const next = (): number => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    range: (a, b) => a + (b - a) * next(),
    pick: (xs) => {
      if (xs.length === 0) throw new Error('seededRng.pick: empty list');
      return xs[Math.floor(next() * xs.length)];
    },
  };
}
