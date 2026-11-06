// Act 4 thread L1 (plans/act4-L1.md section 9, playthrough L1): the containment toast spam at the Fen Road's corner by
// the Ashen Waste. The reproduction walks the real containment with a player leaning on the corridor's edge.
import { describe, expect, it } from 'vitest';
import type { Containment } from './containment';
import { CONTAINMENT_EPISODE_QUIET_SECONDS, CONTAINMENT_TOAST_KEY, installContainment } from './containmentSystem';
import { createFakeCore } from './testing/fakeCore';

const ACT3 = { 'story.gate.a2': true, 'story.d03.complete': true, 'story.gate.a3': true };

function rig(flags: Record<string, boolean> = ACT3) {
  const fc = createFakeCore();
  for (const [k, v] of Object.entries(flags)) fc.flags.set(k, v);
  installContainment(fc.ctx, () => 0);
  const c = fc.services.get('containment') as Containment;
  const toasts = () => fc.emitted.filter((e) => e.type === 'hud.toast' && (e.payload as { textKey: string }).textKey === CONTAINMENT_TOAST_KEY).length;
  /** One tick: the player moves by (dx, dz), containment runs, a push moves the feet. */
  const step = (dx: number, dz: number) => {
    fc.playerFeet.x += dx;
    fc.playerFeet.z += dz;
    const before = fc.teleports.length;
    fc.tick('intent');
    if (fc.teleports.length > before) Object.assign(fc.playerFeet, fc.teleports[fc.teleports.length - 1].feet);
    return fc.teleports.length > before;
  };
  return { fc, c, toasts, step };
}

describe('the containment toast (playthrough L1)', () => {
  it('reproduction: 90 s leaning north-east off the Fen Road at the Waste corner pushes hundreds of times, toasts once and ends open', () => {
    const { fc, c, toasts, step } = rig();
    Object.assign(fc.playerFeet, { x: 7000, y: 0, z: 4420 });
    expect(c.isOpen(7000, 4420)).toBe(true);
    const v = 4.5 / 60;
    let pushes = 0;
    for (let t = 0; t < 60 * 90; t++) if (step(v * Math.sin(Math.PI / 9), v * Math.cos(Math.PI / 9))) pushes++;
    // The old 8 s throttle let 11 toasts through this walk.
    expect(pushes).toBeGreaterThan(300);
    expect(toasts()).toBe(1);
    expect(c.isOpen(fc.playerFeet.x, fc.playerFeet.z)).toBe(true);
  });

  it('a new episode toasts again once the player has been open and unpushed for the quiet time, not before', () => {
    // Act 1: east of Harrowmark is closed.
    const { fc, toasts, step } = rig({});
    Object.assign(fc.playerFeet, { x: 20000, y: 0, z: 3000 });
    step(0, 0);
    expect(toasts()).toBe(1);
    // Open for just under the quiet time, then out again: the same episode.
    for (let t = 0; t < 60 * CONTAINMENT_EPISODE_QUIET_SECONDS - 2; t++) step(0, 0);
    Object.assign(fc.playerFeet, { x: 20000, y: 0, z: 3000 });
    step(0, 0);
    expect(toasts()).toBe(1);
    // Open for the whole quiet time: the next push starts a new episode.
    for (let t = 0; t < 60 * CONTAINMENT_EPISODE_QUIET_SECONDS + 1; t++) step(0, 0);
    Object.assign(fc.playerFeet, { x: 20000, y: 0, z: 3000 });
    step(0, 0);
    expect(toasts()).toBe(2);
  });
});
