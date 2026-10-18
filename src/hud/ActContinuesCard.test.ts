import { describe, expect, it } from 'vitest';
import { ACT_CONTINUES_SECONDS, ACT_CONTINUES_TRIGGER, ActContinuesCard } from './ActContinuesCard';
import { StubDocument } from './dom';

function keys() {
  const set = new Set<(e: { repeat?: boolean }) => void>();
  return {
    set,
    addEventListener: (_t: 'keydown', l: (e: { repeat?: boolean }) => void) => void set.add(l),
    removeEventListener: (_t: 'keydown', l: (e: { repeat?: boolean }) => void) => void set.delete(l),
    press: (repeat = false) => [...set].forEach((l) => l({ repeat })),
  };
}

describe('ActContinuesCard', () => {
  it('is hidden until the fog trigger, then shows once', () => {
    const k = keys();
    const c = new ActContinuesCard(new StubDocument(), { keys: k, t: (x) => x });
    expect(c.element.style.display).toBe('none');
    c.onTrigger(ACT_CONTINUES_TRIGGER);
    expect(c.visible).toBe(true);
    expect(c.element.style.display).toBe('block');
    c.dismiss();
    c.onTrigger(ACT_CONTINUES_TRIGGER);
    expect(c.visible).toBe(false);
  });

  it('ignores other triggers', () => {
    const c = new ActContinuesCard(new StubDocument());
    c.onTrigger('trg.other');
    c.onTrigger('');
    expect(c.visible).toBe(false);
    c.onTrigger(ACT_CONTINUES_TRIGGER); // a mismatch does not use up the once
    expect(c.visible).toBe(true);
  });

  it('dismisses on a key and removes the listener', () => {
    const k = keys();
    const c = new ActContinuesCard(new StubDocument(), { keys: k });
    c.onTrigger(ACT_CONTINUES_TRIGGER);
    expect(k.set.size).toBe(1);
    c.update(0.6);
    k.press();
    expect(c.visible).toBe(false);
    expect(k.set.size).toBe(0);
  });

  it('dismisses after 6 s', () => {
    const c = new ActContinuesCard(new StubDocument());
    c.onTrigger(ACT_CONTINUES_TRIGGER);
    c.update(ACT_CONTINUES_SECONDS - 0.5);
    expect(c.visible).toBe(true);
    c.update(0.6);
    expect(c.visible).toBe(false);
    expect(c.element.style.display).toBe('none');
  });

  it('the option switch disables it', () => {
    const c = new ActContinuesCard(new StubDocument(), { enabled: () => false });
    c.onTrigger(ACT_CONTINUES_TRIGGER);
    expect(c.visible).toBe(false);
  });

  it('dispose removes the key listener', () => {
    const k = keys();
    const c = new ActContinuesCard(new StubDocument(), { keys: k });
    c.onTrigger(ACT_CONTINUES_TRIGGER);
    c.dispose();
    expect(k.set.size).toBe(0);
  });

  it('a held key (auto-repeat) and a key pressed straight away do not dismiss', () => {
    const k = keys();
    const c = new ActContinuesCard(new StubDocument(), { keys: k });
    c.onTrigger(ACT_CONTINUES_TRIGGER);
    k.press(false); // too soon after opening
    k.press(true);
    expect(c.visible).toBe(true);
    c.update(0.6);
    for (let i = 0; i < 20; i++) k.press(true); // held W keeps repeating
    expect(c.visible).toBe(true);
    k.press(false); // a fresh press after the delay
    expect(c.visible).toBe(false);
  });

  it('does not show when the wall is already open', () => {
    const c = new ActContinuesCard(new StubDocument(), { alreadyOpen: () => true });
    c.onTrigger(ACT_CONTINUES_TRIGGER);
    expect(c.visible).toBe(false);
  });
});
