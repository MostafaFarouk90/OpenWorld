import * as THREE from 'three';
import { NPC_TUNING } from './tuning';
import type { NpcDef, NpcModelId, NpcModelLoader } from './types';

const PLACEHOLDER_COLOURS: Record<NpcModelId, number> = {
  knight: 0x8d96a3,
  barbarian: 0x9c6b3f,
  mage: 0x5b5fa8,
  rogue: 0x4f6b4a,
  rogueHooded: 0x4a5a3d,
};

/** Held items modelled into the GLBs (swords, shields, staffs, books, mugs); NPCs stand empty-handed. */
const HELD_ITEM = /^(1H_|2H_|Knife|Throwable|Badge_|Rectangle_|Round_Shield|Spike_|Spellbook|Mug|Barbarian_Round_Shield)/;

/** Synchronous stand-in: capsule body, sphere head, a nose box on +Z. Feet at the origin, ~1.8 m tall. */
export function buildPlaceholder(def: NpcDef): THREE.Group {
  const t = NPC_TUNING.placeholder;
  const g = new THREE.Group();
  g.name = `npc-placeholder:${def.id}`;
  const mat = new THREE.MeshStandardMaterial({ color: def.tint ?? PLACEHOLDER_COLOURS[def.model] });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(t.bodyRadius, t.bodyLength, 4, 8), mat);
  body.position.y = t.bodyRadius + t.bodyLength / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(t.headRadius, 12, 8), mat);
  head.position.y = t.height - t.headRadius;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.12), mat);
  nose.position.set(0, t.height - t.headRadius, t.headRadius);
  g.add(body, head, nose);
  g.scale.setScalar(def.scale);
  return g;
}

export function disposePlaceholder(g: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mm);
  });
  mats.forEach((m) => m.dispose());
}

export interface LoadedNpcModel {
  model: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

/**
 * Loads the def's GLB and returns a private clone: scaled, tinted, empty-handed, facing +Z (the
 * KayKit rig's native facing, which matches the layout's yaw 0). Materials are cloned before the
 * tint so the loader's shared source materials are never touched. Rejects if the load fails.
 */
export async function loadNpcModel(loader: NpcModelLoader, def: NpcDef): Promise<LoadedNpcModel> {
  await loader.load(def.model);
  return prepareNpcModel(loader, def);
}

/** Like loadNpcModel for a GLB the loader has already loaded. Synchronous; throws on failure. */
export function prepareNpcModel(loader: NpcModelLoader, def: NpcDef): LoadedNpcModel {
  const model = loader.instantiate(def.model);
  const clips = loader.animations(def.model);
  model.scale.multiplyScalar(NPC_TUNING.modelBaseScale * def.scale);
  const tint = def.tint === null ? null : new THREE.Color(def.tint);
  const hide: THREE.Object3D[] = [];
  model.traverse((o) => {
    if (HELD_ITEM.test(o.name)) hide.push(o);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    o.castShadow = true;
    const clone = (m: THREE.Material): THREE.Material => {
      const c = m.clone();
      const col = (c as THREE.MeshStandardMaterial).color;
      if (tint && col) col.lerp(tint, NPC_TUNING.tintStrength);
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
  });
  hide.forEach((o) => (o.visible = false));
  return { model, clips };
}

/** The named idle clip, else the first clip whose name contains 'Idle', else undefined. */
export function pickIdleClip(clips: readonly THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
  return clips.find((c) => c.name === name) ?? clips.find((c) => c.name.includes('Idle'));
}
