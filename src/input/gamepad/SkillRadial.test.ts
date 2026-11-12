import { describe, expect, it, vi } from 'vitest';
import type { Action, InputContext } from '../actions';
import { GamepadInput } from './GamepadInput';
import { PadBindings } from './PadBindings';
import { PAD } from './padLayout';
import { Rumble } from './rumble';
import { SCREEN_WEDGES, SKILL_WEDGES, SkillRadial, VIEW_HOLD_S, wedgeAt } from './SkillRadial';
import type { RadialWedge } from './SkillRadial';
import { FakePad } from './testing/fakePad';

describe('wedgeAt', () => {
  it('maps the stick angle clockwise from the top', () => {
    expect(wedgeAt(0, 1, 8)).toBe(0);
    expect(wedgeAt(1, 0, 8)).toBe(2);
    expect(wedgeAt(0, -1, 8)).toBe(4);
    expect(wedgeAt(-1, 0, 8)).toBe(6);
    expect(wedgeAt(0.7, 0.7, 8)).toBe(1);
    expect(wedgeAt(-0.2, 0.98, 8)).toBe(0); // just left of the top still picks the top wedge
  });
  it('inside the pick dead zone, or with no wedges, it is -1', () => {
    expect(wedgeAt(0.2, 0.2, 8)).toBe(-1);
    expect(wedgeAt(0, 1, 0)).toBe(-1);
  });
});

function rig(opts: { usable?: (a: Action) => boolean } = {}) {
  const state = { ctx: 'gameplay' as InputContext };
  const fake = new FakePad();
  const taps: string[] = [];
  const sink = {
    tokenDown: vi.fn((t: string) => void (t.startsWith('p:act:') && taps.push(t.slice(6)))),
    tokenUp: vi.fn(),
    isTokenHeld: () => false,
  };
  const pad = new GamepadInput({
    getGamepads: () => [fake],
    sink,
    bindings: new PadBindings(null, () => {}),
    context: () => state.ctx,
    wheelClaimed: () => false,
    addWheel: () => {},
    now: () => 0,
  });
  const view = { show: vi.fn(), select: vi.fn(), hide: vi.fn() };
  const usable = opts.usable ?? (() => true);
  const radial = new SkillRadial({
    context: () => state.ctx,
    wedges: (kind) =>
      (kind === 'skills' ? SKILL_WEDGES : SCREEN_WEDGES).map((a): RadialWedge => ({ action: a, label: a, usable: usable(a) })),
    view,
  });
  pad.intercept(radial);
  const step = (dt = 0.016) => {
    pad.poll(dt);
    radial.frame(dt, pad);
  };
  return { state, fake, pad, radial, view, taps, sink, step };
}

describe('SkillRadial (hold RB)', () => {
  it('opens on RB, the right stick picks, release fires that action, and the camera does not turn meanwhile', () => {
    const { fake, pad, radial, view, taps, step } = rig();
    fake.set(PAD.RB, true);
    step();
    expect(radial.openKind).toBe('skills');
    expect(view.show).toHaveBeenCalledWith('skills', expect.any(Array));
    fake.right(1, 0);
    step(0.1);
    expect(pad.consumeLook()).toEqual({ dx: 0, dy: 0 });
    expect(radial.selection).toBe(2);
    fake.right(0, 0); // the stick springs back before the release: the pick stays
    step();
    fake.set(PAD.RB, false);
    step();
    expect(taps).toEqual(['ability3']);
    expect(radial.openKind).toBeNull();
    expect(view.hide).toHaveBeenCalled();
    fake.right(1, 0);
    step(0.1);
    expect(pad.consumeLook().dx).toBeGreaterThan(0);
  });

  it('releasing with no pick, or after B, fires nothing', () => {
    const { fake, taps, radial, step } = rig();
    fake.set(PAD.RB, true);
    step();
    fake.set(PAD.RB, false);
    step();
    fake.set(PAD.RB, true);
    step();
    fake.right(0, 1);
    step();
    fake.set(PAD.B, true);
    step();
    expect(radial.openKind).toBeNull();
    fake.set(PAD.RB, false).set(PAD.B, false);
    step();
    expect(taps).toEqual([]);
  });

  it('B while the radial is open does not dodge', () => {
    const { fake, sink, step } = rig();
    fake.set(PAD.RB, true);
    step();
    fake.set(PAD.B, true);
    step();
    expect(sink.tokenDown).not.toHaveBeenCalledWith('p:base:1', expect.anything());
  });

  it('a wedge on cooldown does nothing', () => {
    const { fake, taps, step } = rig({ usable: (a) => a !== 'ability1' });
    fake.set(PAD.RB, true);
    step();
    fake.right(0, 1);
    step();
    fake.set(PAD.RB, false);
    step();
    expect(taps).toEqual([]);
  });

  it('a cutscene or menu closes it without firing; RB outside gameplay does not open it', () => {
    const { fake, taps, radial, state, step } = rig();
    fake.set(PAD.RB, true);
    step();
    fake.right(0, 1);
    step();
    state.ctx = 'cutscene';
    step();
    expect(radial.openKind).toBeNull();
    fake.set(PAD.RB, false);
    step();
    fake.set(PAD.RB, true);
    step();
    expect(radial.openKind).toBeNull();
    expect(taps).toEqual([]);
  });
});

describe('screens radial (View)', () => {
  it('a tap opens the inventory', () => {
    const { fake, taps, radial, step } = rig();
    fake.set(PAD.VIEW, true);
    step();
    fake.set(PAD.VIEW, false);
    step();
    expect(radial.openKind).toBeNull();
    expect(taps).toEqual(['inventory']);
  });

  it('a hold opens the screens radial; either stick picks; release opens that screen', () => {
    const { fake, taps, radial, step } = rig();
    fake.set(PAD.VIEW, true);
    step();
    step(VIEW_HOLD_S);
    expect(radial.openKind).toBe('screens');
    fake.left(0, -1); // bottom of six wedges: index 3, the map
    step();
    fake.set(PAD.VIEW, false);
    step();
    expect(taps).toEqual(['map']);
  });
});

describe('Rumble', () => {
  const make = (over: Partial<{ active: boolean; enabled: boolean; visible: boolean; actuator: boolean }> = {}) => {
    const fake = new FakePad();
    if (over.actuator === false) (fake as { vibrationActuator: unknown }).vibrationActuator = null;
    const r = new Rumble({
      pad: () => fake,
      padActive: () => over.active ?? true,
      enabled: () => over.enabled ?? true,
      visible: () => over.visible ?? true,
    });
    return { r, fake };
  };
  it('plays a dual-rumble effect sized per event', () => {
    const { r, fake } = make();
    expect(r.play('heavyDealt')).toBe(true);
    expect(fake.vibrationActuator.playEffect).toHaveBeenCalledWith('dual-rumble', expect.objectContaining({ duration: 150 }));
    r.play('hitDealt');
    expect(fake.vibrationActuator.playEffect).toHaveBeenLastCalledWith('dual-rumble', expect.objectContaining({ duration: 60 }));
  });
  it('is silent with no actuator, the setting off, the keyboard in use or the tab hidden', () => {
    expect(make({ actuator: false }).r.play('hitTaken')).toBe(false);
    expect(make({ enabled: false }).r.play('hitTaken')).toBe(false);
    expect(make({ active: false }).r.play('hitTaken')).toBe(false);
    expect(make({ visible: false }).r.play('hitTaken')).toBe(false);
  });
  it('an actuator that throws or rejects never breaks the game', () => {
    const { r, fake } = make();
    fake.vibrationActuator.playEffect = vi.fn(() => {
      throw new Error('no');
    }) as never;
    expect(r.play('bossPhase')).toBe(false);
    fake.vibrationActuator.playEffect = vi.fn(() => Promise.reject(new Error('busy'))) as never;
    expect(r.play('bossPhase')).toBe(true);
  });
});
