// N3 heat haze: off on Low (no copy, cards hidden), on for Medium and High, a live switch; the copy texture matches a
// half-float target and the default framebuffer and is re-made on resize; one copy a frame; the 24-card cap; untrack.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HAZE_FLAG, HAZE_MAX_CARDS } from '../caldera/lava';
import { HeatHaze, hazeOnFor, type HazeRenderer } from './heatHaze';

function fakeRenderer(target: { width: number; height: number; type: THREE.TextureDataType } | null, buffer = { x: 800, y: 600 }) {
  const copies: THREE.Texture[] = [];
  const r: HazeRenderer = {
    getRenderTarget: () => (target ? { width: target.width, height: target.height, texture: { type: target.type, format: THREE.RGBAFormat } } : null),
    getDrawingBufferSize: (v) => v.set(buffer.x, buffer.y),
    copyFramebufferToTexture: vi.fn((t: THREE.Texture) => {
      copies.push(t);
    }),
  };
  return { r, copies };
}

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  c.position.set(0, 2, 10);
  c.lookAt(0, 2, 0);
  c.updateMatrixWorld();
  return c;
}

function scene(haze: HeatHaze, n: number, z0 = 0): { root: THREE.Group; cards: THREE.Mesh[] } {
  const root = new THREE.Group();
  const cards: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 2));
    m.position.set((i % 5) - 2, 1, z0 - i);
    m.userData[HAZE_FLAG] = true;
    root.add(m);
    cards.push(m);
  }
  const s = new THREE.Scene();
  s.add(root);
  haze.track(root);
  return { root, cards };
}

describe('HeatHaze', () => {
  it('tiers: Low off, Medium and High on', () => {
    expect(hazeOnFor('low')).toBe(false);
    expect(hazeOnFor('medium')).toBe(true);
    expect(hazeOnFor('high')).toBe(true);
  });

  it('on Low: no copy and every card hidden; switching to Medium live turns it on', () => {
    const haze = new HeatHaze('low');
    const { cards } = scene(haze, 3);
    const cam = camera();
    const { r, copies } = fakeRenderer(null);
    haze.update(cam, 0);
    expect(cards.every((c) => !c.visible)).toBe(true);
    haze.beforeCard(r, cam);
    expect(copies.length).toBe(0);
    haze.setStep('medium');
    haze.update(cam, 0.1);
    expect(cards.every((c) => c.visible)).toBe(true);
    haze.beforeCard(r, cam);
    expect(copies.length).toBe(1);
    haze.setStep('low');
    expect(cards.every((c) => !c.visible)).toBe(true);
  });

  it('the copy matches a half-float bloom target, then the default framebuffer, and is re-made on resize', () => {
    const haze = new HeatHaze('medium');
    scene(haze, 1);
    const cam = camera();
    const half = fakeRenderer({ width: 640, height: 360, type: THREE.HalfFloatType });
    haze.update(cam, 0);
    haze.beforeCard(half.r, cam);
    expect(half.copies[0]!.type).toBe(THREE.HalfFloatType);
    expect(haze.stats().textureType).toBe(THREE.HalfFloatType);
    const first = half.copies[0]!;
    const def = fakeRenderer(null, { x: 1280, y: 720 });
    haze.update(cam, 0.1);
    haze.beforeCard(def.r, cam);
    expect(def.copies[0]!.type).toBe(THREE.UnsignedByteType);
    expect(def.copies[0]).not.toBe(first);
    expect((def.copies[0]!.image as { width: number }).width).toBe(1280);
    // the same size and type again: the texture is kept
    haze.update(cam, 0.2);
    haze.beforeCard(def.r, cam);
    expect(def.copies[1]).toBe(def.copies[0]);
  });

  it('copies once a frame however many cards draw, and not for another camera', () => {
    const haze = new HeatHaze('high');
    scene(haze, 5);
    const cam = camera();
    const { r, copies } = fakeRenderer(null);
    haze.update(cam, 0);
    for (let i = 0; i < 5; i++) haze.beforeCard(r, cam);
    expect(copies.length).toBe(1);
    haze.update(cam, 0.1);
    haze.beforeCard(r, new THREE.PerspectiveCamera());
    expect(copies.length).toBe(1);
    haze.beforeCard(r, cam);
    expect(copies.length).toBe(2);
    expect(haze.stats()).toMatchObject({ copies: 2, frame: 2, enabled: true });
  });

  it(`draws at most ${HAZE_MAX_CARDS} cards, the nearest in view; cards behind the camera are hidden`, () => {
    const haze = new HeatHaze('medium');
    const { cards } = scene(haze, 40);
    const behind = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    behind.position.set(0, 2, 40);
    behind.userData[HAZE_FLAG] = true;
    cards[0]!.parent!.add(behind);
    haze.track(behind);
    haze.update(camera(), 0);
    const shown = cards.filter((c) => c.visible);
    expect(shown.length).toBe(HAZE_MAX_CARDS);
    expect(shown).toEqual(cards.slice(0, HAZE_MAX_CARDS)); // nearest first (z falls away from the camera)
    expect(behind.visible).toBe(false);
    expect(haze.stats()).toMatchObject({ tracked: 41, drawn: HAZE_MAX_CARDS });
  });

  it('untrack gives the mesh its material back; a card without a parent is not drawn; headless update is a no-op', () => {
    const haze = new HeatHaze('medium');
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.userData[HAZE_FLAG] = true;
    root.add(m);
    const undo = haze.track(root);
    expect(m.material).toBe(haze.material);
    undo();
    expect(m.material).toBe(mat);
    const loose = haze.card(new THREE.PlaneGeometry(1, 1));
    haze.update(camera(), 0);
    expect(loose.visible).toBe(false);
    haze.update(null, 0);
    expect(haze.stats().drawn).toBe(0);
    haze.dispose();
    haze.update(camera(), 0);
  });
});
