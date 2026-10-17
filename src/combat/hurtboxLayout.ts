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
 *  - Axis offset (ox, oz) = midpoint of the vertices' x,z bounding box if |midpoint| > 0.02, else 0
 *    (not the median, which follows vertex density instead of the shape).
 *  - radius = 90th percentile of the radial (x,z) distance from the axis.
 *  - Axis runs along +Y from y=min to y=max of the vertex extent, shrunk by `radius` at each end so
 *    the hemispherical caps cover the extent. If extent length < 2*radius the segment collapses to a
 *    short (0.02) segment centred on the extent.
 *  - No extra margin: HurtboxSet already inflates its mesh to catch grazes.
 *
 * Raw numbers (bone-local units; y extent = [min, max]; offset = x,z bounding-box midpoint):
 *   bone         verts  y extent          p90 radius  axis offset (x, z)
 *   head          727   [-0.0255, 1.0731]  0.4919      (0, 0.0233)   oversized helmet
 *   chest         273   [ 0.1222, 0.3204]  0.3547      (0, -0.046)   collapsed
 *   spine         777   [-0.1764, 0.5335]  0.3697      (0, 0)        waist and belly; collapsed
 *   hips           91   [-0.0293, 0.0585]  0.2657      (0, 0)        collapsed
 *   upperarm.l/r  174   [-0.1622, 0.2136]  0.1520      (0, 0.0238)   0.0716 segment
 *   lowerarm.l/r  188   [ 0.0043, 0.2734]  0.1463      (0, 0)        collapsed
 *   upperleg.l/r  146   [-0.0115, 0.2438]  0.1285      (0, 0)        collapsed
 *   lowerleg.l/r  110   [-0.0052, 0.1745]  0.1480      (0, 0)        collapsed
 * Every bone had >= 20 vertices. KayKit limbs and body are chunky (radius comparable to length), so
 * nearly every capsule collapses to a near-sphere around the extent centre. The spine and hips bones
 * are covered too, so a low slice through the belly connects. Radius is a 90th percentile, so the
 * shapes are slightly generous at the extremes and exact for most vertices.
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
  cap('head', 'head', 0, 0.4664, 0.5812, 0.0233, 0.4919),
  cap('torso', 'chest', 0, 0.2113, 0.2313, -0.046, 0.3547),
  cap('abdomen', 'spine', 0, 0.1686, 0.1886, 0, 0.3697),
  cap('hips', 'hips', 0, 0.0046, 0.0246, 0, 0.2657),
  cap('upperArmL', 'upperarm.l', 0, -0.0102, 0.0616, 0.0238, 0.152),
  cap('upperArmR', 'upperarm.r', 0, -0.0102, 0.0616, 0.0238, 0.152),
  cap('lowerArmL', 'lowerarm.l', 0, 0.1289, 0.1489, 0, 0.1463),
  cap('lowerArmR', 'lowerarm.r', 0, 0.1289, 0.1489, 0, 0.1463),
  cap('upperLegL', 'upperleg.l', 0, 0.1061, 0.1261, 0, 0.1285),
  cap('upperLegR', 'upperleg.r', 0, 0.1061, 0.1261, 0, 0.1285),
  cap('lowerLegL', 'lowerleg.l', 0, 0.0747, 0.0947, 0, 0.148),
  cap('lowerLegR', 'lowerleg.r', 0, 0.0747, 0.0947, 0, 0.148),
];
