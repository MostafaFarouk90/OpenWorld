export const SFX = {
  swingLight: 'sfx.swing.light',
  swingHeavy: 'sfx.swing.heavy',
  impactFlesh: 'sfx.impact.flesh',
  impactAsh: 'sfx.impact.ash',
  impactMetal: 'sfx.impact.metal',
  impactWood: 'sfx.impact.wood',
  impactStraw: 'sfx.impact.straw',
  thump: 'sfx.thump',
  armourRing: 'sfx.armour-ring',
  block: 'sfx.block',
  parry: 'sfx.parry',
  // Slice 2 (contracts/music-states.md section 7). Variant ids, also registered under their bare key.
  impactPlant: 'sfx.impact.plant',
  releasePulse: 'sfx.release.pulse',
  yieldKneel: 'sfx.yield.kneel',
  leap: 'sfx.leap',
  companionBark: 'sfx.companion.bark',
} as const;

/** Slice 2 one-shots played or registered under their bare key (no variant suffix). */
export const BARE_SFX = {
  whistle: 'sfx.whistle',
  wardstone1: 'sfx.wardstone.1',
  wardstone2: 'sfx.wardstone.2',
  wardstone3: 'sfx.wardstone.3',
  wardstone4: 'sfx.wardstone.4',
  wardstone5: 'sfx.wardstone.5',
  wardstoneMiss: 'sfx.wardstone.miss',
  wardstonesComplete: 'sfx.wardstones.complete',
  priorGong: 'sfx.prior.gong',
  priorTeleport: 'sfx.prior.teleport',
  shrineRekindle: 'sfx.shrine.rekindle',
} as const;
export type BareSfxId = (typeof BARE_SFX)[keyof typeof BARE_SFX];
export const BARE_SFX_IDS: readonly BareSfxId[] = Object.values(BARE_SFX);
export type AnySfxId = SfxId | SpellSfxId | BareSfxId;

/** Spell sounds played by the spells plugin (thread 7) under these exact keys, with no variant suffix. */
export const SPELL_SFX = {
  surgeCharge: 'sfx.surge.charge',
  surgeRelease: 'sfx.surge.release',
  rally: 'sfx.rally',
} as const;

export type SpellSfxId = (typeof SPELL_SFX)[keyof typeof SPELL_SFX];
export const SPELL_SFX_IDS: readonly SpellSfxId[] = Object.values(SPELL_SFX);

export type SfxId = (typeof SFX)[keyof typeof SFX];
export const SFX_IDS: readonly SfxId[] = Object.values(SFX);

export type Material = 'flesh' | 'ash' | 'metal' | 'wood' | 'straw' | 'plant';

const IMPACT: Record<Material, SfxId> = {
  flesh: SFX.impactFlesh,
  ash: SFX.impactAsh,
  metal: SFX.impactMetal,
  wood: SFX.impactWood,
  straw: SFX.impactStraw,
  plant: SFX.impactPlant,
};

/**
 * Maps `actor.data['audio']?.material` to a material; anything else is flesh. `known` is false
 * only for a present but unrecognised value, which callers warn about once.
 */
export function resolveMaterial(raw: unknown): { material: Material; known: boolean } {
  if (typeof raw === 'string' && Object.prototype.hasOwnProperty.call(IMPACT, raw)) {
    return { material: raw as Material, known: true };
  }
  return { material: 'flesh', known: raw === undefined || raw === null };
}

export const HEAVY_POISE = 30;

/** Design 11.0: a heavy hit is the chop, a killing blow, or 30+ poise damage. */
export function isHeavyHit(hit: { poiseDealt: number; killed: boolean; attackId?: string }): boolean {
  return hit.killed || hit.poiseDealt >= HEAVY_POISE || /chop/i.test(hit.attackId ?? '');
}

export function swingLayer(attackId: string | undefined): SfxId {
  return /chop/i.test(attackId ?? '') ? SFX.swingHeavy : SFX.swingLight;
}

/** The layers to play for one damage result; `immune` and unknown outcomes play nothing. */
export function impactLayers(outcome: string, material: Material, heavy: boolean): SfxId[] {
  if (outcome === 'blocked') return [SFX.block];
  if (outcome === 'parried') return [SFX.parry];
  if (outcome !== 'hit') return [];
  const layers: SfxId[] = [IMPACT[material]];
  if (heavy) {
    layers.push(SFX.thump);
    if (material === 'metal') layers.push(SFX.armourRing);
  }
  return layers;
}
