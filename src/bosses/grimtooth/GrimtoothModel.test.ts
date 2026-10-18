import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GRIMTOOTH_SCALE, HOUND } from '../../enemies/quadruped/params';
import { QUADRUPED_CLIPS, QuadrupedBody } from '../../enemies/quadruped/QuadrupedBody';
import { QuadrupedRig } from '../../enemies/quadruped/QuadrupedRig';
import { buildGrimtoothModel, GRIMTOOTH_CLIPS } from './GrimtoothModel';
import { LOOK } from './tuning';

const height = (o: THREE.Object3D): number => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).y;
};

describe('GrimtoothModel', () => {
  it('is the hound rig at 1.8x, taller than a scale-1 hound', () => {
    const m = buildGrimtoothModel();
    expect(m.body).toBeInstanceOf(QuadrupedBody);
    expect(m.body.params.scale).toBe(GRIMTOOTH_SCALE);
    expect(m.owner.scale.x).toBeCloseTo(1.8);
    const hound = new QuadrupedBody({ ...HOUND, scale: 1 });
    m.collar.visible = false; // the spikes are not part of the size comparison
    expect(height(m.root) / height(hound.root)).toBeCloseTo(1.8, 1);
    hound.dispose();
    m.dispose();
  });

  it('uses the boss tint and emissive', () => {
    const m = buildGrimtoothModel();
    expect(m.body.params.tint).toBe(LOOK.tint);
    expect(m.body.params.emissive).toBe(LOOK.emissive);
    m.dispose();
  });

  it('carries LOOK.spikeCount collar spikes under the collar socket', () => {
    const m = buildGrimtoothModel();
    expect(m.collar).toBeInstanceOf(THREE.InstancedMesh);
    expect(m.collar.name).toBe('grimtooth-collar');
    expect(m.collar.count).toBe(LOOK.spikeCount);
    expect(m.collar.parent).toBe(QuadrupedRig.sockets(m.owner).collar);
    let up: THREE.Object3D | null = m.collar;
    while (up && up !== m.root) up = up.parent;
    expect(up).toBe(m.root);
    const mat = m.collar.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(LOOK.spikeColor);
    expect(mat.emissive.getHex()).toBe(LOOK.spikeEmissive);
    m.dispose();
  });

  it('spikes point outward from the neck axis', () => {
    const m = buildGrimtoothModel();
    const q = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const apex = new THREE.Vector3();
    for (let i = 0; i < LOOK.spikeCount; i++) {
      m.collar.getMatrixAt(i, q);
      p.setFromMatrixPosition(q);
      apex.set(0, 1, 0).transformDirection(q);
      expect(p.z).toBeCloseTo(0);
      expect(apex.dot(p.clone().normalize())).toBeCloseTo(1);
    }
    m.dispose();
  });

  it('has head, torso and tail hurtboxes, with the rig as the owner', () => {
    const m = buildGrimtoothModel();
    expect(m.hurtboxes).toBe(m.body.hurtboxes);
    expect(m.owner).toBe(m.body.owner);
    expect(m.hurtboxes.owner).toBe(m.owner);
    expect(m.hurtboxes.missing).toEqual([]);
    for (const name of ['head', 'torso', 'tail']) {
      expect(m.hurtboxes.capsules.some((c) => c.name === name), name).toBe(true);
    }
    m.dispose();
  });

  it('wires no damage bus: the tracers never emit', () => {
    const m = buildGrimtoothModel();
    // The body keeps no bus of its own; its tracers were built without one.
    expect((m.body as any).bus).toBeUndefined();
    for (const t of Object.values(m.body.tracers)) expect((t as any).bus ?? (t as any).options?.bus).toBeUndefined();
    m.dispose();
  });

  it('maps friendly clip names to the quadruped clips and loops on request', () => {
    expect(Object.keys(GRIMTOOTH_CLIPS).sort()).toEqual(
      ['bite', 'crouch', 'flinch', 'headLower', 'howl', 'idle', 'knockdown', 'pounce', 'run', 'walk'].sort(),
    );
    for (const [k, v] of Object.entries(GRIMTOOTH_CLIPS)) expect(v).toBe((QUADRUPED_CLIPS as Record<string, string>)[k]);
    const warn = vi.fn();
    const m = buildGrimtoothModel(warn);
    m.play('walk', { loop: true });
    expect(m.body.currentClip).toBe('Walk');
    m.setSpeed(3);
    m.update(0.1);
    m.play('howl');
    expect(m.body.currentClip).toBe('Howl');
    m.play('crouch');
    expect(m.body.currentClip).toBe('Crouch');
    m.update(NaN);
    expect(warn).not.toHaveBeenCalled();
    m.dispose();
  });

  it('setTelegraph flares the tail emissive', () => {
    const m = buildGrimtoothModel();
    const tail = m.body.materials[3] as THREE.MeshStandardMaterial;
    const before = tail.emissive.getHex();
    m.setTelegraph(1);
    expect(tail.emissive.getHex()).not.toBe(before);
    m.setTelegraph(0);
    expect(tail.emissive.getHex()).toBe(before);
    m.dispose();
  });

  it('setCollarFlash lerps the spikes toward the flash colour and 0 restores them', () => {
    const m = buildGrimtoothModel();
    const mat = m.collar.material as THREE.MeshStandardMaterial;
    const rest = mat.emissiveIntensity;
    m.setCollarFlash(1);
    expect(mat.emissive.getHex()).toBe(LOOK.collarFlash);
    expect(mat.emissiveIntensity).toBeGreaterThan(rest);
    m.setCollarFlash(0.5);
    expect(mat.emissive.getHex()).not.toBe(LOOK.collarFlash);
    m.setCollarFlash(0);
    expect(mat.emissive.getHex()).toBe(LOOK.spikeEmissive);
    expect(mat.emissiveIntensity).toBe(rest);
    m.setCollarFlash(NaN);
    expect(mat.emissive.getHex()).toBe(LOOK.spikeEmissive);
    m.dispose();
  });

  it('setOpacity fades the body and the spikes', () => {
    const m = buildGrimtoothModel();
    const mat = m.collar.material as THREE.MeshStandardMaterial;
    m.setOpacity(0.4);
    expect(mat.opacity).toBeCloseTo(0.4);
    expect(mat.transparent).toBe(true);
    for (const b of m.body.materials) expect(b.opacity).toBeCloseTo(0.4);
    m.setOpacity(1);
    expect(mat.opacity).toBe(1);
    expect(mat.transparent).toBe(false);
    m.dispose();
  });

  it('dispose frees the spike geometry and material, detaches, and is idempotent', () => {
    const m = buildGrimtoothModel();
    const geoSpy = vi.spyOn(m.collar.geometry, 'dispose');
    const matSpy = vi.spyOn(m.collar.material as THREE.Material, 'dispose');
    const holder = new THREE.Group();
    holder.add(m.root);
    m.dispose();
    expect(geoSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
    expect(m.collar.parent).toBeNull();
    expect(m.root.parent).toBeNull();
    expect(() => m.dispose()).not.toThrow();
    expect(geoSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
    expect(() => m.setCollarFlash(1)).not.toThrow();
  });
});
