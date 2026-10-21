import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installFarPrecision, RENDER_ANCHOR_GRID, renderAnchor, setRenderAnchor, SHADOW_COORD_VIEW, SHADOW_COORD_WORLD } from './farPrecision';

// Stock three's matrices, captured before the patch is installed (the patch is global to this test file's worker).
function rig() {
  const root = new THREE.Bone();
  const child = new THREE.Bone();
  child.position.set(0, 1, 0);
  root.add(child);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([root, child]));
  mesh.position.set(22000.37, 1.5, 3000.81);
  mesh.rotation.y = 0.7;
  child.rotation.z = 0.3;
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** bindMatrixInverse * boneMatrix[i], the product the skinning shader uses. */
function products(mesh: THREE.SkinnedMesh): THREE.Matrix4[] {
  mesh.skeleton.update();
  return mesh.skeleton.bones.map((_, i) => new THREE.Matrix4().fromArray(mesh.skeleton.boneMatrices, i * 16).premultiply(mesh.bindMatrixInverse));
}

/** The exact product in float64: (mesh world)^-1 * bone world * bone inverse (attached bind mode). */
function exact(mesh: THREE.SkinnedMesh): THREE.Matrix4[] {
  const inv = mesh.matrixWorld.clone().invert();
  return mesh.skeleton.bones.map((b, i) => inv.clone().multiply(b.matrixWorld).multiply(mesh.skeleton.boneInverses[i]));
}
const stockMesh = rig();
const stock = products(stockMesh);
const reference = exact(stockMesh);
const maxError = (a: THREE.Matrix4[], b: THREE.Matrix4[]) =>
  Math.max(...a.flatMap((m, i) => m.elements.map((v, k) => Math.abs(v - b[i].elements[k]))));
const stockChunk = THREE.ShaderChunk.shadowmap_vertex;

describe('farPrecision', () => {
  it('the anchor snaps to the grid on x and z', () => {
    setRenderAnchor({ x: 22100, z: -3000 });
    expect(renderAnchor().x).toBe(Math.round(22100 / RENDER_ANCHOR_GRID) * RENDER_ANCHOR_GRID);
    expect(renderAnchor().y).toBe(0);
    expect(renderAnchor().z).toBe(Math.round(-3000 / RENDER_ANCHOR_GRID) * RENDER_ANCHOR_GRID);
  });

  it('stock three still ships the shadow line the patch replaces', () => {
    expect(stockChunk).toContain(SHADOW_COORD_WORLD);
  });

  describe('installed', () => {
    const calls: THREE.Matrix4[] = [];
    const light = new THREE.DirectionalLight();
    light.position.set(22050, 100, 3050);
    light.target.position.set(22000, 0, 3000);
    light.updateMatrixWorld(true);
    light.target.updateMatrixWorld(true);
    const renderer = {
      render: () => {
        light.shadow.updateMatrices(light);
        calls.push(light.shadow.matrix.clone());
      },
    } as unknown as THREE.WebGLRenderer;
    installFarPrecision(renderer);
    installFarPrecision(renderer); // idempotent

    it('the shader product matches the exact one to float32 precision near the anchor (stock is off by about 1 mm at 22 km)', () => {
      setRenderAnchor({ x: 22000, z: 3000 });
      const mesh = rig();
      const patched = products(mesh);
      expect(maxError(patched, reference)).toBeLessThan(1e-5);
      expect(maxError(stock, reference)).toBeGreaterThan(1e-4);
      for (let i = 0; i < mesh.skeleton.bones.length; i++) {
        const t = mesh.skeleton.boneMatrices.slice(i * 16 + 12, i * 16 + 15);
        expect(Math.hypot(t[0], t[1], t[2])).toBeLessThan(RENDER_ANCHOR_GRID);
      }
    });

    it('refreshing the world matrix twice does not fold the anchor twice', () => {
      setRenderAnchor({ x: 22000, z: 3000 });
      const mesh = rig();
      mesh.updateMatrixWorld(true);
      mesh.updateMatrixWorld(true);
      expect(maxError(products(mesh), reference)).toBeLessThan(1e-5);
    });

    it('CPU-side skinning ignores the anchor: the culling sphere sits on the mesh and the frustum sees it', () => {
      setRenderAnchor({ x: 0, z: 0 });
      const ref = rig();
      ref.computeBoundingSphere();
      setRenderAnchor({ x: 22000, z: 3000 });
      const mesh = rig();
      mesh.computeBoundingSphere();
      expect(mesh.boundingSphere!.center.distanceTo(ref.boundingSphere!.center)).toBeLessThan(1e-6);
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
      camera.position.set(22000.37, 1.5, 3010.81);
      camera.lookAt(22000.37, 1.5, 3000.81);
      camera.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      (mesh as { boundingSphere: THREE.Sphere | null }).boundingSphere = null;
      expect(frustum.intersectsObject(mesh)).toBe(true);
      // The GPU path still uses the shifted inverse.
      expect(maxError(products(mesh), reference)).toBeLessThan(1e-5);
    });

    it('the shadow chunk reads the view-space position', () => {
      expect(THREE.ShaderChunk.shadowmap_vertex).toContain(SHADOW_COORD_VIEW);
      expect(THREE.ShaderChunk.shadowmap_vertex).not.toContain(SHADOW_COORD_WORLD);
    });

    it('inside a render the shadow matrix carries the camera world matrix; outside it is stock', () => {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(22003, 2, 3004);
      camera.updateMatrixWorld(true);
      light.shadow.updateMatrices(light);
      const world = light.shadow.matrix.clone();
      renderer.render(new THREE.Scene(), camera);
      const expected = world.clone().multiply(camera.matrixWorld);
      for (let k = 0; k < 16; k++) expect(calls.at(-1)!.elements[k]).toBeCloseTo(expected.elements[k], 6);
      // The render set the anchor from the camera.
      expect(renderAnchor().x).toBe(Math.round(22003 / RENDER_ANCHOR_GRID) * RENDER_ANCHOR_GRID);
    });
  });
});
