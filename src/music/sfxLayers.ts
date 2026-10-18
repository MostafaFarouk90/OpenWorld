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
} as const;

export type SfxId = (typeof SFX)[keyof typeof SFX];
export const SFX_IDS: readonly SfxId[] = Object.values(SFX);

export type Material = 'flesh' | 'ash' | 'metal' | 'wood' | 'straw';

const IMPACT: Record<Material, SfxId> = {
  flesh: SFX.impactFlesh,
  ash: SFX.impactAsh,
  metal: SFX.impactMetal,
  wood: SFX.impactWood,
  straw: SFX.impactStraw,
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
