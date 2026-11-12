// G4 Cinderlands (design 12.4, 12.5, 12.7): the one Heat module. Heat scales enemy health and damage linearly, the
// biome offset sets the enemy level and spills past the level cap into Heat, and Rift Walks cap Heat at 3 + W until
// the ending. G3's Second Hearth imports `heatMultiplier` and `secondHearthHeat` from here (one formula, one place).
import { LEVEL_CAP } from '../progression/tuning';

/** Per-Heat step of the multiplier (design 12.4). */
export const HEAT_STEP = 0.08;

const whole = (n: unknown, fallback: number): number => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback);

/** Enemy health and damage multiplier: 1 + 0.08 x (Heat - 1). A non-finite Heat or one below 1 reads as 1. */
export function heatMultiplier(heat: number): number {
  const h = Math.max(1, whole(heat, 1));
  return 1 + HEAT_STEP * (h - 1);
}

/** Highest Heat a Rift Walk offers before the ending: 3 + W (design 12.4), W clamped to 0..8. */
export function riftWalkCap(warmth: number): number {
  const w = Math.min(8, Math.max(0, whole(warmth, 0)));
  return 3 + w;
}

/** Highest Heat the board offers once the full mode is open; phase 4 adds the modifiers past 20 and lifts this. */
export const FULL_MODE_BOARD_CAP = 24;

/** The board's top Heat: min(unlocked, cap), never below 1. `fullMode` lifts the Warmth cap (M56). */
export function boardMaxHeat(unlocked: number, warmth: number, fullMode: boolean): number {
  const cap = fullMode ? FULL_MODE_BOARD_CAP : riftWalkCap(warmth);
  return Math.max(1, Math.min(Math.max(1, whole(unlocked, 1)), cap));
}

/** Second Hearth cycle k (1, 2, ...) runs at Heat 1 + 2k + W (design 12.5); cycle 0 (the first playthrough) reads 1 + W. */
export function secondHearthHeat(cycle: number, warmth: number): number {
  const k = Math.max(0, whole(cycle, 0));
  const w = Math.min(8, Math.max(0, whole(warmth, 0)));
  return 1 + 2 * k + w;
}

export interface RunLevel {
  /** Enemy level, 1..LEVEL_CAP. */
  level: number;
  /** The run's Heat after the spill, before any Rift Walk cap is applied by the caller. */
  heat: number;
}

/**
 * Design 12.4: L = clamp(P + offset, 1, 40); any part of a positive offset the cap cuts off is added to Heat, so a
 * harder biome never means easier enemies. A negative offset never lowers Heat.
 */
export function runLevel(playerLevel: number, offset: number, heat: number): RunLevel {
  const p = Math.min(LEVEL_CAP, Math.max(1, whole(playerLevel, 1)));
  const o = whole(offset, 0);
  const h = Math.max(1, whole(heat, 1));
  const raw = p + o;
  const level = Math.min(LEVEL_CAP, Math.max(1, raw));
  const spill = Math.max(0, raw - LEVEL_CAP);
  return { level, heat: h + spill };
}

/** A modifier switched on from a Heat (design 12.4, every five Heat). Phase 1 ships the first four. */
export type HeatModifierId = 'burning' | 'armoured' | 'swift' | 'phoenix';

export const HEAT_MODIFIERS: ReadonlyArray<{ id: HeatModifierId; from: number }> = [
  { id: 'burning', from: 5 },
  { id: 'armoured', from: 10 },
  { id: 'swift', from: 15 },
  { id: 'phoenix', from: 20 },
];

/** The modifiers live at a Heat, in table order. */
export function modifiersAt(heat: number): HeatModifierId[] {
  const h = Math.max(1, whole(heat, 1));
  return HEAT_MODIFIERS.filter((m) => h >= m.from).map((m) => m.id);
}

/** Modifier tuning (taste calls, G4 Cinderlands). */
export const MODIFIER_TUNING = {
  /** Burning: chance an enemy hit applies the burn status. */
  burnChance: 0.35,
  /** Armoured: damage taken until the enemy's first stagger. */
  armouredTaken: 0.8,
  /** Swift: move and attack speed. */
  swiftSpeed: 1.2,
  /** Phoenix: rises once at this fraction of max health. */
  phoenixAt: 0.3,
} as const;
