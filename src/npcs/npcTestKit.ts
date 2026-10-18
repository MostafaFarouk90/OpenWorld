import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { NpcModelId, NpcModelLoader } from './types';

export function makeSource() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const geo = new THREE.BoxGeometry(1, 2, 1);
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'root';
  root.add(bone);
  const body = new THREE.Mesh(geo, mat);
  body.name = 'Body';
  const sword = new THREE.Mesh(geo, mat);
  sword.name = '1H_Sword';
  root.add(body, sword);
  const clips = [new THREE.AnimationClip('Idle', 1, [new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 0, 0, 0, 1, 0])])];
  return { mat, geo, root, clips };
}

export function fakeLoader(src = makeSource()): NpcModelLoader & { src: ReturnType<typeof makeSource>; loads: string[] } {
  const loads: string[] = [];
  return {
    src,
    loads,
    load: async (id: NpcModelId) => void loads.push(id),
    instantiate: () => SkeletonUtils.clone(src.root),
    animations: () => src.clips,
  };
}
