// Pure model of the forge-mark row: the eight main-path shrines in contract order (game-events-and-flags
// section 5), each lit from its own `shrine.<id>.lit` flag, plus the Warmth tier and the Cooled pip.

export const SHRINE_IDS = [
  'quenchstone',
  'hushed-anvil',
  'weeping-bellows',
  'hathrens-mere',
  'last-anvil',
  'wyrms-hearth',
  'singing-slag',
  'anvil-of-ages',
] as const;
export type ShrineId = (typeof SHRINE_IDS)[number];

/** Known shrine positions for map markers (world layout section 4); the rest arrive with their regions. */
export const SHRINE_POSITIONS: Readonly<Partial<Record<ShrineId, { x: number; z: number }>>> = {
  quenchstone: { x: 900, z: -170 },
};

export interface ForgeMark {
  id: ShrineId;
  lit: boolean;
}

export interface ForgeState {
  /** Warmth tier 0..8. */
  tier: number;
  marks: ForgeMark[];
  /** True while the Cooled buff has time left. */
  cooled: boolean;
}

export interface ForgeInput {
  isLit(id: ShrineId): boolean;
  /** The `warmth.tier()` value, if the service exists. Out of range is clamped; non-numbers fall back to the lit count. */
  tier?: unknown;
  /** `shrine.cooledRemaining()` seconds, if the service exists. */
  cooledRemaining?: unknown;
}

export function buildForgeState(input: ForgeInput): ForgeState {
  const marks = SHRINE_IDS.map((id) => ({ id, lit: input.isLit(id) === true }));
  const litCount = marks.filter((m) => m.lit).length;
  const t = input.tier;
  const tier = typeof t === 'number' && Number.isFinite(t) ? Math.min(SHRINE_IDS.length, Math.max(0, Math.floor(t))) : litCount;
  const c = input.cooledRemaining;
  return { tier, marks, cooled: typeof c === 'number' && c > 0 };
}
