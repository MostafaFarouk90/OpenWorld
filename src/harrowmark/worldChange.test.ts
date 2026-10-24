import { describe, expect, it } from 'vitest';
import { createFakeCore } from '../region/testing/fakeCore';
import { resolveLayout } from '../region/resolveLayout';
import { BANNER_COUNT, BRAZIER_COUNT, HARROWMARK_LAYOUT } from './harrowmark.layout';
import { A2_FLAG, A3_FLAG, buildWorldChange, FOUNTAIN, STALL_PREFIX } from './worldChange';

/** The scene's world-change groups, leaving out the closed-stall shutters (tested on their own below). */
const changeRoots = (fc: { scene: { children: { name: string }[] } }) => fc.scene.children.filter((c) => c.name !== 'harrowmark-closed-stalls');

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
    expect(changeRoots(fc)).toHaveLength(0);
  });

  it('builds the banners and the lit brazier line when the flag turns true, and removes them when it clears', () => {
    const { fc, change } = setup();
    fc.ctx.state.setFlag(A2_FLAG, true);
    expect(change.active).toBe(true);
    expect(change.counts()).toEqual({ banners: BANNER_COUNT.bastion + BANNER_COUNT.keep, braziers: BRAZIER_COUNT });
    expect(changeRoots(fc)).toHaveLength(1);
    fc.ctx.state.setFlag(A2_FLAG, false);
    expect(change.active).toBe(false);
    expect(changeRoots(fc)).toHaveLength(0);
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
    expect(changeRoots(fc)).toHaveLength(1);
    expect(change.counts().braziers).toBe(BRAZIER_COUNT);
  });

  it('removes everything on dispose and ignores later flags', () => {
    const { fc, change } = setup(true);
    change.dispose();
    expect(changeRoots(fc)).toHaveLength(0);
    fc.ctx.state.setFlag(A2_FLAG, false);
    fc.ctx.state.setFlag(A2_FLAG, true);
    expect(changeRoots(fc)).toHaveLength(0);
  });

  it('puts banners at the building faces: 8 m up on the Bastion, 10 m up on the Keep', () => {
    const { fc } = setup();
    const bastion = fc.anchors.get('harrowmark.banner.bastion.1')!;
    const keep = fc.anchors.get('harrowmark.banner.keep.1')!;
    expect(bastion.position.y).toBe(28);
    expect(keep.position.y).toBe(30);
  });
});

describe('Act 2 world change (the Houses Stand)', () => {
  const stallCount = HARROWMARK_LAYOUT.structures.filter((st) => st.id.startsWith(STALL_PREFIX)).length;

  it('builds nothing before story.gate.a3, even with gate.a2 set', () => {
    const { fc, change } = setup(true);
    expect(change.act2.active).toBe(false);
    expect(change.act2.counts()).toEqual({ fountainJets: 0, stalls: 0 });
    expect(changeRoots(fc)).toHaveLength(1); // only Act 1's group
  });

  it('runs the fountain and opens every market stall when gate.a3 turns true, and clears when it goes', () => {
    const { fc, change } = setup(true);
    fc.ctx.state.setFlag(A3_FLAG, true);
    expect(change.act2.active).toBe(true);
    expect(stallCount).toBe(8);
    expect(change.act2.counts()).toEqual({ fountainJets: FOUNTAIN.jets, stalls: stallCount });
    expect(changeRoots(fc)).toHaveLength(2);
    fc.ctx.state.setFlag(A3_FLAG, false);
    expect(change.act2.active).toBe(false);
    expect(changeRoots(fc)).toHaveLength(1);
  });

  it('sits the stalls on the layout positions and the fountain on its basin', () => {
    const { fc } = setup();
    fc.ctx.state.setFlag(A3_FLAG, true);
    const root = fc.scene.children.find((c) => c.name === 'harrowmark-world-change-a3')!;
    const fountain = root.children[0];
    expect([fountain.position.x, fountain.position.z]).toEqual([FOUNTAIN.x, FOUNTAIN.z]);
    const stalls = HARROWMARK_LAYOUT.structures.filter((st) => st.id.startsWith(STALL_PREFIX));
    for (const st of stalls) expect(root.children.some((c) => c.position.x === st.x && c.position.z === st.z), st.id).toBe(true);
  });

  it('is rebuilt on init when the save has the flag, re-derives on load either way, and does not stack', () => {
    const fc = createFakeCore();
    for (const a of resolveLayout(HARROWMARK_LAYOUT, () => 20).anchors) fc.ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags });
    fc.flags.set(A3_FLAG, true);
    const change = buildWorldChange(fc.ctx);
    expect(change.act2.counts().stalls).toBe(stallCount);
    fc.ctx.state.setFlag(A3_FLAG, true);
    expect(fc.scene.children.filter((c) => c.name === 'harrowmark-world-change-a3')).toHaveLength(1);
    fc.flags.set(A3_FLAG, false);
    fc.fire('save.loaded');
    expect(change.act2.active).toBe(false);
    fc.flags.set(A3_FLAG, true);
    fc.fire('save.loaded');
    expect(change.act2.active).toBe(true);
    change.dispose();
    expect(changeRoots(fc)).toHaveLength(0);
  });

  it('leaves Act 1\'s banners and braziers alone', () => {
    const { fc, change } = setup(true);
    const before = change.counts();
    fc.ctx.state.setFlag(A3_FLAG, true);
    expect(change.counts()).toEqual(before);
  });
});

describe('closed market stalls (A16 final review #5)', () => {
  const stallCount = HARROWMARK_LAYOUT.structures.filter((st) => st.id.startsWith(STALL_PREFIX)).length;
  const closedRoots = (fc: ReturnType<typeof setup>['fc']) => fc.scene.children.filter((c) => c.name === 'harrowmark-closed-stalls');

  it('shows no shutters before Act 2', () => {
    const { fc, change } = setup();
    expect(change.closedStalls.counts().stalls).toBe(0);
    expect(closedRoots(fc)).toHaveLength(0);
  });

  it('puts each shutter in front of the stall table art (review F5)', () => {
    const { fc } = setup(true);
    const root = closedRoots(fc)[0]!;
    expect(root.children.length).toBe(stallCount);
    // The table's centre is at depth * 0.2 and its half-depth is 1.031 m (the glb's x bound, turned a quarter turn): the plane
    // must clear the front edge, not just the centre.
    const stalls = HARROWMARK_LAYOUT.structures.filter((st) => st.id.startsWith(STALL_PREFIX));
    const front = stalls[0]!.footprint[1] * 0.2 + 1.031;
    expect(front).toBeCloseTo(1.631, 2);
    for (const g of root.children) for (const m of g.children) expect(m.position.z).toBeGreaterThan(front);
  });

  it('shuts every stall from gate.a2 and opens them (shutters gone, awnings up) on gate.a3', () => {
    const { fc, change } = setup(true);
    expect(change.closedStalls.counts().stalls).toBe(stallCount);
    expect(closedRoots(fc)).toHaveLength(1);
    expect(change.act2.counts().stalls).toBe(0);
    fc.ctx.state.setFlag(A3_FLAG, true);
    expect(change.closedStalls.active).toBe(false);
    expect(closedRoots(fc)).toHaveLength(0);
    expect(change.act2.counts().stalls).toBe(stallCount);
  });

  it('re-derives on a load either way and does not stack', () => {
    const { fc, change } = setup(true);
    fc.fire('save.loaded');
    expect(closedRoots(fc)).toHaveLength(1);
    fc.flags.set(A2_FLAG, false);
    fc.fire('save.loaded');
    expect(change.closedStalls.active).toBe(false);
    expect(closedRoots(fc)).toHaveLength(0);
  });

  it('is built on init for a save that has a2 and not a3, and disposed cleanly', () => {
    const fc = createFakeCore();
    for (const a of resolveLayout(HARROWMARK_LAYOUT, () => 20).anchors) fc.ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags });
    fc.flags.set(A2_FLAG, true);
    const change = buildWorldChange(fc.ctx);
    expect(change.closedStalls.counts().stalls).toBe(stallCount);
    change.dispose();
    expect(closedRoots(fc)).toHaveLength(0);
  });
});

