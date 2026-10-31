import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildMurkjawModel, DECK, HEAD_BONE, HURT_SEGMENTS } from './MurkjawModel';
import { LOOK } from './tuning';

describe('MurkjawModel', () => {
  it('builds a chain of segments with instanced teeth and hurtboxes on the head and first segments', () => {
    const m = buildMurkjawModel();
    expect(m.root.getObjectByName(HEAD_BONE)).toBeTruthy();
    expect(m.root.getObjectByName(`murkjaw-seg-${LOOK.segments - 1}`)).toBeTruthy();
    const teeth = m.root.getObjectByName('murkjaw-teeth') as THREE.InstancedMesh;
    expect(teeth.isInstancedMesh).toBe(true);
    expect(teeth.count).toBeGreaterThanOrEqual(12);
    expect(m.hurtboxes.count).toBe(HURT_SEGMENTS);
    expect(m.hurtboxes.missing).toEqual([]);
    m.dispose();
  });

  it('is hidden under the water and shows when he rears or reaches', () => {
    const m = buildMurkjawModel();
    m.setEmergence(0);
    expect(m.root.visible).toBe(false);
    m.setEmergence(1);
    expect(m.root.visible).toBe(true);
    const up = m.headWorld(new THREE.Vector3()).y;
    expect(up).toBeGreaterThan(2);
    m.setEmergence(0);
    m.setReach(1, 6);
    expect(m.root.visible).toBe(true);
    const head = m.headWorld(new THREE.Vector3());
    // Lunged: the head lies on the walkway 6 m ahead (yaw 0 faces -Z), just above the deck.
    expect(head.z).toBeCloseTo(-6, 0);
    expect(head.y).toBeGreaterThan(DECK);
    expect(head.y).toBeLessThan(DECK + LOOK.headRadius + 0.2);
    m.dispose();
  });

  it('faces a point (yaw 0 faces -Z), rolls, fades and ignores bad input', () => {
    const m = buildMurkjawModel();
    m.faceToward(5, 0);
    expect(m.root.rotation.y).toBeCloseTo(-Math.PI / 2);
    m.faceToward(NaN, 0);
    expect(m.root.rotation.y).toBeCloseTo(-Math.PI / 2);
    m.setEmergence(NaN);
    expect(m.root.visible).toBe(false);
    m.setRoll(1);
    expect((m.owner as THREE.Object3D).rotation.z).toBeCloseTo(Math.PI);
    m.setOpacity(0.5);
    const mats = new Set<THREE.Material>();
    m.root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (mat) mats.add(mat);
    });
    for (const mat of mats) expect(mat.opacity).toBe(0.5);
    m.update(0.5);
    m.update(NaN);
    m.dispose();
    m.dispose();
    expect(m.root.parent).toBeNull();
  });
});
