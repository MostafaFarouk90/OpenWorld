import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ActorMaterials, getFx } from './ActorMaterials';
import { TelegraphFx } from './Telegraph';

function setup() {
  const scene = new THREE.Scene();
  const shared = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  body.name = 'Body';
  const arm = new THREE.Group();
  arm.name = 'Arm_Right';
  const hand = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  hand.name = 'handR';
  arm.add(hand);
  const sword = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  sword.userData.telegraph = 'weapon';
  root.add(body, arm, sword);
  scene.add(root);
  const am = new ActorMaterials();
  const tg = new TelegraphFx(am);
  const val = (m: THREE.Mesh) => getFx(m.material as THREE.MeshStandardMaterial)!.uTelegraph.value;
  return { scene, root, body, hand, sword, am, tg, val };
}

describe('TelegraphFx', () => {
  it('ramps, yellow for block, red for dodge, expires', () => {
    const s = setup();
    expect(s.tg.flash(s.root, 'block', 0.5, 10)).toBe(true);
    const col = getFx(s.body.material as THREE.MeshStandardMaterial)!.uTelegraphColor.value;
    expect(col.getHex()).toBe(0xffd23a);
    s.tg.update(10.25);
    expect(s.val(s.body)).toBeCloseTo(0.5);
    s.tg.update(10.5);
    expect(s.val(s.body)).toBeCloseTo(1);
    s.tg.update(10.55);
    expect(s.val(s.body)).toBeCloseTo(0.5);
    s.tg.update(10.61);
    expect(s.val(s.body)).toBe(0);
    s.tg.flash(s.root, 'dodge', 0.5, 20);
    expect(col.getHex()).toBe(0xff2a1a);
  });

  it('repeat flash restarts and replaces colour without stacking', () => {
    const s = setup();
    s.tg.flash(s.root, 'block', 0.5, 0);
    s.tg.update(0.4);
    expect(s.tg.flash(s.root, 'dodge', 0.5, 0.4)).toBe(true);
    s.tg.update(0.4);
    expect(s.val(s.body)).toBe(0);
    s.tg.update(0.65);
    expect(s.val(s.body)).toBeCloseTo(0.5);
    expect(getFx(s.body.material as THREE.MeshStandardMaterial)!.uTelegraphColor.value.getHex()).toBe(0xff2a1a);
    expect(s.am.get(s.root)).toHaveLength(3);
  });

  it('rejects bad input', () => {
    const s = setup();
    expect(s.tg.flash(null, 'block', 0.5, 0)).toBe(false);
    expect(s.tg.flash(undefined, 'block', 0.5, 0)).toBe(false);
    expect(s.tg.flash(new THREE.Group(), 'block', 0.5, 0)).toBe(false);
    expect(s.tg.flash(s.root, 'block', NaN, 0)).toBe(false);
    expect(s.tg.flash(s.root, 'block', 0, 0)).toBe(false);
    expect(s.tg.flash(s.root, 'block', -1, 0)).toBe(false);
    expect(s.am.has(s.root)).toBe(false);
  });

  it('parts filter touches only matching meshes (name, ancestor, tag)', () => {
    const s = setup();
    expect(s.tg.flash(s.root, 'block', 0.5, 0, { parts: ['HAND'] })).toBe(true);
    s.tg.update(0.25);
    expect(s.val(s.hand)).toBeGreaterThan(0);
    expect(s.val(s.body)).toBe(0);
    expect(s.val(s.sword)).toBe(0);
    s.tg.flash(s.root, 'block', 0.5, 1, { parts: ['weapon', 'arm_'] });
    s.tg.update(1.25);
    expect(s.val(s.sword)).toBeGreaterThan(0);
    expect(s.val(s.hand)).toBeGreaterThan(0);
    expect(s.val(s.body)).toBe(0);
    expect(s.tg.flash(s.root, 'block', 0.5, 2, { parts: ['visor'] })).toBe(false);
  });

  it('drops a root removed from the scene', () => {
    const s = setup();
    s.tg.flash(s.root, 'block', 0.5, 0);
    s.tg.update(0.25);
    expect(s.val(s.body)).toBeGreaterThan(0);
    s.scene.remove(s.root);
    s.tg.update(0.3);
    expect(s.val(s.body)).toBe(0);
    s.scene.add(s.root);
    s.tg.update(0.35);
    expect(s.val(s.body)).toBe(0);
  });

  it('cancel and dispose zero the uniform', () => {
    const s = setup();
    s.tg.flash(s.root, 'block', 1, 0);
    s.tg.update(0.5);
    s.tg.cancel(s.root);
    expect(s.val(s.body)).toBe(0);
    s.tg.update(0.6);
    expect(s.val(s.body)).toBe(0);
    s.tg.flash(s.root, 'block', 1, 0);
    s.tg.update(0.5);
    s.tg.dispose();
    expect(s.val(s.body)).toBe(0);
  });

  it('clamps lead to 0.1..1.5', () => {
    const s = setup();
    s.tg.flash(s.root, 'block', 9, 0);
    s.tg.update(0.75);
    expect(s.val(s.body)).toBeCloseTo(0.5);
  });
});
