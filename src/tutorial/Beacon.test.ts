import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { TutorialBeacon } from './Beacon';

const VP = { width: 1000, height: 600 };
function cam() {
  const c = new THREE.PerspectiveCamera(60, VP.width / VP.height, 0.1, 500);
  c.position.set(0, 1.7, 0);
  c.lookAt(0, 1.7, -10); // looking down -z; +x is right
  c.updateMatrixWorld();
  return c;
}
function fakeDoc() {
  const els: any[] = [];
  const doc: any = { createElement: () => { const e: any = { style: {}, className: '', textContent: '', setAttribute() {} }; els.push(e); return e; } };
  return { doc: doc as Document, els };
}
function make(opts: { heightAt?: (x: number, z: number) => number; noDom?: boolean } = {}) {
  const scene = new THREE.Scene();
  const { doc, els } = fakeDoc();
  const unmount = vi.fn();
  const mountOverlay = vi.fn(() => unmount);
  const b = new TutorialBeacon({ scene, doc: opts.noDom ? null : doc, mountOverlay: opts.noDom ? undefined : mountOverlay, heightAt: opts.heightAt });
  return { b, scene, els, unmount, mountOverlay, arrow: () => els[0] };
}
const far = { x: 0, y: 0, z: 0 };

describe('TutorialBeacon', () => {
  it('shows ring and pillar at the terrain height, hidden with null', () => {
    const { b, scene } = make({ heightAt: () => 7 });
    b.setTarget({ x: 20, y: 0, z: -30 });
    b.update(0.016, cam(), far, VP);
    expect(scene.children).toHaveLength(2);
    for (const m of scene.children) {
      expect(m.visible).toBe(true);
      expect(m.position.x).toBe(20);
      expect(m.position.z).toBe(-30);
      expect(m.position.y).toBeCloseTo(7.08);
    }
    b.setTarget(null);
    expect(scene.children.every((m) => !m.visible)).toBe(true);
  });
  it('uses target y without heightAt', () => {
    const { b, scene } = make();
    b.setTarget({ x: 1, y: 4, z: 1 });
    b.update(0.016, cam(), far, VP);
    expect(scene.children[0].position.y).toBeCloseTo(4.08);
  });
  it('fades near and returns far', () => {
    const { b, scene } = make();
    b.setTarget({ x: 0, y: 0, z: -10 });
    b.update(0.016, cam(), { x: 0, y: 0, z: -9 }, VP);
    expect(scene.children[0].visible).toBe(false);
    b.update(0.016, cam(), { x: 0, y: 0, z: -5 }, VP);
    expect(b.opacityFactor).toBeCloseTo(2 / 3, 2);
    expect(scene.children[0].visible).toBe(true);
    b.update(0.016, cam(), { x: 0, y: 0, z: 10 }, VP);
    expect(b.opacityFactor).toBe(1);
  });
  it('suppression reasons stack', () => {
    const { b, scene } = make();
    b.setTarget({ x: 0, y: 0, z: -30 });
    b.setSuppressed('cutscene', true);
    b.setSuppressed('modal', true);
    b.update(0.016, cam(), far, VP);
    expect(scene.children[0].visible).toBe(false);
    b.setSuppressed('cutscene', false);
    b.update(0.016, cam(), far, VP);
    expect(scene.children[0].visible).toBe(false);
    b.setSuppressed('modal', false);
    b.update(0.016, cam(), far, VP);
    expect(scene.children[0].visible).toBe(true);
  });
  it('arrow hidden on screen', () => {
    const { b, arrow } = make();
    b.setTarget({ x: 0, y: 1.7, z: -20 });
    b.update(0.016, cam(), far, VP);
    expect(arrow().style.display).toBe('none');
  });
  it('arrow at right, left and top edges', () => {
    const { b, arrow } = make();
    b.setTarget({ x: 60, y: 1.7, z: -20 });
    b.update(0.016, cam(), far, VP);
    expect(arrow().style.display).toBe('block');
    expect(parseInt(arrow().style.left)).toBeGreaterThan(VP.width - 60);
    b.setTarget({ x: -60, y: 1.7, z: -20 });
    b.update(0.016, cam(), far, VP);
    expect(parseInt(arrow().style.left)).toBeLessThan(60);
    b.setTarget({ x: 0, y: 80, z: -20 });
    b.update(0.016, cam(), far, VP);
    expect(parseInt(arrow().style.top)).toBeLessThan(60);
  });
  it('target behind the camera points the correct way', () => {
    const { b, arrow } = make();
    b.setTarget({ x: 10, y: 1.7, z: 30 });
    b.update(0.016, cam(), far, VP);
    expect(arrow().style.display).toBe('block');
    expect(parseInt(arrow().style.left)).toBeGreaterThan(VP.width / 2);
    b.setTarget({ x: -10, y: 1.7, z: 30 });
    b.update(0.016, cam(), far, VP);
    expect(parseInt(arrow().style.left)).toBeLessThan(VP.width / 2);
  });
  it('behind a pitched third-person camera the arrow still keeps the target side', () => {
    const { b, arrow } = make();
    const c = new THREE.PerspectiveCamera(60, VP.width / VP.height, 0.1, 500);
    c.position.set(0, 4, 5);
    c.lookAt(0, 0, -5); // pitched down about 22 degrees, as the follow camera sits
    c.updateMatrixWorld();
    b.setTarget({ x: 12, y: 0, z: 40 });
    b.update(0.016, c, far, VP);
    expect(arrow().style.display).toBe('block');
    expect(parseInt(arrow().style.left)).toBeGreaterThan(VP.width / 2);
    b.setTarget({ x: -12, y: 0, z: 40 });
    b.update(0.016, c, far, VP);
    expect(parseInt(arrow().style.left)).toBeLessThan(VP.width / 2);
  });
  it('no arrow while the player stands on the target (review m3: the T04 kneel spot)', () => {
    const { b, arrow } = make();
    b.setTarget({ x: 0, y: 0, z: 1 }); // below the view, but the player is on it
    b.update(0.016, cam(), { x: 0, y: 0, z: 0.5 }, VP);
    expect(arrow().style.display).toBe('none');
  });
  it('arrow hidden while suppressed or without target', () => {
    const { b, arrow } = make();
    b.setTarget({ x: 60, y: 1.7, z: -20 });
    b.update(0.016, cam(), far, VP);
    b.setSuppressed('modal', true);
    expect(arrow().style.display).toBe('none');
    b.setSuppressed('modal', false);
    b.update(0.016, cam(), far, VP);
    expect(arrow().style.display).toBe('block');
    b.setTarget(null);
    expect(arrow().style.display).toBe('none');
  });
  it('works headless', () => {
    const { b, scene } = make({ noDom: true });
    b.setTarget({ x: 60, y: 1, z: -20 });
    expect(() => b.update(0.016, cam(), far, VP)).not.toThrow();
    expect(scene.children[0].visible).toBe(true);
    expect(() => b.update(0.016, null, null, VP)).not.toThrow();
    b.dispose();
  });
  it('dispose removes everything, is idempotent, setTarget after is a no-op', () => {
    const { b, scene, unmount } = make();
    b.setTarget({ x: 1, y: 0, z: 1 });
    b.dispose();
    b.dispose();
    expect(scene.children).toHaveLength(0);
    expect(unmount).toHaveBeenCalledTimes(1);
    b.setTarget({ x: 2, y: 0, z: 2 });
    b.update(0.016, cam(), far, VP);
    expect(scene.children).toHaveLength(0);
  });
});
