import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RIGHT_HAND_SLOT } from '../../characters/knightClips';
import { HARROWMARK_NPC_DEFS } from '../../harrowmark/npcDefs';
import { EDRIC_BLADE_NAME, EDRIC_NPC_ID, attachEdricBlade, edricBladeFor, withEdricBlade } from './edric';

/** A figure at Edric's 0.72 scale with a right-hand bone. */
function figure(withHand = true) {
  const model = new THREE.Group();
  model.scale.setScalar(0.72 * 0.78);
  const arm = new THREE.Bone();
  arm.position.set(0.4, 1.2, 0);
  model.add(arm);
  if (withHand) {
    const hand = new THREE.Bone();
    hand.name = RIGHT_HAND_SLOT;
    arm.add(hand);
  }
  return model;
}
const worldLen = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length();
};

describe("Edric's practice blade (R22)", () => {
  it('reads story.r22.choice only: light, heavy or nothing', () => {
    expect(edricBladeFor('light')).toBe('light');
    expect(edricBladeFor('heavy')).toBe('heavy');
    expect(edricBladeFor(undefined)).toBeNull();
    expect(edricBladeFor('other')).toBeNull();
  });

  it('light: in the right hand, sized in metres whatever the scale', () => {
    const m = figure();
    const b = attachEdricBlade(m, 'light')!;
    expect(b.parent?.name).toBe(RIGHT_HAND_SLOT);
    expect(worldLen(b)).toBeGreaterThan(0.8);
    expect(worldLen(b)).toBeLessThan(1.2);
  });

  it('heavy: slung on the back (not in the hand), longer than the light one', () => {
    const m = figure();
    const b = attachEdricBlade(m, 'heavy')!;
    expect(b.parent).toBe(m);
    expect(worldLen(b)).toBeGreaterThan(1.4);
  });

  it('replaces an earlier blade, and nothing for an unset choice removes it', () => {
    const m = figure();
    attachEdricBlade(m, 'light');
    attachEdricBlade(m, 'heavy');
    const all: THREE.Object3D[] = [];
    m.traverse((o) => o.name === EDRIC_BLADE_NAME && all.push(o));
    expect(all).toHaveLength(1);
    expect(all[0].userData.blade).toBe('heavy');
    attachEdricBlade(m, null);
    expect(m.getObjectByName(EDRIC_BLADE_NAME)).toBeUndefined();
  });

  it('no hand bone: the light blade goes on his back instead of failing', () => {
    const m = figure(false);
    expect(attachEdricBlade(m, 'light')!.parent).toBe(m);
  });

  it('withEdricBlade keeps the shipped def and its own decorate', () => {
    const shipped = HARROWMARK_NPC_DEFS.find((d) => d.id === EDRIC_NPC_ID)!;
    expect(shipped.scale).toBe(0.72);
    let ran = 0;
    const def = withEdricBlade({ ...shipped, decorate: () => void ran++ }, 'light');
    expect(def.tint).toBe(shipped.tint);
    const m = figure();
    def.decorate!(m);
    expect(ran).toBe(1);
    expect(m.getObjectByName(EDRIC_BLADE_NAME)).toBeDefined();
  });
});
