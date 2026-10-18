import { describe, expect, it } from 'vitest';
import { createFakeCore } from '../region/testing/fakeCore';
import { resolveLayout } from '../region/resolveLayout';
import { BANNER_COUNT, BRAZIER_COUNT, HARROWMARK_LAYOUT } from './harrowmark.layout';
import { A2_FLAG, buildWorldChange } from './worldChange';

function setup(flag?: boolean) {
  const fc = createFakeCore();
  for (const a of resolveLayout(HARROWMARK_LAYOUT, () => 20).anchors) fc.ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags });
  if (flag !== undefined) fc.flags.set(A2_FLAG, flag);
  return { fc, change: buildWorldChange(fc.ctx) };
}

describe('mini-ending world change', () => {
  it('builds nothing before story.gate.a2', () => {
    const { fc, change } = setup();
    expect(change.active).toBe(false);
    expect(change.counts()).toEqual({ banners: 0, braziers: 0 });
    expect(fc.scene.children).toHaveLength(0);
  });

  it('builds the banners and the lit brazier line when the flag turns true, and removes them when it clears', () => {
    const { fc, change } = setup();
    fc.ctx.state.setFlag(A2_FLAG, true);
    expect(change.active).toBe(true);
    expect(change.counts()).toEqual({ banners: BANNER_COUNT.bastion + BANNER_COUNT.keep, braziers: BRAZIER_COUNT });
    expect(fc.scene.children).toHaveLength(1);
    fc.ctx.state.setFlag(A2_FLAG, false);
    expect(change.active).toBe(false);
    expect(fc.scene.children).toHaveLength(0);
  });

  it('is built on init when the save already has the flag, and re-derives on load either way', () => {
    const { fc, change } = setup(true);
    expect(change.counts().braziers).toBe(BRAZIER_COUNT);
    fc.flags.set(A2_FLAG, false);
    fc.fire('save.loaded');
    expect(change.active).toBe(false);
    fc.flags.set(A2_FLAG, true);
    fc.fire('save.loaded');
    expect(change.counts().banners).toBe(10);
  });

  it('does not stack when the flag is set twice', () => {
    const { fc, change } = setup();
    fc.ctx.state.setFlag(A2_FLAG, true);
    fc.ctx.state.setFlag(A2_FLAG, true);
    expect(fc.scene.children).toHaveLength(1);
    expect(change.counts().braziers).toBe(BRAZIER_COUNT);
  });

  it('removes everything on dispose and ignores later flags', () => {
    const { fc, change } = setup(true);
    change.dispose();
    expect(fc.scene.children).toHaveLength(0);
    fc.ctx.state.setFlag(A2_FLAG, false);
    fc.ctx.state.setFlag(A2_FLAG, true);
    expect(fc.scene.children).toHaveLength(0);
  });

  it('puts banners at the building faces: 8 m up on the Bastion, 10 m up on the Keep', () => {
    const { fc } = setup();
    const bastion = fc.anchors.get('harrowmark.banner.bastion.1')!;
    const keep = fc.anchors.get('harrowmark.banner.keep.1')!;
    expect(bastion.position.y).toBe(28);
    expect(keep.position.y).toBe(30);
  });
});
