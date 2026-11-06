// Contracts v0.8 item 11: enemy skins, a look over a kind's shipped model (the soot and masked Footmen are the shipped
// `blighted-soldier`; the wraith husk is the shipped ash wraith). Each skin starts as its kind's own look, so it draws like
// the base until L2 and L5 fill in the overrides. `SpawnerDef.skin` passes it to the spawn; the actor carries `actor.skin`.
import type * as THREE from 'three';
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
  // L5 (plan act4-L5.md section 5): the cathedral's husks, bone-white ash with a faint ember in place of the wraith's green,
  // the hat hidden so the head reads bald and shrunken. No new shader: the tint, the emissive and the shipped ash dissolve.
  'wraith-husk': { kind: 'ash-wraith', tint: 0x8a8580, emissive: 0x3a2e26, hide: ['Mage_Hat'] },
  // L2: Vey's stealth observers (M36's rooftops, R20's stealth checkpoints) in the Regent's colours.
  'watch-masked': { kind: 'watch-guard', tint: 0x8890a0 },
};

export const ENEMY_SKIN_IDS = Object.keys(ENEMY_SKINS) as EnemySkinId[];

export function isEnemySkinId(v: unknown): v is EnemySkinId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ENEMY_SKINS, v);
}

/**
 * Applies a skin's overrides to a built body (its own cloned materials): hides the named nodes, multiplies the colour and
 * adds the emissive. A skin with no overrides, an unknown skin or a skin of another kind changes nothing (the latter warns).
 * `extra` props are attached by L2 and L5 when they fill the skins.
 */
export function applyEnemySkin(body: { root: THREE.Object3D; materials: readonly THREE.Material[] }, kind: string, skin: string | undefined, warn: (m: string) => void): void {
  if (!skin) return;
  if (!isEnemySkinId(skin)) return warn(`enemies: unknown skin "${skin}"`);
  const def = ENEMY_SKINS[skin];
  if (def.kind !== kind) return warn(`enemies: skin "${skin}" dresses ${def.kind}, not ${kind}`);
  if (def.hide?.length) body.root.traverse((o) => {
    if (def.hide!.includes(o.name)) o.visible = false;
  });
  for (const m of body.materials) {
    const mat = m as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };
    if (def.tint !== undefined && mat.color) mat.color.multiply(new (mat.color.constructor as typeof THREE.Color)(def.tint));
    if (def.emissive !== undefined && mat.emissive) mat.emissive.setHex(def.emissive);
  }
}
