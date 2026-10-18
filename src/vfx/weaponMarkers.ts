import * as THREE from 'three';

const HILT = 'weaponHilt';
const TIP = 'weaponTip';

function localBox(weapon: THREE.Object3D): THREE.Box3 {
  weapon.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(weapon.matrixWorld).invert();
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const m = new THREE.Matrix4();
  weapon.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb || bb.isEmpty()) return;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    tmp.copy(bb).applyMatrix4(m);
    box.union(tmp);
  });
  return box;
}

function marker(weapon: THREE.Object3D, name: string): THREE.Object3D {
  const found = weapon.children.find((c) => c.name === name);
  if (found) return found;
  const o = new THREE.Object3D();
  o.name = name;
  weapon.add(o);
  return o;
}

export function createWeaponMarkers(weapon: THREE.Object3D): { hilt: THREE.Object3D; tip: THREE.Object3D } {
  const hadHilt = weapon.children.some((c) => c.name === HILT);
  const hadTip = weapon.children.some((c) => c.name === TIP);
  const box = localBox(weapon);
  const hiltPos = new THREE.Vector3(0, 0, 0);
  const tipPos = new THREE.Vector3(0, 1, 0);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.y, size.z) > 1e-6) {
      const center = box.getCenter(new THREE.Vector3());
      const axis: 'x' | 'y' | 'z' = size.y >= size.x && size.y >= size.z ? 'y' : size.x >= size.z ? 'x' : 'z';
      hiltPos.copy(center);
      tipPos.copy(center);
      hiltPos[axis] = box.min[axis];
      tipPos[axis] = box.max[axis];
    }
  }
  const hilt = marker(weapon, HILT);
  const tip = marker(weapon, TIP);
  if (!hadHilt) hilt.position.copy(hiltPos);
  if (!hadTip) tip.position.copy(tipPos);
  return { hilt, tip };
}
