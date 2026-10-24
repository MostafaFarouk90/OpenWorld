import { describe, expect, it } from 'vitest';
import { createFakeCore } from '../../region/testing/fakeCore';
import { LOWER_SEALED_DOOR, LOWER_SHORTCUT_GATE } from './lowerGalleries';
import { registerLowerGalleries } from './lowerRuntime';

function setup(provide = true) {
  const fc = createFakeCore();
  const closed = new Map<string, boolean>();
  const calls: string[] = [];
  if (provide) {
    fc.services.set('interiors', {
      setBlocker: (id: string, c: boolean) => {
        closed.set(id, c);
        calls.push(id);
        return true;
      },
    });
  }
  return { fc, closed, calls };
}

describe('the Lower Galleries blockers', () => {
  it('closes both at setup when neither flag is set', () => {
    const { fc, closed } = setup();
    registerLowerGalleries(fc.ctx);
    expect(closed.get(LOWER_SHORTCUT_GATE)).toBe(true);
    expect(closed.get(LOWER_SEALED_DOOR)).toBe(true);
  });

  it('opens the gate on world.bellows.shortcutOpen and the door on story.m19.doorOpen, independently, and closes again', () => {
    const { fc, closed } = setup();
    registerLowerGalleries(fc.ctx);
    fc.ctx.state.setFlag('world.bellows.shortcutOpen', true);
    expect([closed.get(LOWER_SHORTCUT_GATE), closed.get(LOWER_SEALED_DOOR)]).toEqual([false, true]);
    fc.ctx.state.setFlag('story.m19.doorOpen', true);
    expect([closed.get(LOWER_SHORTCUT_GATE), closed.get(LOWER_SEALED_DOOR)]).toEqual([false, false]);
    fc.ctx.state.setFlag('world.bellows.shortcutOpen', false);
    expect(closed.get(LOWER_SHORTCUT_GATE)).toBe(true);
  });

  it('starts open when the flags are already set (a load)', () => {
    const { fc, closed } = setup();
    fc.flags.set('story.m19.doorOpen', true);
    registerLowerGalleries(fc.ctx);
    expect(closed.get(LOWER_SEALED_DOOR)).toBe(false);
    expect(closed.get(LOWER_SHORTCUT_GATE)).toBe(true);
  });

  it('re-evaluates on save.loaded, which replaces the flags wholesale', () => {
    const { fc, closed } = setup();
    registerLowerGalleries(fc.ctx);
    fc.ctx.state.setFlag('story.m19.doorOpen', true);
    fc.flags.clear();
    fc.flags.set('world.bellows.shortcutOpen', true);
    fc.fire('save.loaded', { slot: 'a' });
    expect([closed.get(LOWER_SHORTCUT_GATE), closed.get(LOWER_SEALED_DOOR)]).toEqual([false, true]);
  });

  it('ignores unrelated flags and tolerates a missing interiors service until it arrives', () => {
    const { fc, calls } = setup();
    registerLowerGalleries(fc.ctx);
    const n = calls.length;
    fc.ctx.state.setFlag('story.other', true);
    expect(calls.length).toBe(n);
    const late = setup(false);
    expect(() => registerLowerGalleries(late.fc.ctx)).not.toThrow();
    const closed = new Map<string, boolean>();
    late.fc.services.set('interiors', { setBlocker: (id: string, c: boolean) => closed.set(id, c) && true });
    late.fc.fire('interior.entered', { interiorId: 'mine-lower-galleries', doorId: 'mine-lower-galleries' });
    expect(closed.get(LOWER_SEALED_DOOR)).toBe(true);
  });

  it('returns an undo that stops listening and leaves the blockers open', () => {
    const { fc, closed, calls } = setup();
    const off = registerLowerGalleries(fc.ctx);
    off();
    expect([closed.get(LOWER_SHORTCUT_GATE), closed.get(LOWER_SEALED_DOOR)]).toEqual([false, false]);
    const n = calls.length;
    fc.ctx.state.setFlag('story.m19.doorOpen', true);
    expect(calls.length).toBe(n);
  });
});
