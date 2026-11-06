// Contracts v0.8 item 11: enemy skins, a look over a kind's shipped model (the soot and masked Footmen are the shipped
// `blighted-soldier`; the wraith husk is the shipped ash wraith). Each skin starts as its kind's own look, so it draws like
// the base until L2 and L5 fill in the overrides. `SpawnerDef.skin` passes it to the spawn; the actor carries `actor.skin`.
import type { EnemyKind } from './types';

export type EnemySkinId = 'footman-soot' | 'footman-masked' | 'wraith-husk' | 'watch-masked';

export interface EnemySkinDef {
  /** The kind the skin dresses: a spawner with a skin of another kind is a lint error. */
  kind: EnemyKind;
  /** Multiplies the model's base colours (0xRRGGBB). */
  tint?: number;
  /** Adds an emissive colour (0xRRGGBB). */
  emissive?: number;
  /** Model node names to hide (a helmet, a shield). */
  hide?: readonly string[];
  /** An extra prop id attached by the model builder (a mask, a soot hood). */
  extra?: string;
}

export const ENEMY_SKINS: Readonly<Record<EnemySkinId, EnemySkinDef>> = {
  // L2 (plan act4-L2.md section 8): Vey's Footmen. A tint multiplies the kind's own (charred red), so these are relative.
  // Soot: smoke-blackened kit, a low ember glow in the seams. Masked: the Regent's men, cooler and with no glow, so the
  // two read apart at a glance. The shield stays (its tracer drives the block); the cloth mask and cloak extras wait for
  // a model (the env prompt list), since no builder reads `extra` yet.
  'footman-soot': { kind: 'blighted-soldier', tint: 0x6e6a66, emissive: 0x220c04 },
  'footman-masked': { kind: 'blighted-soldier', tint: 0xa8b0c4, emissive: 0x000000 },
  'wraith-husk': { kind: 'ash-wraith' },
  // L2: Vey's stealth observers (M36's rooftops, R20's stealth checkpoints) in the Regent's colours.
  'watch-masked': { kind: 'watch-guard', tint: 0x8890a0 },
};

export const ENEMY_SKIN_IDS = Object.keys(ENEMY_SKINS) as EnemySkinId[];

export function isEnemySkinId(v: unknown): v is EnemySkinId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ENEMY_SKINS, v);
}
