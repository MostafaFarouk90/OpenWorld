// v0.9 item 16: the `?act5=` jump's tables and runner (Act 5 steps only; the Act 1 to 4 replay is act4Jump's).
import { describe, expect, it, vi } from 'vitest';
import {
  ACT5_DIRECT,
  ACT5_GIVERS,
  ACT5_JUMP_IDS,
  ACT5_PREREQS,
  ACT5_PRESET_FAVOUR,
  ACT5_START_XP,
  Act5Jump,
  act5Landing,
  act5PhaseOf,
  parseAct5,
  presetLiveFavour,
  presetSnapshots,
  type Act5JumpPorts,
} from './act5Jump';
import { QUIET_TICKS } from './act4Jump';
import { FOUNDRY_OPEN_FLAG, RIM_CAMP_POINT, RIMFOOT_POINT, RIM_GATE_OPEN_FLAG } from '../region/act5Regions';
import { ACT5_QUEST_IDS } from './lint/act5Ids';
import { snapshotFlag } from '../state/favour';
import { getActJump } from './actJump';

describe('Act 5 jump tables', () => {
  it('covers every Act 5 quest id, once, in play order', () => {
    expect([...ACT5_JUMP_IDS].sort()).toEqual([...ACT5_QUEST_IDS].sort());
    expect(new Set(ACT5_JUMP_IDS).size).toBe(ACT5_JUMP_IDS.length);
    expect(ACT5_JUMP_IDS).toHaveLength(17);
    for (const id of ACT5_JUMP_IDS) {
      expect(ACT5_DIRECT[id], id).toBeDefined();
      expect(ACT5_GIVERS[id], id).toBeTruthy();
      // every prerequisite comes earlier in play order
      for (const q of ACT5_PREREQS[id]) expect(ACT5_JUMP_IDS.indexOf(q), `${id} <- ${q}`).toBeLessThan(ACT5_JUMP_IDS.indexOf(id));
    }
  });
  it('M52 needs M47 to M51 and R26; R29 is optional', () => {
    expect(ACT5_PREREQS.m52).toEqual(['m47', 'm48', 'm49', 'r26', 'm50', 'm51']);
  });
  it('M54 needs D09 and R27 only (R28 and R30 optional)', () => {
    expect(ACT5_DIRECT.m54).toEqual(['d09', 'r27']);
    expect(ACT5_PREREQS.m54).not.toContain('r28');
    expect(ACT5_PREREQS.m54).not.toContain('r30');
    expect(ACT5_PREREQS.m54).not.toContain('r29');
    expect(ACT5_PREREQS.m56).toContain('d10');
  });
  it('M47 has no Act 5 prerequisite; registered as act 5', () => {
    expect(ACT5_PREREQS.m47).toEqual([]);
    expect(getActJump(5)?.prereqs.m52).toEqual(ACT5_PREREQS.m52);
  });
  it('phases', () => {
    expect(act5PhaseOf('m52')).toBe('I');
    expect(act5PhaseOf('d09')).toBe('J');
    expect(act5PhaseOf('m46')).toBeUndefined();
  });
  it('ACT5_START_XP is the measured Act 4 end, 98,800 (N12 PR 1, ruling A)', () => expect(ACT5_START_XP).toBe(98_800));
});

describe('favour presets', () => {
  it('snapshots: none before M52, M52 from the siege on, D09 from the Foundry door, M56 at M56', () => {
    expect(presetSnapshots('m51')).toEqual([]);
    expect(presetSnapshots('m52')).toEqual(['m52']);
    expect(presetSnapshots('r28')).toEqual(['m52']);
    expect(presetSnapshots('d09')).toEqual(['m52', 'd09']);
    expect(presetSnapshots('m56')).toEqual(['m52', 'd09', 'm56']);
    expect(presetSnapshots('nope')).toEqual([]);
  });
  it('live favour: M52 numbers before D09, the final favour after it', () => {
    expect(presetLiveFavour('marshal', 'm47').halvard).toBe(71);
    expect(presetLiveFavour('marshal', 'd09').halvard).toBe(71);
    expect(presetLiveFavour('marshal', 'm54').halvard).toBe(75);
    expect(presetLiveFavour('keepers', 'm56').ashwalkers).toBe(61);
  });
  it('the two worked playthroughs differ where the design says: Halvard high for the marshal, dragons and Ashwalkers for the keepers', () => {
    expect(ACT5_PRESET_FAVOUR.marshal.m52[0]).toBeGreaterThanOrEqual(70);
    expect(ACT5_PRESET_FAVOUR.keepers.m52[3]).toBeGreaterThanOrEqual(50);
    expect(ACT5_PRESET_FAVOUR.marshal.d09).toEqual(ACT5_PRESET_FAVOUR.marshal.m52);
  });
});

describe('parseAct5', () => {
  it('reads id, class and preset; null without act5', () => {
    expect(parseAct5('?act5=m52&new&favour=marshal')).toEqual({ id: 'm52', classId: 'knight', favour: 'marshal', fresh: true });
    expect(parseAct5('?act5=m47&new&class=ashblade')).toMatchObject({ classId: 'ashblade', favour: null });
    expect(parseAct5('?act4=m40&new')).toBeNull();
  });
  it('refuses an unknown id, a missing &new, an unknown class or preset', () => {
    expect(parseAct5('?act5=m99&new')).toHaveProperty('error');
    expect(parseAct5('?act5=m47')).toHaveProperty('error');
    expect(parseAct5('?act5=m47&new&class=bard')).toHaveProperty('error');
    expect(parseAct5('?act5=m47&new&favour=dragons')).toHaveProperty('error');
  });
});

describe('landing', () => {
  it('in front of a placed giver, facing them', () => {
    const l = act5Landing('m48', { x: 100, y: 5, z: 200, yaw: 0 });
    expect(l.giver).toBe(true);
    expect(l.at.z).toBeLessThan(200);
    expect(l.yaw).toBeCloseTo(Math.PI);
  });
  it('Rimfoot for M47, the Rim Camp for the rest, without a giver', () => {
    expect(act5Landing('m47', undefined).at).toEqual({ x: RIMFOOT_POINT.x, z: RIMFOOT_POINT.z });
    expect(act5Landing('m53', undefined).at).toEqual({ x: RIM_CAMP_POINT.x, z: RIM_CAMP_POINT.z });
  });
});

function ports() {
  const flags = new Map<string, unknown>();
  const favour = new Map<string, number>();
  const states = new Map<string, string>();
  const placed: { at: unknown; yaw: number }[] = [];
  const p = {
    setFlag: (k: string, v: boolean) => flags.set(k, v),
    setFlagValue: (k: string, v: unknown) => flags.set(k, v),
    setFavourTo: (t: string, v: number) => favour.set(t, v),
    hasQuest: () => true,
    quests: {
      state: (q: string) => states.get(q) ?? 'inactive',
      start: (q: string) => states.set(q, 'active'),
      complete: (q: string) => (states.set(q, 'completed'), true),
    },
    warn: vi.fn(),
    topUpXp: vi.fn(),
    closeDialogue: () => false,
    quiet: vi.fn(),
    giverPose: () => undefined,
    placePose: (at: unknown, yaw: number) => (placed.push({ at, yaw }), true),
  };
  return { p: p as unknown as Act5JumpPorts, flags, favour, states, placed, raw: p };
}

function runToEnd(j: Act5Jump) {
  for (let i = 0; i < QUIET_TICKS + 5 && !j.finished; i++) j.tick();
}

describe('the Act 5 steps on a carried save', () => {
  it('M47: gate set, the Rim Gate stays shut, no Foundry hold, XP topped up, lands at Rimfoot', () => {
    const t = ports();
    const j = new Act5Jump('m47', t.p).fromCarriedSave();
    runToEnd(j);
    expect(j.finished).toBe(true);
    expect(t.flags.get(RIM_GATE_OPEN_FLAG)).toBeUndefined();
    expect(t.flags.get(FOUNDRY_OPEN_FLAG)).toBeUndefined();
    expect(t.raw.topUpXp).toHaveBeenCalledWith(ACT5_START_XP);
    expect(t.placed[0].at).toEqual({ x: RIMFOOT_POINT.x, z: RIMFOOT_POINT.z });
  });
  it('M54: prerequisites completed, both opening flags set', () => {
    const t = ports();
    runToEnd(new Act5Jump('m54', t.p).fromCarriedSave());
    for (const q of ACT5_PREREQS.m54) {
      expect(t.states.get(q), q).toBe('completed');
      expect(t.flags.get(`story.${q}.complete`)).toBe(true);
    }
    expect(t.states.get('m54')).toBeUndefined();
    expect(t.flags.get(RIM_GATE_OPEN_FLAG)).toBe(true);
    expect(t.flags.get(FOUNDRY_OPEN_FLAG)).toBe(true);
  });
  it('&favour=marshal at M52 writes the choice flags, the live tracks and the M52 snapshot', () => {
    const t = ports();
    runToEnd(new Act5Jump('m52', t.p, 'knight', 'marshal').fromCarriedSave());
    expect(t.flags.get('story.m21.choice')).toBe('confront');
    expect(t.favour.get('halvard')).toBe(71);
    expect(t.flags.get(snapshotFlag('m52', 'taken'))).toBe(true);
    expect(t.flags.get(snapshotFlag('m52', 'halvard'))).toBe(71);
    expect(t.flags.get(snapshotFlag('d09', 'taken'))).toBeUndefined();
  });
  it('a preset without the flag ports warns and is skipped', () => {
    const t = ports();
    const { setFlagValue: _a, setFavourTo: _b, ...rest } = t.raw;
    const j = new Act5Jump('m52', rest as unknown as Act5JumpPorts, 'knight', 'keepers').fromCarriedSave();
    runToEnd(j);
    expect(j.finished).toBe(true);
    expect(t.raw.warn).toHaveBeenCalledWith(expect.stringMatching(/favour preset/));
  });
});
