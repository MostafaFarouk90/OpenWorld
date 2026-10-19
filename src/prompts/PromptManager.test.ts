import { describe, expect, it } from 'vitest';
import { MECHANICS, PromptManager, type PromptDeps } from './PromptManager';

function setup(over: Partial<PromptDeps> = {}) {
  const clock = { tick: 0 };
  const glyphs: Record<string, string> = { sprint: 'Shift', jump: 'Space', dodge: 'Ctrl', move: 'WASD', block: 'RMB', map: 'M' };
  const flags: Record<string, number> = {};
  const warns: string[] = [];
  let hints: boolean | null = null;
  const lock: { v: { supported: boolean; locked: boolean } | undefined } = { v: undefined };
  const deps: PromptDeps = {
    clock,
    bindings: { glyph: (a) => glyphs[a] ?? '?', has: (a) => a in glyphs },
    strings: {
      t: (k, p) => {
        const table: Record<string, string> = {
          'prompt.sprint': 'Hold {key} to sprint',
          'prompt.jump': 'Press {key} to jump',
          'prompt.dodge': 'Press {key} to dodge',
          'prompt.dodge.rebindOffer': 'Rebind dodge',
          'prompt.move': 'Move {key}',
          'prompt.block': 'Block {key}',
          'prompt.map': 'Map {key}',
        };
        const s = table[k] ?? `[[${k}]]`;
        return s.replace('{key}', String(p?.key ?? '{key}'));
      },
    },
    flags: { setFlag: (k, v) => void (flags[k] = v) },
    keyboardLock: () => lock.v,
    storage: { get: () => hints, set: (v) => void (hints = v) },
    logger: { warn: (m) => void warns.push(m) },
    ...over,
  };
  return { pm: new PromptManager(deps), clock, glyphs, flags, warns, lock, getHints: () => hints };
}

describe('PromptManager', () => {
  it('shows a prompt with the current glyph', () => {
    const { pm } = setup();
    pm.show('sprint', 'sprint', 'prompt.sprint');
    expect(pm.rows()).toEqual([{ mechanic: 'sprint', text: 'Hold Shift to sprint', opacity: 1, state: 'shown' }]);
  });

  it('shows a lockSwap prompt whose text has no {key}, counting it as a known mechanic', () => {
    const { pm, warns, glyphs } = setup();
    glyphs.lockOn = 'Tab';
    pm.show('lockSwap', 'lockOn' as never, 'prompt.lockSwap');
    expect(pm.rows()[0].text).toBe('[[prompt.lockSwap]]');
    pm.success('lockSwap');
    expect(warns).toEqual([]);
    expect(pm.count('lockSwap')).toBe(1);
  });

  it('counts successes without a prompt and mirrors flags', () => {
    const { pm, flags } = setup();
    pm.success('sprint');
    expect(pm.count('sprint')).toBe(1);
    expect(flags['prompt.sprint.count']).toBe(1);
  });

  it('ignores unknown mechanics with a warning', () => {
    const { pm, warns, flags } = setup();
    pm.success('bogus');
    expect(pm.count('bogus')).toBe(0);
    expect(warns).toHaveLength(1);
    expect(flags['prompt.bogus.count']).toBeUndefined();
  });

  it('fades on the second success, not the first, driven by update', () => {
    const { pm } = setup();
    pm.show('sprint', 'sprint', 'prompt.sprint');
    pm.success('sprint');
    pm.update(1);
    expect(pm.rows()[0].state).toBe('shown');
    pm.success('sprint');
    expect(pm.rows()[0].state).toBe('fading');
    pm.update(0.2);
    const r = pm.rows()[0];
    expect(r.opacity).toBeCloseTo(0.5, 5);
    pm.update(0.2);
    expect(pm.rows()).toHaveLength(0);
  });

  it('skips show after fade within 90 s, shows after 90 s, force always shows', () => {
    const { pm, clock } = setup();
    pm.success('jump');
    pm.success('jump');
    clock.tick = 5399;
    pm.show('jump', 'jump', 'prompt.jump');
    expect(pm.rows()).toHaveLength(0);
    pm.show('jump', 'jump', 'prompt.jump', { force: true });
    expect(pm.rows()).toHaveLength(1);
    pm.hide();
    clock.tick = 5400;
    pm.show('jump', 'jump', 'prompt.jump');
    expect(pm.rows()).toHaveLength(1);
  });

  it('showHintsAlways on mid-fade cancels, off resumes the fade', () => {
    const { pm, getHints } = setup();
    pm.show('sprint', 'sprint', 'prompt.sprint');
    pm.success('sprint');
    pm.success('sprint');
    pm.update(0.2);
    pm.showHintsAlways = true;
    expect(getHints()).toBe(true);
    expect(pm.rows()[0]).toMatchObject({ state: 'shown', opacity: 1 });
    pm.update(1);
    expect(pm.rows()).toHaveLength(1);
    pm.showHintsAlways = false;
    expect(pm.rows()[0].state).toBe('fading');
    pm.update(0.5);
    expect(pm.rows()).toHaveLength(0);
  });

  it('shows while hints always is on even right after use', () => {
    const { pm } = setup();
    pm.showHintsAlways = true;
    pm.success('jump');
    pm.success('jump');
    pm.show('jump', 'jump', 'prompt.jump');
    expect(pm.rows()).toHaveLength(1);
    pm.success('jump');
    pm.update(5);
    expect(pm.rows()).toHaveLength(1);
  });

  it('re-shows prompts that faded in this session when hints turn on', () => {
    const { pm } = setup();
    pm.show('sprint', 'sprint', 'prompt.sprint');
    pm.success('sprint');
    pm.success('sprint');
    pm.update(1);
    expect(pm.rows()).toHaveLength(0);
    pm.showHintsAlways = true;
    expect(pm.rows().map((r) => r.mechanic)).toEqual(['sprint']);
  });

  it('reads showHintsAlways from storage and survives throwing storage', () => {
    const a = setup({ storage: { get: () => true, set: () => {} } });
    expect(a.pm.showHintsAlways).toBe(true);
    const b = setup({
      storage: {
        get: () => {
          throw new Error('x');
        },
        set: () => {
          throw new Error('y');
        },
      },
    });
    expect(b.pm.showHintsAlways).toBe(false);
    b.pm.showHintsAlways = true;
    expect(b.pm.showHintsAlways).toBe(true);
  });

  it('warns once for an unknown action and shows nothing', () => {
    const { pm, warns } = setup();
    pm.show('sprint', 'nope', 'prompt.sprint');
    pm.show('sprint', 'nope', 'prompt.sprint');
    expect(pm.rows()).toHaveLength(0);
    expect(warns).toHaveLength(1);
  });

  it('shows [[key]] for a missing string key', () => {
    const { pm } = setup();
    pm.show('sprint', 'sprint', 'prompt.missing');
    expect(pm.rows()[0].text).toBe('[[prompt.missing]]');
  });

  it('a repeat show is one row', () => {
    const { pm } = setup();
    pm.show('sprint', 'sprint', 'prompt.sprint');
    pm.show('sprint', 'sprint', 'prompt.sprint');
    expect(pm.rows()).toHaveLength(1);
  });

  it('evicts the oldest on the fourth show, hide with and without id', () => {
    const { pm } = setup();
    pm.show('sprint', 'sprint', 'prompt.sprint');
    pm.show('jump', 'jump', 'prompt.jump');
    pm.show('move', 'move', 'prompt.move');
    pm.show('block', 'block', 'prompt.block');
    expect(pm.rows().map((r) => r.mechanic)).toEqual(['jump', 'move', 'block']);
    pm.hide('move');
    expect(pm.rows().map((r) => r.mechanic)).toEqual(['jump', 'block']);
    pm.hide();
    expect(pm.rows()).toHaveLength(0);
  });

  it('evicts non-forced rows first and a forced row only when all are forced', () => {
    const { pm } = setup();
    pm.show('sprint', 'sprint', 'prompt.sprint', { force: true });
    pm.show('jump', 'jump', 'prompt.jump');
    pm.show('move', 'move', 'prompt.move', { force: true });
    pm.show('block', 'block', 'prompt.block');
    expect(pm.rows().map((r) => r.mechanic)).toEqual(['sprint', 'move', 'block']);
    pm.hide();
    for (const m of ['sprint', 'jump', 'move']) pm.show(m, m === 'move' ? 'move' : m, `prompt.${m}`, { force: true });
    pm.show('block', 'block', 'prompt.block', { force: true });
    expect(pm.rows().map((r) => r.mechanic)).toEqual(['jump', 'move', 'block']);
  });

  it('refreshes glyphs after a rebind', () => {
    const { pm, glyphs } = setup();
    pm.show('sprint', 'sprint', 'prompt.sprint');
    glyphs.sprint = 'Q';
    expect(pm.rows()[0].text).toContain('Shift');
    pm.refresh();
    expect(pm.rows()[0].text).toBe('Hold Q to sprint');
  });

  it('offers the dodge rebind once, when lock is unavailable', () => {
    const { pm } = setup();
    pm.show('dodge', 'dodge', 'prompt.dodge');
    expect(pm.rows()[0].text).toBe('Press Ctrl to dodge\nRebind dodge');
    pm.hide();
    pm.show('dodge', 'dodge', 'prompt.dodge');
    expect(pm.rows()[0].text).toBe('Press Ctrl to dodge');
    expect(pm.serialize().rebindOfferShown).toBe(true);
  });

  it('offers when lock is supported but not locked, never when locked', () => {
    const a = setup();
    a.lock.v = { supported: true, locked: false };
    a.pm.show('dodge', 'dodge', 'prompt.dodge');
    expect(a.pm.rows()[0].text).toContain('Rebind');
    const b = setup();
    b.lock.v = { supported: true, locked: true };
    b.pm.show('dodge', 'dodge', 'prompt.dodge');
    expect(b.pm.rows()[0].text).toBe('Press Ctrl to dodge');
  });

  it('setVisible(false) pauses fades and keeps rows', () => {
    const { pm } = setup();
    pm.show('sprint', 'sprint', 'prompt.sprint');
    pm.success('sprint');
    pm.success('sprint');
    pm.update(0.1);
    pm.setVisible(false);
    pm.update(10);
    expect(pm.rows()).toEqual([]);
    pm.setVisible(true);
    expect(pm.rows()[0].opacity).toBeCloseTo(0.75, 5);
    pm.update(0.1);
    expect(pm.rows()[0].opacity).toBeCloseTo(0.5, 5);
  });

  describe('persistence', () => {
    it('round trips and rewrites flags', () => {
      const a = setup();
      a.pm.success('sprint');
      a.pm.success('sprint');
      a.pm.success('jump');
      const saved = JSON.parse(JSON.stringify(a.pm.serialize()));
      const b = setup();
      b.flags['prompt.map.count'] = 9;
      b.pm.load(saved);
      expect(b.pm.count('sprint')).toBe(2);
      expect(b.flags['prompt.sprint.count']).toBe(2);
      expect(b.flags['prompt.map.count']).toBe(0);
      expect(b.pm.serialize()).toEqual(saved);
      b.pm.load(saved);
      expect(b.pm.serialize()).toEqual(saved);
    });

    it('drops unknown mechanics and bad counts, corrupt shape gives empty', () => {
      const { pm } = setup();
      pm.load({ counts: { sprint: 3, bogus: 2, jump: -1, move: NaN, block: Infinity, map: '2' }, rebindOfferShown: true });
      expect(pm.serialize()).toEqual({ counts: { sprint: 3 }, rebindOfferShown: true });
      for (const bad of [null, [], 'x', 5, { counts: [] }, { counts: 'x' }]) {
        pm.load(bad);
        expect(pm.serialize()).toEqual({ counts: {}, rebindOfferShown: false });
      }
    });

    it('after load with counts >= 2 a recently unused prompt still shows (no recent use)', () => {
      const { pm } = setup();
      pm.load({ counts: { sprint: 2 } });
      pm.show('sprint', 'sprint', 'prompt.sprint');
      expect(pm.rows()).toHaveLength(1);
      pm.success('sprint');
      expect(pm.rows()[0].state).toBe('fading');
    });

    it('does not show the rebind offer again after load', () => {
      const { pm } = setup();
      pm.load({ counts: {}, rebindOfferShown: true });
      pm.show('dodge', 'dodge', 'prompt.dodge');
      expect(pm.rows()[0].text).toBe('Press Ctrl to dodge');
    });
  });

  it('MECHANICS covers the contract list', () => {
    expect(MECHANICS).toHaveLength(22);
    expect(new Set(MECHANICS).size).toBe(22);
    expect(MECHANICS).toContain('wardstone-strike');
    expect(MECHANICS).toContain('lockSwap');
  });
});

describe('review fixes', () => {
  it('hide() forgets a faded prompt so hints-always does not bring it back', () => {
    const { pm } = setup();
    pm.show('move', 'move', 'prompt.move');
    pm.success('move');
    pm.success('move');
    pm.update(1);
    pm.hide('move');
    pm.showHintsAlways = true;
    expect(pm.rows()).toEqual([]);
  });

  it('hide() with no id also forgets every faded prompt', () => {
    const { pm } = setup();
    pm.show('sprint', 'sprint', 'prompt.sprint');
    pm.success('sprint');
    pm.success('sprint');
    pm.update(1);
    pm.hide();
    pm.showHintsAlways = true;
    expect(pm.rows()).toEqual([]);
  });
});
