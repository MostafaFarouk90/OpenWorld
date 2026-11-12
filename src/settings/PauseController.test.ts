import { describe, expect, it, vi } from 'vitest';
import { PauseController, TAP_MS } from './PauseController';

function make(o: { canOpen?: boolean; beat?: boolean; refuse?: boolean } = {}) {
  const state = { canOpen: o.canOpen ?? true, beat: o.beat ?? false, now: 0, paused: false };
  const menuBack = vi.fn();
  const closeMenu = vi.fn();
  const openMenu = vi.fn(() => (o.refuse ? null : { menu: { page: 'main', capturing: null, back: menuBack }, close: closeMenu }));
  const c = new PauseController({
    canOpen: () => state.canOpen,
    beatActive: () => state.beat,
    setPaused: (on) => void (state.paused = on),
    now: () => state.now,
    openMenu,
  });
  return { c, state, openMenu, menuBack, closeMenu };
}

describe('PauseController', () => {
  it('Esc in play opens the menu and pauses; Esc again steps back through the menu', () => {
    const f = make();
    f.c.onEscDown();
    expect(f.c.isOpen).toBe(true);
    expect(f.state.paused).toBe(true);
    f.c.onEscDown();
    expect(f.menuBack).toHaveBeenCalledTimes(1);
    f.c.close();
    expect(f.c.isOpen).toBe(false);
    expect(f.state.paused).toBe(false);
    expect(f.closeMenu).toHaveBeenCalledTimes(1);
  });

  it('does not open while another screen, a cutscene or dialogue is up, or when the HUD refuses', () => {
    const f = make({ canOpen: false });
    f.c.onEscDown();
    f.c.onPointerLockLost();
    f.c.onMenuAction(true, true);
    expect(f.openMenu).not.toHaveBeenCalled();
    const g = make({ refuse: true });
    expect(g.c.open()).toBe(false);
    expect(g.state.paused).toBe(false);
  });

  it('in a tutorial beat Esc is the hold-to-skip: a short tap opens on release, a hold does not', () => {
    const f = make({ beat: true });
    f.c.onEscDown();
    expect(f.c.isOpen).toBe(false);
    f.state.now = TAP_MS + 1200;
    f.c.onEscUp();
    expect(f.c.isOpen).toBe(false);
    f.c.onEscDown();
    f.state.now += 120;
    f.c.onEscUp();
    expect(f.c.isOpen).toBe(true);
  });

  it('losing the pointer lock in play opens it (Chrome swallows that Esc), but not during a beat', () => {
    const f = make();
    f.c.onPointerLockLost();
    expect(f.c.isOpen).toBe(true);
    const g = make({ beat: true });
    g.c.onPointerLockLost();
    expect(g.c.isOpen).toBe(false);
  });

  it('the menu action opens it once, and a press still latched after a close is ignored until released', () => {
    const f = make();
    f.c.onMenuAction(true, true);
    expect(f.c.isOpen).toBe(true);
    f.c.close();
    f.c.onMenuAction(true, true);
    expect(f.c.isOpen).toBe(false);
    f.c.onMenuAction(false, false);
    f.c.onMenuAction(true, true);
    expect(f.c.isOpen).toBe(true);
  });

  it('the press that closed another screen (the map) does not open the menu in the same tick', () => {
    const f = make();
    f.c.noteModalClosed();
    f.c.onMenuAction(true, true);
    expect(f.c.isOpen).toBe(false);
  });

  it('close and back are safe when nothing is open', () => {
    const f = make();
    f.c.close();
    f.c.back();
    expect(f.state.paused).toBe(false);
  });
});
