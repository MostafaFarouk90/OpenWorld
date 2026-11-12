import { describe, expect, it, vi } from 'vitest';
import { StubDocument, textOf, type ElementLike } from '../hud/dom';
import { InputBindings } from '../input/InputBindings';
import { PauseMenu, type PauseItem, type QualityChoice } from './PauseMenu';
import { SettingsStore } from './SettingsStore';
import { SETTINGS_STRINGS_EN } from './strings.en';

const t = (k: string, p?: Record<string, string | number>) => {
  const s = SETTINGS_STRINGS_EN[k];
  if (s === undefined) return `[[${k}]]`;
  return s.replace(/\{(\w+)\}/g, (_, n) => String(p?.[n] ?? `{${n}}`));
};

function find(el: ElementLike, id: string): ElementLike | null {
  if (el.getAttribute('data-id') === id) return el;
  for (const c of el.children) {
    const f = find(c, id);
    if (f) return f;
  }
  return null;
}
const click = (m: PauseMenu, id: string) => {
  const b = find(m.element, id);
  if (!b) throw new Error(`no button ${id}`);
  b.onclick?.();
};

function make(o: { canSave?: boolean; items?: PauseItem[]; quality?: boolean } = {}) {
  const settings = new SettingsStore(null);
  const bindings = new InputBindings(null, () => {});
  let quality: QualityChoice = 'medium';
  let hints = false;
  let captured: ((b: import('../input/actions').Binding) => void) | null = null;
  const cancels: Array<ReturnType<typeof vi.fn>> = [];
  const ports = {
    t,
    settings,
    quality: o.quality === false ? null : { get: () => quality, set: (c: QualityChoice) => void (quality = c) },
    hints: { get: () => hints, set: (on: boolean) => void (hints = on) },
    bindings,
    listen: vi.fn((cb: (b: import('../input/actions').Binding) => void) => {
      captured = cb;
      const c = vi.fn(() => void (captured = null));
      cancels.push(c);
      return c;
    }),
    items: () => o.items ?? [],
    canSave: vi.fn(() => o.canSave ?? true),
    save: vi.fn(async () => 'done' as const),
    resume: vi.fn(),
    quit: vi.fn(),
  };
  const menu = new PauseMenu(new StubDocument(), ports);
  return { menu, ports, settings, bindings, press: (b: import('../input/actions').Binding) => captured?.(b), cancels, q: () => quality, h: () => hints };
}

describe('PauseMenu', () => {
  it('shows the pause screen with real buttons, and Esc (back) from it resumes', () => {
    const f = make();
    for (const id of ['resume', 'settings', 'controls', 'save', 'quit']) expect(find(f.menu.element, id)).not.toBeNull();
    expect((find(f.menu.element, 'resume') as unknown as { tag: string }).tag).toBe('button');
    f.menu.back();
    expect(f.ports.resume).toHaveBeenCalledTimes(1);
  });

  it('Esc from Settings or Controls goes back to the pause screen, not to the game', () => {
    const f = make();
    click(f.menu, 'settings');
    expect(f.menu.page).toBe('settings');
    f.menu.back();
    expect(f.menu.page).toBe('main');
    click(f.menu, 'controls');
    f.menu.back();
    expect(f.menu.page).toBe('main');
    expect(f.ports.resume).not.toHaveBeenCalled();
  });

  it('volume buttons step by 10 within 0..100 and mute, hints and companion lines toggle', () => {
    const f = make();
    click(f.menu, 'settings');
    click(f.menu, 'music-down');
    click(f.menu, 'music-down');
    expect(f.settings.get().music).toBe(80);
    click(f.menu, 'master-up');
    expect(f.settings.get().master).toBe(100);
    click(f.menu, 'muted');
    click(f.menu, 'hints');
    click(f.menu, 'barkSubtitles');
    expect(f.settings.get().muted).toBe(true);
    expect(f.h()).toBe(true);
    expect(f.settings.get().barkSubtitles).toBe(false);
    expect(textOf(f.menu.element)).toContain('80');
  });

  it('quality offers Auto, Low, Medium and High; Auto explains itself; no quality service hides the row', () => {
    const f = make();
    click(f.menu, 'settings');
    click(f.menu, 'quality-high');
    expect(f.q()).toBe('high');
    click(f.menu, 'quality-auto');
    expect(f.q()).toBe('auto');
    expect(textOf(f.menu.element)).toContain(SETTINGS_STRINGS_EN['settings.quality.autoNote']);
    const g = make({ quality: false });
    click(g.menu, 'settings');
    expect(find(g.menu.element, 'quality-auto')).toBeNull();
  });

  it('rebinds a key, and Esc cancels a capture without leaving Controls', () => {
    const f = make();
    click(f.menu, 'controls');
    click(f.menu, 'bind-dodge-0');
    expect(f.menu.capturing).toEqual({ action: 'dodge', slot: 0 });
    f.press({ device: 'key', code: 'KeyB' });
    expect(f.bindings.get('dodge')[0]).toEqual({ device: 'key', code: 'KeyB' });
    expect(f.menu.statusText).toBe('Dodge is now B.');
    click(f.menu, 'bind-dodge-1');
    f.menu.back();
    expect(f.menu.capturing).toBeNull();
    expect(f.menu.page).toBe('controls');
    expect(f.cancels.at(-1)).toHaveBeenCalled();
  });

  it('a key in use asks first, and the same key again swaps the two', () => {
    const f = make();
    click(f.menu, 'controls');
    click(f.menu, 'bind-dodge-0');
    f.press({ device: 'key', code: 'Space' }); // jump's key
    expect(f.menu.statusText).toContain('already used by Jump');
    expect(f.bindings.get('jump')[0]).toEqual({ device: 'key', code: 'Space' });
    f.press({ device: 'key', code: 'Space' });
    expect(f.bindings.get('dodge')[0]).toEqual({ device: 'key', code: 'Space' });
    expect(f.bindings.get('jump')[0]).toEqual({ device: 'key', code: 'ControlLeft' });
    expect(f.menu.statusText).toContain('moved from Jump to Dodge');
  });

  it('refuses a reserved key (F1) and resets every binding', () => {
    const f = make();
    click(f.menu, 'controls');
    click(f.menu, 'bind-jump-0');
    f.press({ device: 'key', code: 'F1' });
    expect(f.menu.statusText).toBe('F1 cannot be bound.');
    expect(f.bindings.get('jump')[0]).toEqual({ device: 'key', code: 'Space' });
    click(f.menu, 'bind-jump-0');
    f.press({ device: 'key', code: 'KeyU' });
    click(f.menu, 'reset');
    expect(f.bindings.get('jump')[0]).toEqual({ device: 'key', code: 'Space' });
  });

  it('every rebindable action has a row, and Esc (menu) has none', () => {
    const f = make();
    click(f.menu, 'controls');
    expect(find(f.menu.element, 'bind-ability6-0')).not.toBeNull();
    expect(find(f.menu.element, 'bind-dialogueChoice4-1')).not.toBeNull();
    expect(find(f.menu.element, 'bind-menu-0')).toBeNull();
  });

  it('saves when it may, and says so when it may not', async () => {
    const f = make();
    await f.menu.save();
    expect(f.ports.save).toHaveBeenCalledTimes(1);
    expect(f.menu.statusText).toBe('Game saved.');
    const g = make({ canSave: false });
    expect(find(g.menu.element, 'save')!.className).toContain('owg-btn-off');
    await g.menu.save();
    expect(g.ports.save).not.toHaveBeenCalled();
    expect(g.menu.statusText).toBe('You cannot save right now.');
  });

  it('quit asks first, and warns that unsaved progress is lost when saves are held', () => {
    const f = make();
    click(f.menu, 'quit');
    expect(textOf(f.menu.element)).toContain(SETTINGS_STRINGS_EN['settings.quit.saves']);
    click(f.menu, 'quit-cancel');
    expect(f.menu.page).toBe('main');
    click(f.menu, 'quit');
    click(f.menu, 'quit-confirm');
    expect(f.ports.quit).toHaveBeenCalledTimes(1);
    const g = make({ canSave: false });
    click(g.menu, 'quit');
    expect(textOf(g.menu.element)).toContain('unsaved progress since the last save is lost');
  });

  it('shows items other plugins add, straight or through a confirm', () => {
    const leave = vi.fn();
    const begin = vi.fn();
    const f = make({
      items: [
        { id: 'leave', labelKey: 'settings.pause.resume', onSelect: leave },
        { id: 'ng', labelKey: 'settings.pause.save', confirmKey: 'settings.quit.title', onSelect: begin },
      ],
    });
    click(f.menu, 'item-leave');
    expect(leave).toHaveBeenCalledTimes(1);
    click(f.menu, 'item-ng');
    expect(f.menu.page).toBe('confirm');
    expect(begin).not.toHaveBeenCalled();
    click(f.menu, 'confirm-yes');
    expect(begin).toHaveBeenCalledTimes(1);
    f.menu.back();
    expect(f.menu.page).toBe('main');
  });

  it('an item that throws is logged, not fatal', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = make({ items: [{ id: 'bad', labelKey: 'settings.back', onSelect: () => { throw new Error('x'); } }] });
    expect(() => click(f.menu, 'item-bad')).not.toThrow();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
