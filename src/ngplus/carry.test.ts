// G3 New Game+: the Second Hearth save transform (design 12.5 carries and resets).
import { describe, expect, it } from 'vitest';
import { AFTER_ENDING_FLAG, M56_CHOICE_FLAG } from '../afterEnding/flags';
import { buildSecondHearth, cycleOf, isEndedSave, readNgPlus, stripQuestItems } from './carry';
import { CARRIED_KEYS, NGPLUS_KEY, TUTORIAL_NOT_BEGUN } from './tuning';

const KINDS: Record<string, string> = { sword: 'weapon', 'key.seal': 'quest', letter: 'quest', 'crossbow-bolts': 'quest', flask: 'consumable', ring: 'trinket' };
const kindOf = (id: string) => KINDS[id];

function ended(over: { choice?: string; ngplus?: unknown; flags?: Record<string, unknown>; drop?: string[] } = {}): any {
  const entries: Record<string, { version: number; data: unknown }> = {
    progression: { version: 2, data: { xp: 109000, classId: 'knight', learned: ['knight.rimBash'] } },
    inventory: {
      version: 3,
      data: {
        gold: 350,
        items: { sword: 1, 'key.seal': 1, letter: 2, 'crossbow-bolts': 30, flask: 4, ring: 1, mystery: 1 },
        equipped: { weapon: 'sword', trinket: 'letter' },
        gear: { sword: { temper: 5 }, letter: { temper: 1 } },
      },
    },
    gear: { version: 1, data: { anvilTiers: [2, 3] } },
    classes: { version: 1, data: { starterGranted: ['knight'] } },
    codex: { version: 1, data: { read: ['a'] } },
    prompts: { version: 1, data: { counts: {} } },
    cinderlands: { version: 1, data: { embers: 900 } },
    quests: { version: 2, data: { quests: { m56: { state: 'completed' } } } },
    'world-state': { version: 1, data: { flags: { [AFTER_ENDING_FLAG]: true, [M56_CHOICE_FLAG]: over.choice ?? 'rekindle', ...over.flags }, favour: { halvard: 70 } } },
    waystones: { version: 1, data: { lit: ['kettlewick'] } },
    companions: { version: 2, data: { active: ['hrolf'] } },
    mount: { version: 1, data: {} },
    map: { version: 2, data: { fog: 'x' } },
    tutorial: { version: 1, data: { complete: true } },
    'player-position': { version: 1, data: { x: 11000, y: 295, z: 6750, yaw: 0 } },
  };
  if (over.ngplus !== undefined) entries[NGPLUS_KEY] = { version: 1, data: over.ngplus };
  for (const k of over.drop ?? []) delete entries[k];
  return { format: 1, savedAt: 1, reason: 'manual', playtimeSeconds: 360000, entries };
}

describe('buildSecondHearth (G3)', () => {
  it('keeps the carried entries, drops the rest, and starts cycle 1', () => {
    const r = buildSecondHearth(ended(), kindOf, 77);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const keys = Object.keys(r.file.entries).sort();
    expect(keys).toEqual([...CARRIED_KEYS, 'tutorial'].sort());
    expect(r.file.entries.progression!.data).toEqual({ xp: 109000, classId: 'knight', learned: ['knight.rimBash'] });
    expect(r.file.entries.cinderlands!.data).toEqual({ embers: 900 });
    expect(r.file.entries.tutorial).toEqual(TUTORIAL_NOT_BEGUN);
    expect(r.file.entries[NGPLUS_KEY]!.data).toEqual({ cycle: 1, endingsSeen: ['rekindle'], fresh: true });
    expect(r.file.savedAt).toBe(77);
    expect(r.file.playtimeSeconds).toBe(360000);
    expect(cycleOf(r.file)).toBe(1);
    expect(isEndedSave(r.file)).toBe(false);
  });

  it('strips quest items (and their equip and gear records) but keeps ammunition, gear, consumables, gold and unknown ids', () => {
    const r = buildSecondHearth(ended(), kindOf, 1);
    if (!r.ok) throw new Error(r.reason);
    const inv = r.file.entries.inventory!.data as any;
    expect(inv.items).toEqual({ sword: 1, 'crossbow-bolts': 30, flask: 4, ring: 1, mystery: 1 });
    expect(inv.equipped).toEqual({ weapon: 'sword' });
    expect(inv.gear).toEqual({ sword: { temper: 5 } });
    expect(inv.gold).toBe(350);
  });

  it('counts up from an earlier cycle and lists each ending once', () => {
    const second = buildSecondHearth(ended({ choice: 'let-it-die', ngplus: { cycle: 1, endingsSeen: ['rekindle'] } }), kindOf, 1);
    expect(second.ok && second.state).toEqual({ cycle: 2, endingsSeen: ['rekindle', 'let-it-die'], fresh: true });
    const third = buildSecondHearth(ended({ choice: 'rekindle', ngplus: { cycle: 2, endingsSeen: ['rekindle', 'let-it-die'] } }), kindOf, 1);
    expect(third.ok && third.state).toEqual({ cycle: 3, endingsSeen: ['rekindle', 'let-it-die'], fresh: true });
  });

  it('leaves the ended save untouched (it is parked, not replaced)', () => {
    const e = ended();
    const before = JSON.stringify(e);
    const r = buildSecondHearth(e, kindOf, 1);
    if (!r.ok) throw new Error(r.reason);
    (r.file.entries.progression!.data as any).xp = 0;
    expect(JSON.stringify(e)).toBe(before);
  });

  it('refuses a save before the ending, a corrupt one and a newer one', () => {
    expect(buildSecondHearth(ended({ flags: { [AFTER_ENDING_FLAG]: false } }), kindOf, 1)).toEqual({ ok: false, reason: 'not-ended' });
    expect(buildSecondHearth({ nope: 1 }, kindOf, 1)).toEqual({ ok: false, reason: 'corrupt' });
    expect(buildSecondHearth({ ...ended(), format: 9 }, kindOf, 1)).toEqual({ ok: false, reason: 'newer' });
    expect(buildSecondHearth(ended({ drop: ['world-state'] }), kindOf, 1)).toEqual({ ok: false, reason: 'not-ended' });
  });

  it('edge: missing carried entries stay missing; a malformed ngplus entry reads as a first playthrough', () => {
    const r = buildSecondHearth(ended({ drop: ['inventory', 'cinderlands', 'codex'], ngplus: { cycle: -3, endingsSeen: 'x' } }), kindOf, 1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.file.entries.inventory).toBeUndefined();
    expect(r.file.entries.cinderlands).toBeUndefined();
    expect(r.state).toEqual({ cycle: 1, endingsSeen: ['rekindle'], fresh: true });
    expect(readNgPlus(null)).toEqual({ cycle: 0, endingsSeen: [] });
    expect(readNgPlus({ cycle: 2.5, endingsSeen: ['a', 'a', 3] })).toEqual({ cycle: 0, endingsSeen: ['a'] });
    expect(stripQuestItems('odd', kindOf)).toBe('odd');
  });
});
