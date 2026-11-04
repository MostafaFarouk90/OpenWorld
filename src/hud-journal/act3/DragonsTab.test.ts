import { describe, expect, it } from 'vitest';
import { EventBus } from '../../core/EventBus';
import { WorldState } from '../../state/WorldState';
import { asFake, fakeRoot } from '../fakeDom';
import { HUD_JOURNAL_STRINGS_EN } from '../strings.en';
import { DRAGONS_TAB_FLAG, DragonsTab, TAB_DRAGONS } from './DragonsTab';
import { HUD_JOURNAL_ACT3_STRINGS_EN } from './strings.en';

const STRINGS: Record<string, string> = { ...HUD_JOURNAL_STRINGS_EN, ...HUD_JOURNAL_ACT3_STRINGS_EN };
function setup() {
  const events = new EventBus() as any;
  const state = new WorldState(events, () => {});
  const strings = { t: (k: string, p?: Record<string, string | number>) => (STRINGS[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n])) };
  const tab = new DragonsTab({ events, state, strings } as never);
  const root = fakeRoot();
  return { events, state, tab, root };
}
const texts = (root: HTMLElement, cls: string) => asFake(root).byClass(cls).map((e) => e.textContent);

describe('DragonsTab', () => {
  it('is hidden before M32 and shown after, including a flag set by a load without an event', () => {
    const { state, tab } = setup();
    expect(tab.tab.id).toBe(TAB_DRAGONS);
    expect(tab.tab.visible()).toBe(false);
    state.setFlag(DRAGONS_TAB_FLAG, true);
    expect(tab.tab.visible()).toBe(true);
    (state as any).flags.set(DRAGONS_TAB_FLAG, false);
    expect(tab.tab.visible()).toBe(false);
  });

  it('draws the dragons row with the Houses\' bar, ticks and band', () => {
    const { tab, root } = setup();
    tab.tab.render(root);
    expect(texts(root, 'journal-heading')).toEqual(['The Dragons']);
    expect(texts(root, 'favour-name')).toEqual(['Trust of the dragons']);
    expect(asFake(root).byClass('favour-tick').map((t) => t.style.left)).toEqual(['25%', '50%', '70%']);
    expect(texts(root, 'favour-last')).toEqual(['No change yet']);
    expect(texts(root, 'favour-value')).toHaveLength(1);
  });

  it.each([[24, 'Cold'], [25, 'Banked'], [50, 'Stoked'], [70, 'Hearthbound']])('band at %i is %s', (v, label) => {
    const { state, tab, root } = setup();
    (state as any).favourValues.dragons = v;
    tab.tab.render(root);
    expect(texts(root, 'favour-band')).toEqual([label]);
    expect(asFake(root).byClass('favour-fill')[0].style.width).toBe(`${v}%`);
  });

  it('follows favour.changed for dragons, with the last change line, and ignores other tracks', () => {
    const { events, state, tab, root } = setup();
    tab.tab.render(root);
    const before = texts(root, 'favour-value')[0];
    state.addFavour('halvard', 5, 'quest');
    expect(texts(root, 'favour-value')[0]).toBe(before);
    expect(texts(root, 'favour-last')).toEqual(['No change yet']);
    const v0 = state.favour('dragons');
    state.addFavour('dragons', 8, 'quest');
    expect(texts(root, 'favour-value')[0]).toBe(String(Math.min(100, v0 + 8)));
    expect(texts(root, 'favour-last')).toEqual(['Last change: +8 Quest']);
    state.addFavour('dragons', -2, 'script');
    expect(texts(root, 'favour-last')).toEqual(['Last change: -2 Story']);
    // A zero delta leaves no change text.
    events.emit('favour.changed', { track: 'dragons', value: 10, previous: 10, delta: 0, source: 'quest', band: 'cold' });
    expect(texts(root, 'favour-last')).toEqual(['No change yet']);
  });

  it('clears the last change on load and re-reads the value; later changes still show', () => {
    const { events, state, tab, root } = setup();
    tab.tab.render(root);
    state.addFavour('dragons', 8, 'quest');
    (state as any).favourValues.dragons = 55;
    events.emit('save.loaded', { slot: 'x' });
    expect(texts(root, 'favour-last')).toEqual(['No change yet']);
    expect(texts(root, 'favour-value')).toEqual(['55']);
    expect(texts(root, 'favour-band')).toEqual(['Stoked']);
  });

  it('a change before the first render is kept for it, and a disconnected or disposed tab is not patched', () => {
    const { state, tab, root } = setup();
    state.addFavour('dragons', 3, 'dialogue');
    tab.tab.render(root);
    expect(texts(root, 'favour-last')).toEqual(['Last change: +3 Talk']);
    asFake(root).connected = false;
    state.addFavour('dragons', 3, 'dialogue');
    expect(texts(root, 'favour-last')).toEqual(['Last change: +3 Talk']);
    tab.dispose();
    expect(() => state.addFavour('dragons', 1, 'quest')).not.toThrow();
  });
});
