// Rendering far from the origin (Act 2 places the player up to 22 km out). three.js builds modelViewMatrix in float64
// on the CPU, so ordinary meshes stay precise anywhere, but two paths do world-space maths in float32 on the GPU:
//
// - Skinning: bone matrices are uploaded in world space, so at x 22000 every skinned vertex rounds to about 2 mm and
//   shimmers as the character moves. The fix keeps bone matrices relative to a render anchor near the camera,
//   computed in float64 before the upload, and folds the anchor back into each mesh's bindMatrixInverse (also float64).
//   The shader's product is unchanged: (M^-1 * T(a)) * (T(-a) * B) = M^-1 * B.
// - Directional shadows: the receiver's shadow coordinate is shadowMatrix * worldPosition, with worldPosition built in
//   float32 from modelMatrix. The fix reads the coordinate from the view-space position instead and multiplies the
//   camera's world matrix into the shadow matrix on the CPU, so the matrix the GPU sees has small entries.
//
// Measured with tools/far-coords (Act 2 Step 0, plans/act2-a0-far-coords.md). The anchor snaps to a coarse grid so a
// mesh whose world matrix is not refreshed every frame stays consistent except on the frame the camera crosses a line.
import * as THREE from 'three';

/** Grid the render anchor snaps to, in metres. */
export const RENDER_ANCHOR_GRID = 256;

const anchor = new THREE.Vector3();
const offset = new THREE.Matrix4();
const identity = new THREE.Matrix4();
const shift = new THREE.Matrix4();
let frameCamera: THREE.Camera | null = null;
let patched = false;
const wrapped = new WeakSet<THREE.WebGLRenderer>();

/** The shadow chunk line three ships for directional lights, and its view-space replacement. */
export const SHADOW_COORD_WORLD =
  'vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;';
export const SHADOW_COORD_VIEW =
  'vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * vec4( mvPosition.xyz + normalize( transformedNormal ) * directionalLightShadows[ i ].shadowNormalBias, 1.0 );';

/** The current render anchor (for tests and debug). */
export function renderAnchor(): Readonly<THREE.Vector3> {
  return anchor;
}

/** Moves the render anchor to the grid point nearest `at` (x and z only; heights stay small). */
export function setRenderAnchor(at: { x: number; z: number }): void {
  const g = RENDER_ANCHOR_GRID;
  anchor.set(Math.round(at.x / g) * g + 0, 0, Math.round(at.z / g) * g + 0);
}

/**
 * Installs both fixes for `renderer`: patches three's Skeleton, SkinnedMesh, DirectionalLightShadow and shadow chunk
 * once per page, and wraps `renderer.render` once so each render sets the anchor and the frame camera first. Call it
 * before the first frame, so no shader compiles with the stock chunk. Idempotent.
 */
export function installFarPrecision(renderer: THREE.WebGLRenderer): void {
  patchThree();
  if (wrapped.has(renderer)) return;
  wrapped.add(renderer);
  const render = renderer.render.bind(renderer);
  const at = new THREE.Vector3();
  renderer.render = (scene: THREE.Object3D, camera: THREE.Camera) => {
    // The camera's world matrix may be a frame stale here; the anchor's grid absorbs that.
    if (camera.parent) camera.getWorldPosition(at);
    else at.copy(camera.position);
    setRenderAnchor(at);
    frameCamera = camera;
    try {
      render(scene, camera);
    } finally {
      frameCamera = null;
    }
  };
}

function patchThree(): void {
  if (patched) return;
  patched = true;

  THREE.Skeleton.prototype.update = function update(this: THREE.Skeleton): void {
    const { bones, boneInverses, boneMatrices, boneTexture } = this;
    for (let i = 0, n = bones.length; i < n; i++) {
      const matrix = bones[i] ? bones[i].matrixWorld : identity;
      offset.multiplyMatrices(matrix, boneInverses[i]);
      const e = offset.elements;
      // T(-a) * B for an affine B: only the translation column moves.
      e[12] -= anchor.x;
      e[13] -= anchor.y;
      e[14] -= anchor.z;
      offset.toArray(boneMatrices, i * 16);
    }
    if (boneTexture !== null) boneTexture.needsUpdate = true;
  };

  const updateMatrixWorld = THREE.SkinnedMesh.prototype.updateMatrixWorld;
  THREE.SkinnedMesh.prototype.updateMatrixWorld = function patched(this: THREE.SkinnedMesh, force?: boolean): void {
    // The base call rebuilds bindMatrixInverse from scratch in either bind mode, so folding the anchor in is idempotent.
    updateMatrixWorld.call(this, force);
    this.bindMatrixInverse.multiply(shift.makeTranslation(anchor.x, anchor.y, anchor.z));
  };

  const chunk = THREE.ShaderChunk.shadowmap_vertex;
  if (!chunk.includes(SHADOW_COORD_WORLD)) {
    console.warn('farPrecision: three changed shadowmap_vertex; far shadows keep the stock path');
    return;
  }
  THREE.ShaderChunk.shadowmap_vertex = chunk.replace(SHADOW_COORD_WORLD, SHADOW_COORD_VIEW);

  // three does not export DirectionalLightShadow; reach its prototype through an instance.
  const proto = Object.getPrototypeOf(new THREE.DirectionalLight().shadow) as THREE.DirectionalLightShadow;
  const updateMatrices = proto.updateMatrices;
  proto.updateMatrices = function patched(this: THREE.DirectionalLightShadow, light: THREE.Light): void {
    updateMatrices.call(this, light);
    // Receivers now feed view-space positions, so the matrix maps view space to shadow texture space. Outside a
    // wrapped render there is no camera and the matrix stays world-space (nothing draws then).
    if (frameCamera) this.matrix.multiply(frameCamera.matrixWorld);
  };
}
