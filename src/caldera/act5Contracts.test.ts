// v0.9 items 9, 11, 13 and 17: the shield line, the final ending row, the pushed-mode priorities and the music slots.
import { describe, expect, it } from 'vitest';
import { ShieldLine, SHIELD_LINE_WINDOW_S } from '../enemies/shieldLine';
import { ACT5_ENDING, actEnding, finalEnding } from '../integration/actEndings';
import { PUSHED_MODE_PRIORITY } from '../movement/types';
import { ACT5_BOSS_MIX_KEYS, CREDITS_VERSE_FLAG, ENDING_THEME_IDS, SIEGE_MIX_KEY, ULTHRED_PHASE_MIX_KEYS } from '../music/act5Slots';
import { ACT5_BOSS_IDS } from '../bosses/act5Bosses';
import { AFTER_ENDING_FLAG, END_GATE_FLAG, M56_CHOICE_FLAG } from '../region/act5Regions';

function line() {
  const l = new ShieldLine('m52.line.1');
  l.join('s1', 'shield');
  l.join('s2', 'shield');
  l.join('p1', 'pike');
  l.join('t1', 'torch');
  return l;
}

describe('the shield line', () => {
  it('two shield staggers within 1 s break it; everyone staggered in the window kneels', () => {
    const l = line();
    expect(SHIELD_LINE_WINDOW_S).toBe(1);
    expect(l.staggered('p1', 10)).toEqual([]);
    expect(l.staggered('s1', 10.3)).toEqual([]);
    expect(l.staggered('s2', 10.9).sort()).toEqual(['p1', 's1', 's2']);
    expect(l.broken).toBe(true);
  });
  it('two shield staggers more than 1 s apart do not', () => {
    const l = line();
    l.staggered('s1', 10);
    expect(l.staggered('s2', 11.2)).toEqual([]);
    expect(l.broken).toBe(false);
  });
  it('a pike and a torch never break it alone; a single shield twice does not either', () => {
    const l = line();
    l.staggered('p1', 1);
    l.staggered('t1', 1.1);
    l.staggered('s1', 1.2);
    expect(l.staggered('s1', 1.4)).toEqual([]);
    expect(l.broken).toBe(false);
  });
  it('once broken, each later stagger kneels that member alone; a reset makes it whole', () => {
    const l = line();
    l.staggered('s1', 0);
    l.staggered('s2', 0.5);
    expect(l.staggered('t1', 5)).toEqual(['t1']);
    l.reset();
    expect(l.broken).toBe(false);
    expect(l.staggered('t1', 6)).toEqual([]);
  });
  it('ignores unknown members, a bad clock, and members who left', () => {
    const l = line();
    expect(l.staggered('ghost', 1)).toEqual([]);
    expect(l.staggered('s1', NaN)).toEqual([]);
    l.leave('s2');
    expect(l.size).toBe(3);
    l.staggered('s1', 1);
    expect(l.staggered('s2', 1.2)).toEqual([]);
    expect(l.broken).toBe(false);
  });
});

describe('the final ending row', () => {
  it('is separate from the camp rows and names the plan flags', () => {
    expect(finalEnding()).toBe(ACT5_ENDING);
    expect(actEnding(5)).toBeUndefined();
    expect(ACT5_ENDING.requires).toEqual(['m56']);
    expect(ACT5_ENDING.gateFlag).toBe(END_GATE_FLAG);
    expect(ACT5_ENDING.choiceFlag).toBe(M56_CHOICE_FLAG);
    expect(ACT5_ENDING.afterState).toBe(AFTER_ENDING_FLAG);
    expect(Object.keys(ACT5_ENDING.cutscenes).sort()).toEqual(['let-it-die', 'rekindle']);
    expect(Object.keys(ACT5_ENDING.cards)).toHaveLength(3);
  });
});

describe('pushed movement modes', () => {
  it('scene over siege over arena over escort over storm and the lava stair', () => {
    const p = PUSHED_MODE_PRIORITY;
    expect(p.scene).toBeGreaterThan(p.siege);
    expect(p.siege).toBeGreaterThan(p.arena);
    expect(p.arena).toBeGreaterThan(p.escort);
    expect(p.escort).toBeGreaterThan(p.storm);
    expect(p['lava-stair']).toBe(p.storm);
  });
});

describe('Act 5 music slots', () => {
  it('one boss mix per Act 5 boss, three Ulthred phases, a siege mix, two ending themes, the credits verse flag', () => {
    expect([...ACT5_BOSS_MIX_KEYS].sort()).toEqual(Object.values(ACT5_BOSS_IDS).sort());
    expect(ULTHRED_PHASE_MIX_KEYS).toHaveLength(3);
    expect(SIEGE_MIX_KEY).toBe('siege');
    expect(ENDING_THEME_IDS).toHaveLength(2);
    expect(CREDITS_VERSE_FLAG.startsWith('story.r30.')).toBe(true);
  });
});
