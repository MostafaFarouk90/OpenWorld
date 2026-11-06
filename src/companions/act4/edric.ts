// Act 4 (L4, plans/act4-L4.md section 1.4): Edric IV as an escorted ally in M40 and M41, carrying the practice blade
// Cael forged for him in R22. Keyed off `story.r22.choice` only (so this needs nothing from L7's item table):
//   light -> the duelling blade in his right hand;
//   heavy -> the greatsword slung across his back (too big for his hands at 0.72 scale);
//   unset -> nothing.
// Built from primitives (no model for either blade), sized in metres whatever the figure's scale.
import * as THREE from 'three';
import { RIGHT_HAND_SLOT } from '../../characters/knightClips';
import type { NpcDef } from '../../npcs/types';

export const R22_CHOICE_FLAG = 'story.r22.choice';
export type EdricBlade = 'light' | 'heavy';

/** The shipped look (src/harrowmark/npcDefs.ts: Rogue at 0.72, gold tabard). */
export const EDRIC_NPC_ID = 'edric';
export const EDRIC_BLADE_NAME = 'edric-practice-blade';

export function edricBladeFor(choice: unknown): EdricBlade | null {
  return choice === 'light' || choice === 'heavy' ? choice : null;
}

function bladeMesh(kind: EdricBlade): THREE.Group {
  const g = new THREE.Group();
  g.name = EDRIC_BLADE_NAME;
  g.userData.blade = kind;
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.35, metalness: 0.8 });
  const hilt = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b23a, roughness: 0.5, metalness: 0.6 });
  // along +Y from the grip: grip, guard, blade
  const len = kind === 'light' ? 0.72 : 1.25;
  const wide = kind === 'light' ? 0.035 : 0.075;
  const parts: Array<[THREE.BufferGeometry, THREE.Material, number]> = [
    [new THREE.BoxGeometry(0.035, kind === 'light' ? 0.14 : 0.26, 0.035), hilt, kind === 'light' ? 0.07 : 0.13],
    [new THREE.BoxGeometry(kind === 'light' ? 0.16 : 0.3, 0.03, 0.04), gold, kind === 'light' ? 0.15 : 0.27],
    [new THREE.BoxGeometry(wide, len, 0.012), steel, (kind === 'light' ? 0.16 : 0.28) + len / 2],
  ];
  for (const [geo, mat, y] of parts) {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

/** Puts the blade on Edric's model (`model` as `NpcDef.decorate` receives it), replacing any earlier one. */
export function attachEdricBlade(model: THREE.Object3D, kind: EdricBlade | null): THREE.Object3D | null {
  const old = model.getObjectByName(EDRIC_BLADE_NAME);
  old?.removeFromParent();
  if (!kind) return null;
  const blade = bladeMesh(kind);
  model.updateMatrixWorld(true);
  const hand = kind === 'light' ? model.getObjectByName(RIGHT_HAND_SLOT) : undefined;
  const parent = hand ?? model;
  parent.add(blade);
  // metres whatever the parent's scale
  const s = new THREE.Vector3();
  parent.getWorldScale(s);
  blade.scale.setScalar(s.x > 1e-6 ? 1 / s.x : 1);
  if (!hand) {
    // the greatsword (or, with no hand bone, the light blade) slung across the back, point down to his left
    const k = s.x > 1e-6 ? 1 / s.x : 1;
    blade.position.set(0.1 * k, 1.15 * k * (kind === 'light' ? 0.8 : 1), 0.16 * k);
    blade.rotation.set(0, 0, Math.PI * (kind === 'light' ? 0.85 : 0.8));
  }
  return blade;
}

/** Edric's NPC def with the blade from `choice` (for L10's M41 camp post as well as the escort figure). */
export function withEdricBlade(def: NpcDef, choice: unknown): NpcDef {
  const kind = edricBladeFor(choice);
  const base = def.decorate;
  return {
    ...def,
    decorate: (model) => {
      base?.(model);
      attachEdricBlade(model, kind);
    },
  };
}
