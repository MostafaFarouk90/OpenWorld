import { describe, expect, it } from 'vitest';
import { WorldState } from '../state/WorldState';
import { EventBus } from '../core/EventBus';
import { FavourTab } from './FavourTab';
import { HUD_JOURNAL_STRINGS_EN } from './strings.en';
import { asFake, fakeRoot } from './fakeDom';
import { FAVOUR_TAB_FLAG } from '../quests/journalTabs';

function setup() {
  const events = new EventBus() as any;
  const state = new WorldState(events, () => {});
  const strings = {
    t: (k: string, p?: Record<string, string | number>) =>
      (HUD_JOURNAL_STRINGS_EN[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n])),
  };
  const ctx = { events, state, strings } as never;
  const tab = new FavourTab(ctx);
  return { events, state, tab };
}
const texts = (root: HTMLElement, cls: string) => asFake(root).byClass(cls).map((e) => e.textContent);

describe('FavourTab', () => {
  it('visible follows the flag, including one set by a load without an event', () => {
    const { state, tab } = setup();
    expect(tab.tab.visible()).toBe(false);
    (state as any).flags.set(FAVOUR_TAB_FLAG, true); // what a load does: no flag.changed
    expect(tab.tab.visible()).toBe(true);
  });

  it('shows the three Houses only, with name, band and number', () => {
    const { tab } = setup();
    const root = fakeRoot();
    tab.tab.render(root);
    expect(texts(root, 'favour-name')).toEqual(['Halvard', 'Oswin', 'Grisel']);
    expect(texts(root, 'favour-value')).toEqual(['30', '20', '20']);
    expect(texts(root, 'favour-band')).toEqual(['Banked', 'Cold', 'Cold']);
    expect(asFake(root).byClass('favour-tick')).toHaveLength(9);
    expect(asFake(root).byClass('favour-tick').slice(0, 3).map((t) => t.style.left)).toEqual(['25%', '50%', '70%']);
    expect(texts(root, 'favour-last')[0]).toBe('No change yet');
  });

  it.each([[24, 'Cold'], [25, 'Banked'], [49, 'Banked'], [50, 'Stoked'], [69, 'Stoked'], [70, 'Hearthbound']])(
    'band at %i is %s', (v, label) => {
      const { state, tab } = setup();
      (state as any).favourValues.halvard = v;
      const root = fakeRoot();
      tab.tab.render(root);
      expect(texts(root, 'favour-band')[0]).toBe(label);
      expect(asFake(root).byClass('favour-fill')[0].style.width).toBe(`${v}%`);
    });

  it('clamps out of range values', () => {
    const { state, tab } = setup();
    (state as any).favourValues.halvard = 140;
    (state as any).favourValues.oswin = -5;
    (state as any).favourValues.grisel = Number.NaN;
    const root = fakeRoot();
    tab.tab.render(root);
    expect(texts(root, 'favour-value')).toEqual(['100', '0', '0']);
    expect(asFake(root).byClass('favour-fill').map((f) => f.style.width)).toEqual(['100%', '0%', '0%']);
  });

  it('favour.changed patches the open root with the source word', () => {
    const { state, tab } = setup();
    const root = fakeRoot();
    tab.tab.render(root);
    state.addFavour('halvard', 2, 'mercy');
    expect(texts(root, 'favour-value')[0]).toBe('32');
    expect(texts(root, 'favour-last')[0]).toBe('Last change: +2 Mercy');
    state.addFavour('oswin', -3, 'quest');
    expect(texts(root, 'favour-last')[1]).toBe('Last change: -3 Quest');
  });

  it('does not patch a disconnected root, but the next render reads current state', () => {
    const { state, tab } = setup();
    const root = fakeRoot();
    tab.tab.render(root);
    asFake(root).connected = false;
    state.addFavour('halvard', 5, 'dialogue');
    expect(texts(root, 'favour-value')[0]).toBe('30');
    const again = fakeRoot();
    tab.tab.render(again);
    expect(texts(again, 'favour-value')[0]).toBe('35');
    expect(texts(again, 'favour-last')[0]).toBe('Last change: +5 Talk');
  });

  it('ignores the dragons and Ashwalkers', () => {
    const { state, tab } = setup();
    const root = fakeRoot();
    tab.tab.render(root);
    state.addFavour('dragons', 4, 'script');
    expect(texts(root, 'favour-last').every((l) => l === 'No change yet')).toBe(true);
  });

  it('save.loaded clears the change line and re-reads values', () => {
    const { events, state, tab } = setup();
    const root = fakeRoot();
    tab.tab.render(root);
    state.addFavour('halvard', 2, 'mercy');
    (state as any).favourValues.halvard = 80;
    events.emit('save.loaded', { slot: 'a' });
    expect(texts(root, 'favour-value')[0]).toBe('80');
    expect(texts(root, 'favour-band')[0]).toBe('Hearthbound');
    expect(texts(root, 'favour-last')[0]).toBe('No change yet');
  });

  it('dispose stops patching', () => {
    const { state, tab } = setup();
    const root = fakeRoot();
    tab.tab.render(root);
    tab.dispose();
    state.addFavour('halvard', 2, 'mercy');
    expect(texts(root, 'favour-value')[0]).toBe('30');
  });
});
