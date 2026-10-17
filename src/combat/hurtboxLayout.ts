import type { HurtboxDef } from './types';

/**
 * Hurtbox capsules for the KayKit Knight rig (Knight.glb), MEASURED from the skinned mesh.
 *
 * In KayKit rigs a bone's local +Y axis points toward its child bone. Capsules are in each bone's
 * local space (the model is unscaled here; KnightAvatar's 0.78 scale reaches the radius through the
 * bone's world scale). Bone names are the glTF names with dots (e.g. 'upperarm.l'); HurtboxSet also
 * tries the dot-stripped form because three's GLTFLoader sanitises node names.
 *
 * MEASUREMENT RULE (same for every bone; reproduce with
 *   MEASURE_HURTBOXES=1 npx vitest run src/combat/measureHurtboxes.measure.test.ts):
 *  - Bind pose (skeleton.pose(), no animation). Take the skinned vertices whose dominant skin weight
 *    (highest of the 4) belongs to the bone and is > 0.5, excluding the embedded weapon meshes.
 *    Express each in the bone's local space.
 *  - Axis offset (ox, oz) = median x,z of those vertices if |median| > 0.02, else 0.
 *  - radius = 90th percentile of the radial (x,z) distance from the axis.
 *  - Axis runs along +Y from y=min to y=max of the vertex extent, shrunk by `radius` at each end so
 *    the hemispherical caps cover the extent. If extent length < 2*radius the segment collapses to a
 *    short (0.02) segment centred on the extent.
 *  - No extra margin: HurtboxSet already inflates its mesh to catch grazes.
 *
 * Raw numbers (bone-local units; y extent = [min, max]):
 *   bone         verts  y extent          p90 radius  axis offset (x, z)
 *   head          727   [-0.0255, 1.0731]  0.6107      (0, 0.2689)   oversized helmet, collapsed
 *   chest         273   [ 0.1222, 0.3204]  0.3836      (0, 0)        collapsed
 *   upperarm.l    174   [-0.1622, 0.2136]  0.1707      (0.034, 0.0201)  collapsed
 *   upperarm.r    174   [-0.1622, 0.2136]  0.1751      (0.0242, 0.0201) collapsed
 *   lowerarm.l    188   [ 0.0043, 0.2734]  0.1606      (-0.0305, 0)  collapsed
 *   lowerarm.r    188   [ 0.0043, 0.2734]  0.1606      (0.0305, 0)   collapsed
 *   upperleg.l/r  146   [-0.0115, 0.2438]  0.1583      (0, -0.0376)  collapsed
 *   lowerleg.l/r  110   [-0.0052, 0.1745]  0.1507      (0, -0.0355)  collapsed
 * Every bone had >= 20 vertices, so no old value was kept. Most KayKit limb meshes are chunky
 * (radius comparable to length), so every capsule collapses to a near-sphere around the extent centre.
 */
const cap = (
  name: string,
  bone: string,
  x: number,
  y0: number,
  y1: number,
  z: number,
  radius: number,
): HurtboxDef => ({
  name,
  bone,
  start: { x, y: y0, z },
  end: { x, y: y1, z },
  radius,
});

export const KNIGHT_HURTBOX_DEFS: HurtboxDef[] = [
  cap('head', 'head', 0, 0.5138, 0.5338, 0.2689, 0.6107),
  cap('torso', 'chest', 0, 0.2113, 0.2313, 0, 0.3836),
  cap('upperArmL', 'upperarm.l', 0.034, 0.0085, 0.0429, 0.0201, 0.1707),
  cap('upperArmR', 'upperarm.r', 0.0242, 0.013, 0.0384, 0.0201, 0.1751),
  cap('lowerArmL', 'lowerarm.l', -0.0305, 0.1289, 0.1489, 0, 0.1606),
  cap('lowerArmR', 'lowerarm.r', 0.0305, 0.1289, 0.1489, 0, 0.1606),
  cap('upperLegL', 'upperleg.l', 0, 0.1061, 0.1261, -0.0376, 0.1583),
  cap('upperLegR', 'upperleg.r', 0, 0.1061, 0.1261, -0.0376, 0.1583),
  cap('lowerLegL', 'lowerleg.l', 0, 0.0747, 0.0947, -0.0355, 0.1507),
  cap('lowerLegR', 'lowerleg.r', 0, 0.0747, 0.0947, -0.0355, 0.1507),
];
