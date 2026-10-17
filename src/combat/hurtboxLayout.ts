import type { HurtboxDef } from './types';

/**
 * Hurtbox capsules for the KayKit Knight rig (Knight.glb).
 *
 * In KayKit rigs a bone's local +Y axis points toward its child bone, so most capsules run from the
 * bone origin (0,0,0) to (0,L,0). Lengths and radii are ESTIMATES tuned by eye, not measured from
 * the mesh; adjust them with the hurtbox debug view if they look off.
 *
 * Bone names are the glTF names with dots (e.g. 'upperarm.l'); HurtboxSet also tries the dot-stripped
 * form because three's GLTFLoader sanitises node names.
 */
const arm = (name: string, bone: string, length: number, radius: number): HurtboxDef => ({
  name,
  bone,
  start: { x: 0, y: 0, z: 0 },
  end: { x: 0, y: length, z: 0 },
  radius,
});

export const KNIGHT_HURTBOX_DEFS: HurtboxDef[] = [
  {
    name: 'head',
    bone: 'head',
    start: { x: 0, y: 0.05, z: 0 },
    end: { x: 0, y: 0.3, z: 0 },
    radius: 0.25, // the Knight's helmet is oversized (chibi proportions)
  },
  {
    name: 'torso',
    bone: 'chest',
    start: { x: 0, y: -0.1, z: 0 },
    end: { x: 0, y: 0.25, z: 0 },
    radius: 0.22,
  },
  arm('upperArmL', 'upperarm.l', 0.25, 0.08),
  arm('upperArmR', 'upperarm.r', 0.25, 0.08),
  arm('lowerArmL', 'lowerarm.l', 0.25, 0.07),
  arm('lowerArmR', 'lowerarm.r', 0.25, 0.07),
  arm('upperLegL', 'upperleg.l', 0.4, 0.1),
  arm('upperLegR', 'upperleg.r', 0.4, 0.1),
  arm('lowerLegL', 'lowerleg.l', 0.4, 0.08),
  arm('lowerLegR', 'lowerleg.r', 0.4, 0.08),
];
