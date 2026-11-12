// G2: the Controls tab's Controller column (PadBindings), driven through GamepadInput.listenNext.
import { describe, expect, it, vi } from 'vitest';
import { StubDocument, textOf, type ElementLike } from '../hud/dom';
import { InputBindings } from '../input/InputBindings';
import { GamepadInput } from '../input/gamepad/GamepadInput';
import { PadBindings } from '../input/gamepad/PadBindings';
import { PAD } from '../input/gamepad/padLayout';
import { FakePad } from '../input/gamepad/testing/fakePad';
import { PauseMenu } from './PauseMenu';
import { SettingsStore } from './SettingsStore';
import { SETTINGS_STRINGS_EN } from './strings.en';

const t = (k: string, p?: Record<string, string | number>) =>
  (SETTINGS_STRINGS_EN[k] ?? `[[${k}]]`).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n] ?? `{${n}}`));
function find(el: ElementLike, id: string): ElementLike | null {
  if (el.getAttribute('data-id') === id) return el;
  for (const c of el.children) {
    const f = find(c, id);
    if (f) return f;
  }
  return null;
}

function make(withPad = true) {
  const fake = new FakePad();
  const padBindings = new PadBindings(null, () => {});
  const pad = new GamepadInput({
    getGamepads: () => [fake],
    sink: { tokenDown: vi.fn(), tokenUp: vi.fn(), isTokenHeld: () => false },
    bindings: padBindings,
    context: () => 'menu',
    wheelClaimed: () => false,
    addWheel: () => {},
    now: () => 0,
  });
  const bindings = new InputBindings(null, () => {});
  const menu = new PauseMenu(new StubDocument(), {
    t,
    settings: new SettingsStore(null),
    quality: null,
    hints: null,
    bindings,
    listen: () => () => {},
    pad: withPad ? { bindings: padBindings, listen: (cb) => pad.listenNext(cb) } : null,
    canSave: () => true,
    save: async () => 'done' as const,
    resume: vi.fn(),
    quit: vi.fn(),
  });
  const press = (button: number) => {
    fake.set(button, true);
    pad.poll();
    fake.set(button, false);
    pad.poll();
  };
  const open = () => find(menu.element, 'controls')!.onclick?.();
  return { menu, padBindings, fake, pad, press, open, bindings };
}

describe('PauseMenu Controller column', () => {
  it("shows each action's pad chord; stick-moved and fixed actions are greyed", () => {
    const f = make();
    f.open();
    expect(textOf(find(f.menu.element, 'pad-jump')!)).toBe('A');
    expect(textOf(find(f.menu.element, 'pad-ability1')!)).toBe('LB+A');
    expect(find(f.menu.element, 'pad-moveForward')!.className).toContain('owg-btn-off');
  });

  it('rebinds from the next pad press; LB held picks the LB layer', () => {
    const f = make();
    f.open();
    find(f.menu.element, 'pad-mount')!.onclick?.();
    expect(f.menu.padCapturing).toBe('mount');
    f.fake.set(PAD.LB, true);
    f.pad.poll();
    f.press(PAD.LS);
    expect(f.padBindings.get('mount')).toEqual({ button: PAD.LS, layer: 'lb' });
    expect(f.menu.padCapturing).toBeNull();
    f.menu.update();
    expect(textOf(find(f.menu.element, 'pad-mount')!)).toBe('LB+LS');
  });

  it('a clash keeps listening and the same button again swaps', () => {
    const f = make();
    f.open();
    find(f.menu.element, 'pad-interact')!.onclick?.();
    f.press(PAD.A);
    expect(f.menu.statusText).toContain('already used');
    expect(f.menu.padCapturing).toBe('interact');
    f.press(PAD.A);
    expect(f.padBindings.get('interact')).toEqual({ button: PAD.A, layer: 'base' });
    expect(f.padBindings.get('jump')).toEqual({ button: PAD.X, layer: 'base' });
  });

  it('a reserved button is refused; back() cancels a capture; reset restores pad defaults too', () => {
    const f = make();
    f.open();
    find(f.menu.element, 'pad-mount')!.onclick?.();
    f.press(PAD.VIEW);
    expect(f.menu.statusText).toContain('cannot be bound');
    find(f.menu.element, 'pad-mount')!.onclick?.();
    f.menu.back();
    expect(f.menu.padCapturing).toBeNull();
    expect(f.menu.page).toBe('controls');
    f.press(PAD.Y); // no capture any more: nothing rebinds
    expect(f.padBindings.get('mount')).toEqual({ button: PAD.RIGHT, layer: 'base' });
    f.padBindings.clear('mount');
    find(f.menu.element, 'reset')!.onclick?.();
    expect(f.padBindings.get('mount')).toEqual({ button: PAD.RIGHT, layer: 'base' });
  });

  it('Start during a capture is not captured', () => {
    const f = make();
    f.open();
    find(f.menu.element, 'pad-mount')!.onclick?.();
    f.press(PAD.START);
    expect(f.padBindings.get('mount')).toEqual({ button: PAD.RIGHT, layer: 'base' });
  });

  it('without a gamepad service there is no Controller column', () => {
    const f = make(false);
    f.open();
    expect(find(f.menu.element, 'pad-jump')).toBeNull();
  });
});
