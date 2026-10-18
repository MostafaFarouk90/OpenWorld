import { describe, expect, it } from 'vitest';
import { StubDocument } from './dom';
import { LockOnMarker, lockOnPlacement } from './LockOnMarker';

const vp = { width: 1000, height: 600 };

describe('lockOnPlacement', () => {
  it('null target hides', () => expect(lockOnPlacement(null, vp)).toBeNull());
  it('behind the camera hides', () => expect(lockOnPlacement({ x: 500, y: 300, behind: true }, vp)).toBeNull());
  it('on-screen is placed as is', () => {
    expect(lockOnPlacement({ x: 500, y: 300, behind: false }, vp)).toEqual({ x: 500, y: 300, offscreen: false, rotation: 0 });
    expect(lockOnPlacement({ x: 0, y: 600, behind: false }, vp)!.offscreen).toBe(false);
  });
  it('off-screen clamps to the edge with rotation', () => {
    const right = lockOnPlacement({ x: 2000, y: 300, behind: false }, vp)!;
    expect(right).toMatchObject({ x: 976, y: 300, offscreen: true, rotation: 0 });
    const left = lockOnPlacement({ x: -50, y: 300, behind: false }, vp)!;
    expect(left).toMatchObject({ x: 24, offscreen: true });
    expect(Math.abs(left.rotation)).toBe(180);
    const down = lockOnPlacement({ x: 500, y: 900, behind: false }, vp)!;
    expect(down).toMatchObject({ y: 576, rotation: 90 });
    const up = lockOnPlacement({ x: 500, y: -10, behind: false }, vp)!;
    expect(up).toMatchObject({ y: 24, rotation: -90 });
  });
  it('rejects NaN and empty viewports', () => {
    expect(lockOnPlacement({ x: NaN, y: 1, behind: false }, vp)).toBeNull();
    expect(lockOnPlacement({ x: 1, y: 1, behind: false }, { width: 0, height: 0 })).toBeNull();
  });
});

describe('LockOnMarker', () => {
  it('shows, hides and arrows', () => {
    let t: { x: number; y: number; behind: boolean } | null = null;
    const m = new LockOnMarker(new StubDocument(), { targetScreen: () => t, viewport: () => vp });
    const marker = m.element.children[0]!;
    expect(marker.style.display).toBe('none');
    t = { x: 100, y: 200, behind: false };
    m.update();
    expect(marker.style.display).toBe('block');
    expect(marker.style.left).toBe('100px');
    expect(marker.className).toBe('owg-lockon');
    t = { x: 5000, y: 200, behind: false };
    m.update();
    expect(marker.className).toContain('owg-lockon-arrow');
    expect(marker.style.transform).toContain('rotate(');
    t = { x: 100, y: 200, behind: true };
    m.update();
    expect(marker.style.display).toBe('none');
  });
  it('dispose removes the element', () => {
    const m = new LockOnMarker(new StubDocument(), { targetScreen: () => null, viewport: () => vp });
    const root = new StubDocument().createElement('div');
    root.append(m.element);
    m.dispose();
    expect(root.children).toHaveLength(0);
  });
});
