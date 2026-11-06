import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { NEAR_FADE_MIN_OPACITY, NearFade } from './nearFade';

const rig = () => {
  const shared = new THREE.MeshBasicMaterial();
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(), [shared, new THREE.MeshBasicMaterial()]);
  root.add(body, helm);
  return { root, body, helm, shared };
};

describe('NearFade', () => {
  it('leaves the meshes untouched at 0', () => {
    const { root, body, shared } = rig();
    new NearFade().apply(root, 0);
    expect(body.material).toBe(shared);
  });

  it('fades clones, never the shared material, and restores the originals at 0', () => {
    const { root, body, helm, shared } = rig();
    const fade = new NearFade();
    fade.apply(root, 1);
    expect(body.material).not.toBe(shared);
    expect((body.material as THREE.Material).opacity).toBeCloseTo(NEAR_FADE_MIN_OPACITY, 6);
    expect((body.material as THREE.Material).transparent).toBe(true);
    expect(shared.opacity).toBe(1);
    expect(Array.isArray(helm.material) && helm.material.every((m) => m.opacity === NEAR_FADE_MIN_OPACITY)).toBe(true);
    fade.apply(root, 0.5);
    expect((body.material as THREE.Material).opacity).toBeCloseTo(1 - (1 - NEAR_FADE_MIN_OPACITY) * 0.5, 6);
    fade.apply(root, 0);
    expect(body.material).toBe(shared);
    expect(Array.isArray(helm.material) && helm.material[0]).toBe(shared);
  });

  it('clamps out-of-range and non-finite fades', () => {
    const { root, body, shared } = rig();
    const fade = new NearFade();
    fade.apply(root, Number.NaN);
    expect(body.material).toBe(shared);
    fade.apply(root, 5);
    expect((body.material as THREE.Material).opacity).toBeCloseTo(NEAR_FADE_MIN_OPACITY, 6);
  });

  it('survives another system swapping a material while faded (the weapon tint): nothing stays translucent', () => {
    const { root, body, shared } = rig();
    const fade = new NearFade();
    fade.apply(root, 1);
    const ours = body.material as THREE.Material;
    // The tint saves what it finds (our clone) and puts its own clone on.
    const tint = ours.clone();
    tint.opacity = 1;
    tint.transparent = false;
    body.material = tint as THREE.MeshBasicMaterial;
    fade.apply(root, 1);
    // We noticed: our old clone is opaque again, and the tint's material now fades through a fresh clone.
    expect(ours.opacity).toBe(shared.opacity);
    expect(ours.transparent).toBe(shared.transparent);
    expect(body.material).not.toBe(tint);
    expect((body.material as THREE.Material).opacity).toBeCloseTo(NEAR_FADE_MIN_OPACITY, 6);
    fade.apply(root, 0);
    expect(body.material).toBe(tint);
    // The tint then restores what it saved: our first clone, which is opaque.
    body.material = ours as THREE.MeshBasicMaterial;
    expect(ours.opacity).toBe(1);
  });

  it('leaves a swapped material in place on restore, with our clone made opaque', () => {
    const { root, body, shared } = rig();
    const fade = new NearFade();
    fade.apply(root, 1);
    const ours = body.material as THREE.Material;
    const other = shared.clone();
    body.material = other as THREE.MeshBasicMaterial;
    fade.apply(root, 0);
    expect(body.material).toBe(other);
    expect(ours.opacity).toBe(shared.opacity);
  });
});
