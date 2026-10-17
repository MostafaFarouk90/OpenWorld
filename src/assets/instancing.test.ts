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

  it('adds an index to non-indexed geometry', () => {
    const material = new THREE.MeshStandardMaterial();
    const geometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    expect(geometry.index).toBeNull();
    buildBatchedMesh([[{ geometry, material }]], 2);
    expect(geometry.index).not.toBeNull();
    expect(geometry.index!.count).toBe(geometry.getAttribute('position').count);
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
