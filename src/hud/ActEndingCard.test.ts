import { describe, expect, it, vi } from 'vitest';
import { ACT_ENDING_ARM_SECONDS, ACT_ENDING_CAMP_FLAGS, ActEndingCard, endingOptions } from './ActEndingCard';
import { StubDocument, textOf } from './dom';

type Key = { repeat?: boolean; key?: string; code?: string };
function keys() {
  const set = new Set<(e: Key) => void>();
  return {
    set,
    addEventListener: (_t: 'keydown', l: (e: Key) => void) => void set.add(l),
    removeEventListener: (_t: 'keydown', l: (e: Key) => void) => void set.delete(l),
    press: (repeat = false, extra: Key = {}) => [...set].forEach((l) => l({ repeat, ...extra })),
  };
}

/** A flag store that outlives widget instances, standing in for a save then load. */
function make(flags: Record<string, boolean> = {}, extra: { recap?: () => string[]; modal?: { open: boolean } } = {}) {
  const k = keys();
  const closed = vi.fn();
  const modal = extra.modal ?? { open: false };
  const card = new ActEndingCard(new StubDocument(), {
    t: (x) => x,
    keys: k,
    modalOpen: () => modal.open,
    seen: () => !!flags['codex.actEndingSeen'],
    campSeen: () => ACT_ENDING_CAMP_FLAGS.some((f) => !!flags[f]),
    markSeen: () => void (flags['codex.actEndingSeen'] = true),
    closed,
    recap: extra.recap,
  });
  return { card, k, closed, flags, modal };
}
const END = { act: 1, endingId: 'smoke-over-harrowmark' };
const arm = (c: ActEndingCard) => c.update(ACT_ENDING_ARM_SECONDS + 0.1);

describe('ActEndingCard', () => {
  it('is hidden until act.ended, then shows title and recap, and sets the once-flag when shown', () => {
    const { card, flags } = make({}, { recap: () => ['The wall fell.', 'Tobb joined.'] });
    expect(card.visible).toBe(false);
    expect(flags['codex.actEndingSeen']).toBeUndefined();
    card.onActEnded(END);
    expect(card.visible).toBe(true);
    expect(flags['codex.actEndingSeen']).toBe(true);
    expect(textOf(card.element)).toContain('hud.ending.title');
    expect(textOf(card.element)).toContain('The wall fell.');
    expect(textOf(card.element)).toContain('Tobb joined.');
  });

  it('ignores other acts, other endings and junk', () => {
    const { card } = make();
    card.onActEnded({ act: 2, endingId: 'smoke-over-harrowmark' });
    card.onActEnded({ act: 1, endingId: 'other' });
    card.onActEnded(null);
    expect(card.visible).toBe(false);
  });

  it('a throwing or missing recap gives an empty body; the global recap hook is used when none injected', () => {
    const a = make({}, { recap: () => { throw new Error('x'); } });
    a.card.onActEnded(END);
    expect(a.card.visible).toBe(true);
    const b = make();
    endingOptions.recap = () => ['hooked'];
    try {
      b.card.onActEnded(END);
      expect(textOf(b.card.element)).toContain('hooked');
    } finally {
      delete endingOptions.recap;
    }
  });

  it('load with the gate set re-derives the card', () => {
    const { card } = make();
    card.onGate(true);
    expect(card.visible).toBe(true);
  });

  it('load with the once-flag set does not show', () => {
    const { card } = make({ 'codex.actEndingSeen': true });
    card.onGate(true);
    expect(card.visible).toBe(false);
  });

  it('load with campSeen set does not show', () => {
    const { card } = make({ 'story.d02.campSeen': true });
    card.onGate(true);
    expect(card.visible).toBe(false);
  });

  it('camp-seen is honoured under either flag name (thread 6 may ship either)', () => {
    expect([...ACT_ENDING_CAMP_FLAGS]).toEqual(['story.d02.campSeen']);
    for (const flag of ACT_ENDING_CAMP_FLAGS) {
      const { card } = make({ [flag]: true });
      card.onGate(true);
      expect(card.visible).toBe(false);
    }
  });

  it('live act.ended respects the once-flag but not the camp flag', () => {
    const seen = make({ 'codex.actEndingSeen': true });
    seen.card.onActEnded(END);
    expect(seen.card.visible).toBe(false);
    expect(seen.card.active).toBe(false);
    const camp = make({ 'story.d02.campSeen': true });
    camp.card.onActEnded(END);
    expect(camp.card.visible).toBe(true);
  });

  it('replay: a second act.ended after the card was shown and closed does not show it again', () => {
    const { card, closed } = make();
    card.onActEnded(END);
    arm(card);
    card.dismiss();
    expect(closed).toHaveBeenCalledTimes(1);
    card.onActEnded(END);
    expect(card.visible).toBe(false);
    expect(card.active).toBe(false);
  });

  it('Escape never closes the card or emits closed; another key still does', () => {
    const { card, k, closed } = make();
    card.onActEnded(END);
    arm(card);
    k.press(false, { key: 'Escape', code: 'Escape' });
    k.press(false, { code: 'Escape' });
    k.press(false, { key: 'Escape' });
    expect(card.visible).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    k.press(false, { key: ' ', code: 'Space' });
    expect(card.visible).toBe(false);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('save.loaded hides a showing or waiting card when the loaded save has the once-flag, keeps it otherwise', () => {
    const showing = make();
    showing.card.onActEnded(END);
    showing.card.onLoaded(); // seen was set by showing; the loaded save is what counts, so simulate a load without it
    expect(showing.card.visible).toBe(false);
    const kept = make();
    kept.card.onActEnded(END);
    delete kept.flags['codex.actEndingSeen'];
    kept.card.onLoaded();
    expect(kept.card.visible).toBe(true);
    const waiting = make();
    waiting.modal.open = true;
    waiting.card.onActEnded(END);
    expect(waiting.card.active).toBe(true);
    waiting.flags['codex.actEndingSeen'] = true;
    waiting.card.onLoaded();
    expect(waiting.card.active).toBe(false);
    waiting.modal.open = false;
    waiting.card.update(0.016);
    expect(waiting.card.visible).toBe(false);
  });

  it('gate falling hides the card without a closed event; no auto-dismiss otherwise', () => {
    const { card, closed } = make();
    card.onActEnded(END);
    for (let i = 0; i < 100; i++) card.update(1);
    expect(card.visible).toBe(true);
    card.onGate(false);
    expect(card.visible).toBe(false);
    expect(closed).not.toHaveBeenCalled();
  });

  it('too-early and repeat keys are ignored; a fresh key after the arm delay dismisses and emits closed once', () => {
    const { card, k, closed } = make();
    card.onActEnded(END);
    k.press();
    expect(card.visible).toBe(true);
    card.update(ACT_ENDING_ARM_SECONDS - 0.1);
    k.press();
    expect(card.visible).toBe(true);
    arm(card);
    k.press(true);
    expect(card.visible).toBe(true);
    k.press();
    expect(card.visible).toBe(false);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledWith('smoke-over-harrowmark');
    expect(k.set.size).toBe(0);
    k.press();
    card.dismiss();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('click dismisses', () => {
    const { card, closed } = make();
    card.onActEnded(END);
    card.element.onclick?.();
    expect(card.visible).toBe(false);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('yields while a modal is open and re-shows after; keys do not dismiss while yielded', () => {
    const { card, k, closed, modal } = make();
    card.onActEnded(END);
    arm(card);
    modal.open = true;
    card.update(0.016);
    expect(card.visible).toBe(false);
    expect(card.active).toBe(true);
    k.press();
    expect(closed).not.toHaveBeenCalled();
    modal.open = false;
    card.update(0.016);
    expect(card.visible).toBe(true);
    k.press(); // re-shown: arm delay restarts
    expect(card.visible).toBe(true);
  });

  it('act.ended while a modal is open waits, and the once-flag is set only when it shows', () => {
    const { card, flags, modal } = make();
    modal.open = true;
    card.onActEnded(END);
    expect(card.visible).toBe(false);
    expect(flags['codex.actEndingSeen']).toBeUndefined();
    modal.open = false;
    card.update(0.016);
    expect(card.visible).toBe(true);
    expect(flags['codex.actEndingSeen']).toBe(true);
  });

  it('once-flag persists across a save and load: the new session does not replay', () => {
    const first = make();
    first.card.onActEnded(END);
    const saved = { ...first.flags };
    first.card.dispose();
    const second = make(saved);
    second.card.onGate(true);
    expect(second.card.visible).toBe(false);
  });

  it('the gate re-opening while already shown does not duplicate', () => {
    const { card, closed } = make();
    card.onActEnded(END);
    card.onGate(true);
    card.onActEnded(END);
    arm(card);
    card.dismiss();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('a throwing reader or callback never throws out', () => {
    const card = new ActEndingCard(new StubDocument(), {
      modalOpen: () => { throw new Error('a'); },
      seen: () => { throw new Error('b'); },
      markSeen: () => { throw new Error('c'); },
      closed: () => { throw new Error('d'); },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => card.onGate(true)).not.toThrow();
    expect(card.visible).toBe(true);
    expect(() => card.dismiss()).not.toThrow();
  });

  it('dispose removes the key listener', () => {
    const { card, k } = make();
    card.onActEnded(END);
    expect(k.set.size).toBe(1);
    card.dispose();
    expect(k.set.size).toBe(0);
  });
});
