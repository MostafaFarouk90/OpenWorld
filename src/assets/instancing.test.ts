import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { addBatchedInstance, buildBatchedMesh, extractMeshParts, InstancedModel, type MeshPart } from './instancing';

function part(material: THREE.Material = new THREE.MeshStandardMaterial()): MeshPart {
  return { geometry: new THREE.BoxGeometry(1, 1, 1), material };
}

function translation(x: number, y = 0, z = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

describe('extractMeshParts', () => {
  it('returns no parts for an empty root', () => {
    expect(extractMeshParts(new THREE.Group())).toEqual([]);
  });

  it('bakes child transforms relative to the root, ignoring the root own transform', () => {
    const root = new THREE.Group();
    root.position.set(100, 20, 3);
    root.rotation.y = 1.2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.position.set(5, 0, 0);
    root.add(mesh);

    const parts = extractMeshParts(root);
    expect(parts).toHaveLength(1);
    parts[0].geometry.computeBoundingBox();
    const box = parts[0].geometry.boundingBox!;
    expect(box.min.x).toBeCloseTo(4.5);
    expect(box.max.x).toBeCloseTo(5.5);
    expect(box.min.y).toBeCloseTo(-0.5);
    expect(box.max.z).toBeCloseTo(0.5);
  });

  it('returns cloned geometry and leaves the original untouched', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.position.set(5, 0, 0);
    root.add(mesh);

    const parts = extractMeshParts(root);
    expect(parts[0].geometry).not.toBe(geometry);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.x).toBeCloseTo(0.5);
    expect(parts[0].material).toBe(mesh.material);
  });

  it('skips SkinnedMesh nodes', () => {
    const root = new THREE.Group();
    root.add(new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    expect(extractMeshParts(root)).toHaveLength(1);
  });

  it('splits a multi-material mesh with groups into one part per group', () => {
    const matA = new THREE.MeshStandardMaterial();
    const matB = new THREE.MeshStandardMaterial();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.clearGroups();
    geometry.addGroup(0, 12, 1);
    geometry.addGroup(12, 24, 0);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, [matA, matB]));

    const parts = extractMeshParts(root);
    expect(parts).toHaveLength(2);
    expect(parts[0].material).toBe(matB);
    expect(parts[0].geometry.getIndex()!.count).toBe(12);
    expect(parts[1].material).toBe(matA);
    expect(parts[1].geometry.getIndex()!.count).toBe(24);
  });

  it('uses the first material for a multi-material mesh without groups', () => {
    const matA = new THREE.MeshStandardMaterial();
    const matB = new THREE.MeshStandardMaterial();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.clearGroups();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, [matA, matB]));

    const parts = extractMeshParts(root);
    expect(parts).toHaveLength(1);
    expect(parts[0].material).toBe(matA);
  });

  it('skips groups that reference a missing material', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.clearGroups();
    geometry.addGroup(0, 12, 0);
    geometry.addGroup(12, 24, 5);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, [new THREE.MeshStandardMaterial()]));
    expect(extractMeshParts(root)).toHaveLength(1);
  });
});

describe('extractMeshParts transforms', () => {
  it('rotates positions and normals of a rotated child', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.rotation.y = Math.PI / 2;
    root.add(mesh);
    const geo = extractMeshParts(root)[0].geometry;
    const src = new THREE.BoxGeometry(1, 1, 1);
    const pos = geo.getAttribute('position');
    const normal = geo.getAttribute('normal');
    const srcNormal = src.getAttribute('normal');
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    let sawPlusX = false;
    for (let i = 0; i < normal.count; i++) {
      const expected = new THREE.Vector3().fromBufferAttribute(srcNormal, i).applyQuaternion(q);
      const got = new THREE.Vector3().fromBufferAttribute(normal, i);
      expect(got.distanceTo(expected)).toBeLessThan(1e-5);
      if (srcNormal.getX(i) === 1) {
        sawPlusX = true;
        // +x rotated 90 degrees about y points to -z.
        expect(got.z).toBeCloseTo(-1, 5);
        expect(got.x).toBeCloseTo(0, 5);
      }
    }
    expect(sawPlusX).toBe(true);
    expect(pos.count).toBe(src.getAttribute('position').count);
  });

  it('scales positions of a scaled child (x extent doubles) and keeps normals unit length', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.scale.set(2, 1, 1);
    root.add(mesh);
    const geo = extractMeshParts(root)[0].geometry;
    geo.computeBoundingBox();
    expect(geo.boundingBox!.max.x - geo.boundingBox!.min.x).toBeCloseTo(2);
    expect(geo.boundingBox!.max.y - geo.boundingBox!.min.y).toBeCloseTo(1);
    const normal = geo.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) {
      expect(new THREE.Vector3().fromBufferAttribute(normal, i).length()).toBeCloseTo(1, 5);
    }
  });
});

describe('InstancedModel', () => {
  it('creates one InstancedMesh per part with count starting at 0', () => {
    const model = new InstancedModel([part(), part()], 4);
    expect(model.meshes).toHaveLength(2);
    for (const mesh of model.meshes) {
      expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
      expect(mesh.count).toBe(0);
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
    expect(model.count).toBe(0);
    expect(model.children).toHaveLength(2);
  });

  it('returns sequential indices, updates every mesh count and stores the matrix', () => {
    const model = new InstancedModel([part(), part()], 4);
    expect(model.addInstance(translation(1))).toBe(0);
    expect(model.addInstance(translation(2))).toBe(1);
    expect(model.count).toBe(2);
    const out = new THREE.Matrix4();
    for (const mesh of model.meshes) {
      expect(mesh.count).toBe(2);
      mesh.getMatrixAt(1, out);
      expect(new THREE.Vector3().setFromMatrixPosition(out).x).toBe(2);
    }
  });

  it('throws when capacity is exceeded', () => {
    const model = new InstancedModel([part()], 1);
    model.addInstance(translation(0));
    expect(() => model.addInstance(translation(0))).toThrow('capacity exceeded');
    expect(model.count).toBe(1);
  });

  it('throws on the first add when capacity is 0', () => {
    const model = new InstancedModel([part()], 0);
    expect(() => model.addInstance(translation(0))).toThrow('capacity exceeded');
  });

  it('overwrites the matrix of an existing instance', () => {
    const model = new InstancedModel([part()], 2);
    model.addInstance(translation(1));
    model.setMatrixAt(0, translation(9));
    const out = new THREE.Matrix4();
    model.meshes[0].getMatrixAt(0, out);
    expect(new THREE.Vector3().setFromMatrixPosition(out).x).toBe(9);
  });

  it('addInstance does not eagerly compute the bounding sphere, and a later compute covers all instances', () => {
    const model = new InstancedModel([part(), part()], 4);
    model.addInstance(translation(0));
    model.addInstance(translation(100));
    for (const mesh of model.meshes) {
      expect(mesh.boundingSphere).toBeNull();
      expect(mesh.boundingBox).toBeNull();
      mesh.computeBoundingSphere();
      expect(mesh.boundingSphere!.containsPoint(new THREE.Vector3(100, 0, 0))).toBe(true);
      expect(mesh.boundingSphere!.containsPoint(new THREE.Vector3(0, 0, 0))).toBe(true);
    }
  });

  it('setMatrixAt invalidates previously computed bounds', () => {
    const model = new InstancedModel([part()], 2);
    model.addInstance(translation(0));
    const mesh = model.meshes[0];
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    model.setMatrixAt(0, translation(50));
    expect(mesh.boundingSphere).toBeNull();
    expect(mesh.boundingBox).toBeNull();
    mesh.computeBoundingSphere();
    expect(mesh.boundingSphere!.center.x).toBeCloseTo(50);
  });

  it.each([-1, 1, 2, 100])('setMatrixAt throws RangeError for out-of-range index %i', (index) => {
    const model = new InstancedModel([part()], 4);
    model.addInstance(translation(0));
    expect(() => model.setMatrixAt(index, translation(0))).toThrow(RangeError);
  });

  it('works with zero parts: no meshes, but instances are still counted', () => {
    const model = new InstancedModel([], 2);
    expect(model.meshes).toHaveLength(0);
    expect(model.addInstance(translation(0))).toBe(0);
    expect(model.count).toBe(1);
  });
});

describe('buildBatchedMesh', () => {
  it('throws when the models array is empty', () => {
    expect(() => buildBatchedMesh([], 4)).toThrow('no mesh parts');
  });

  it('throws when every model has an empty part list', () => {
    expect(() => buildBatchedMesh([[], []], 4)).toThrow('no mesh parts');
  });

  it('throws when parts use different materials and no override is given', () => {
    expect(() => buildBatchedMesh([[part()], [part()]], 4)).toThrow('more than one material');
  });

  it('accepts parts sharing one material instance', () => {
    const shared = new THREE.MeshStandardMaterial();
    const { mesh } = buildBatchedMesh([[part(shared)], [part(shared)]], 4);
    expect(mesh.material).toBe(shared);
  });

  it('accepts an override material for parts with different materials', () => {
    const override = new THREE.MeshStandardMaterial();
    const { mesh } = buildBatchedMesh([[part()], [part()]], 4, override);
    expect(mesh).toBeInstanceOf(THREE.BatchedMesh);
    expect(mesh.material).toBe(override);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
  });

  it('batches non-indexed geometry without modifying the caller geometry', () => {
    const material = new THREE.MeshStandardMaterial();
    const geometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    expect(geometry.index).toBeNull();
    const { mesh, geometryIds } = buildBatchedMesh([[{ geometry, material }]], 2);
    expect(geometry.index).toBeNull();
    const ids = addBatchedInstance(mesh, geometryIds[0], translation(3));
    expect(ids).toHaveLength(1);
    mesh.computeBoundingBox();
    expect(mesh.boundingBox!.max.x).toBeCloseTo(3.5);
  });

  it('leaves already indexed geometry as it was', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const index = geometry.index;
    buildBatchedMesh([[{ geometry, material: new THREE.MeshStandardMaterial() }]], 2);
    expect(geometry.index).toBe(index);
  });

  it('returns geometryIds shaped like the input models and parts', () => {
    const material = new THREE.MeshStandardMaterial();
    const { geometryIds } = buildBatchedMesh(
      [[part(material), part(material)], [], [part(material)]],
      4,
    );
    expect(geometryIds.map((ids) => ids.length)).toEqual([2, 0, 1]);
    expect(new Set(geometryIds.flat()).size).toBe(3);
  });

  it('rejects a maxInstances of 0, negative or fractional with a RangeError', () => {
    for (const max of [0, -1, 1.5]) {
      expect(() => buildBatchedMesh([[part()]], max)).toThrow(RangeError);
    }
  });

  it('rejects adding an instance once every slot is used', () => {
    const { mesh, geometryIds } = buildBatchedMesh([[part()]], 1);
    addBatchedInstance(mesh, geometryIds[0], translation(0));
    expect(() => addBatchedInstance(mesh, geometryIds[0], translation(1))).toThrow();
  });

  it('hides the parts already added when a multi-part instance does not fit', () => {
    const material = new THREE.MeshStandardMaterial();
    const { mesh, geometryIds } = buildBatchedMesh([[part(material), part(material)]], 3);
    addBatchedInstance(mesh, geometryIds[0], translation(0));
    const hideSpy = vi.spyOn(mesh, 'setVisibleAt');
    expect(() => addBatchedInstance(mesh, geometryIds[0], translation(1))).toThrow();
    expect(hideSpy).toHaveBeenCalledTimes(1);
    expect(hideSpy).toHaveBeenCalledWith(2, false);
    expect(mesh.getVisibleAt(2)).toBe(false);
  });

  it('leaves the mesh valid when no instances are added', () => {
    const { mesh } = buildBatchedMesh([[part()]], 4);
    expect(mesh.maxInstanceCount).toBe(4);
    expect(() => mesh.computeBoundingBox()).not.toThrow();
  });
});

describe('addBatchedInstance', () => {
  it('resets cached bounds so a far-away new instance is covered after recompute', () => {
    const { mesh, geometryIds } = buildBatchedMesh([[part()]], 4);
    addBatchedInstance(mesh, geometryIds[0], translation(0));
    mesh.computeBoundingSphere();
    expect(mesh.boundingSphere).not.toBeNull();
    const far = new THREE.Vector3(500, 0, 0);
    expect(mesh.boundingSphere!.containsPoint(far)).toBe(false);

    addBatchedInstance(mesh, geometryIds[0], translation(500));
    expect(mesh.boundingSphere).toBeNull();
    expect(mesh.boundingBox).toBeNull();
    mesh.computeBoundingSphere();
    expect(mesh.boundingSphere!.containsPoint(far)).toBe(true);
  });

  it('resets cached bounds even when the add throws for lack of slots', () => {
    const { mesh, geometryIds } = buildBatchedMesh([[part()]], 1);
    addBatchedInstance(mesh, geometryIds[0], translation(0));
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    expect(() => addBatchedInstance(mesh, geometryIds[0], translation(1))).toThrow();
    expect(mesh.boundingSphere).toBeNull();
    expect(mesh.boundingBox).toBeNull();
  });

  it('returns one instance id per part and sets each matrix', () => {
    const material = new THREE.MeshStandardMaterial();
    const { mesh, geometryIds } = buildBatchedMesh([[part(material), part(material)]], 4);
    const ids = addBatchedInstance(mesh, geometryIds[0], translation(7, 0, 0));
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    const out = new THREE.Matrix4();
    for (const id of ids) {
      mesh.getMatrixAt(id, out);
      expect(new THREE.Vector3().setFromMatrixPosition(out).x).toBe(7);
    }
  });

  it('returns an empty array for a model without parts', () => {
    const { mesh } = buildBatchedMesh([[part()]], 2);
    expect(addBatchedInstance(mesh, [], translation(0))).toEqual([]);
  });
});
