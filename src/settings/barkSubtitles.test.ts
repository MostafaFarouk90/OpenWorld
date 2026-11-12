import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus';
import type { GameEventMap } from '../core/events';
import { companionName, installBarkSubtitles } from './barkSubtitles';

const STR: Record<string, string> = {
  'companion.hrolf.name': 'Hrolf',
  'companion.hrolf.bark.combatStart.1': 'Shields up.',
  'npc.wenna.name': 'Wenna',
};

function make(o: { enabled?: boolean; busy?: boolean } = {}) {
  const events = new EventBus<GameEventMap>();
  const cards = { show: vi.fn(), clear: vi.fn() };
  const state = { enabled: o.enabled ?? true, busy: o.busy ?? false };
  const off = installBarkSubtitles({
    events,
    t: (k) => STR[k] ?? `[[${k}]]`,
    has: (k) => k in STR,
    cards,
    enabled: () => state.enabled,
    busy: () => state.busy,
  });
  const bark = (lineKey: string, companionId = 'hrolf') => events.emit('companion.banter', { companionId, lineKey, trigger: 'combatStart' });
  return { events, cards, state, off, bark };
}

describe('bark subtitles', () => {
  it('shows a bark as "Name: line" in the subtitle slot', () => {
    const f = make();
    f.bark('companion.hrolf.bark.combatStart.1');
    expect(f.cards.show).toHaveBeenCalledWith('Hrolf: Shields up.', 'subtitle');
  });

  it('shows nothing when switched off, in a scene or dialogue, or for a missing line', () => {
    const f = make({ enabled: false });
    f.bark('companion.hrolf.bark.combatStart.1');
    f.state.enabled = true;
    f.state.busy = true;
    f.bark('companion.hrolf.bark.combatStart.1');
    f.state.busy = false;
    f.bark('companion.hrolf.bark.nope');
    expect(f.cards.show).not.toHaveBeenCalled();
  });

  it('clears on a load and stops listening after teardown', () => {
    const f = make();
    f.events.emit('save.loaded', { slot: 'auto' } as never);
    expect(f.cards.clear).toHaveBeenCalledWith('subtitle');
    f.off();
    f.bark('companion.hrolf.bark.combatStart.1');
    expect(f.cards.show).not.toHaveBeenCalled();
  });

  it('names a companion from its companion key, then the npc key, then the id', () => {
    const d = { t: (k: string) => STR[k] ?? `[[${k}]]`, has: (k: string) => k in STR };
    expect(companionName('hrolf', d)).toBe('Hrolf');
    expect(companionName('wenna', d)).toBe('Wenna');
    expect(companionName('tobb', d)).toBe('Tobb');
  });
});
