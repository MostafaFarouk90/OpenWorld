// K11 PR 1: grantMasterBook and the { grantMasterBook } effect (Q2: a one-time master visit opens tiers 4 and 5).
import { describe, expect, it } from 'vitest';
import { MASTER_BOOK_CLASSES, grantMasterBook, hasMasterBook, masterBookToastKey } from './masterBooks';
import { Progression } from './Progression';
import { fakeActor } from './testkit';
import { SKILL_STRINGS_EN } from './strings.en';
import { createEffectRunner } from '../quests/effects';
import { validateEffects } from '../quests/validate';
import { validateDialogueEffects } from '../dialogue/validate';
import type { EffectEnv } from '../quests/ports';
import type { Effect, FlagValue } from '../quests/types';
import { GameEvents } from '../core/events';
import { WorldState } from '../state/WorldState';
import { ACT3_FLAG_OWNERS } from '../quests/lint/act3Flags';

function store(init: Record<string, FlagValue> = {}) {
  const flags = new Map<string, FlagValue>(Object.entries(init));
  const emitted: { type: string; payload: unknown }[] = [];
  return {
    flags,
    emitted,
    state: { getFlag: (k: string) => flags.get(k), setFlag: (k: string, v: boolean) => void flags.set(k, v) },
    bus: { emit: (type: string, payload?: unknown) => void emitted.push({ type, payload }) },
  };
}

function env(s: ReturnType<typeof store>): EffectEnv {
  return {
    state: {
      getFlag: (k) => s.flags.get(k),
      setFlag: (k, v) => void s.flags.set(k, v),
      clearFlag: (k) => void s.flags.delete(k),
      favour: () => 0,
      favourBand: () => 'cold',
      addFavour: () => 0,
    },
    quests: { state: () => 'inactive', objectiveDone: () => false, start: () => true, complete: () => true, completeObjective: () => true },
    bus: { on: () => () => {}, emit: s.bus.emit },
    sourceId: 'dialogue:test',
  };
}

describe('grantMasterBook', () => {
  it('writes the class flag once, with the event and the toast', () => {
    const s = store({ 'story.gate.a3': true });
    expect(grantMasterBook(s.state, 'knight', s.bus)).toEqual({ ok: true, granted: true });
    expect(s.flags.get('trainer.knight.masterBook')).toBe(true);
    expect(s.emitted).toEqual([
      { type: 'trainer.masterBook', payload: { classId: 'knight' } },
      { type: 'hud.toast', payload: { textKey: 'hud.skills.masterBook.knight' } },
    ]);
    expect(hasMasterBook(s.state, 'knight')).toBe(true);
    expect(hasMasterBook(s.state, 'warden')).toBe(false);
  });

  it('is idempotent: a second grant (Leofa after Cenric) writes and emits nothing', () => {
    const s = store();
    grantMasterBook(s.state, 'pathfinder', s.bus);
    s.emitted.length = 0;
    expect(grantMasterBook(s.state, 'pathfinder', s.bus)).toEqual({ ok: true, granted: false });
    expect(s.emitted).toEqual([]);
  });

  it('refuses an unknown class and writes nothing', () => {
    const s = store();
    for (const bad of ['', 'rogue', 'Knight', 'trainer.knight']) {
      expect(grantMasterBook(s.state, bad, s.bus)).toEqual({ ok: false, reason: 'unknown-class' });
    }
    expect(s.flags.size).toBe(0);
    expect(s.emitted).toEqual([]);
  });

  it('works without a bus and does not need story.gate.a3', () => {
    const s = store();
    expect(grantMasterBook(s.state, 'warden')).toEqual({ ok: true, granted: true });
    expect(s.flags.get('story.gate.a3')).toBeUndefined();
  });

  it('Hrolf before Act 3: the early toast, then the learn is refused with the Act 3 text until the gate opens', () => {
    const s = store();
    grantMasterBook(s.state, 'warden', s.bus);
    expect(s.emitted[1]).toEqual({ type: 'hud.toast', payload: { textKey: 'hud.skills.masterBook.warden.early' } });
    const p = new Progression({
      emit: () => {},
      logger: { warn: () => {} },
      actor: () => fakeActor(),
      flags: { get: (k: string) => s.flags.get(k) as boolean | undefined, set: (k: string, v: boolean) => void s.flags.set(k, v) },
    });
    p.load({ xp: 0, storyPoints: 7, learned: ['knight.rimBash', 'knight.ironStance', 'knight.oathward'], bar: [], classId: null, respecUsed: false });
    // The Knight rows stand in for any class: before Act 3 the refusal is the Act 3 text whatever book is held.
    s.flags.set('trainer.knight.masterBook', true);
    expect(p.canLearn('knight.bastionWall')).toMatchObject({ ok: false, reason: 'master', textKey: 'hud.skills.act3' });
    s.flags.set('story.gate.a3', true);
    expect(p.canLearn('knight.bastionWall')).toEqual({ ok: true });
  });

  it('a store that throws: write-failed, and no event', () => {
    const s = store();
    const throwing = { getFlag: s.state.getFlag, setFlag: () => { throw new Error('invalid key'); } };
    expect(grantMasterBook(throwing, 'knight', s.bus)).toEqual({ ok: false, reason: 'write-failed' });
    expect(s.emitted).toEqual([]);
  });

  it('the flag survives a save and load on the real WorldState', () => {
    const ws = new WorldState(new GameEvents(() => {}), () => {});
    expect(grantMasterBook(ws, 'emberwright')).toEqual({ ok: true, granted: true });
    const data = JSON.parse(JSON.stringify(ws.serialize()));
    const back = new WorldState(new GameEvents(() => {}), () => {});
    back.load(data);
    expect(hasMasterBook(back, 'emberwright')).toBe(true);
    expect(grantMasterBook(back, 'emberwright')).toEqual({ ok: true, granted: false });
  });

  it('every class has both toast strings', () => {
    for (const c of MASTER_BOOK_CLASSES) {
      expect(SKILL_STRINGS_EN[masterBookToastKey(c, true)], c).toBeTruthy();
      expect(SKILL_STRINGS_EN[masterBookToastKey(c, false)], c).toBeTruthy();
    }
  });

  it('the flag-owner table names K11 for trainer.<classId>.masterBook', () => {
    expect(ACT3_FLAG_OWNERS.find((r) => r.pattern === 'trainer.<classId>.masterBook')?.owner).toBe('K11');
  });
});

describe('the { grantMasterBook } effect', () => {
  it('runs through the effect runner', () => {
    const s = store({ 'story.gate.a3': true });
    const r = createEffectRunner(env(s)).run([{ grantMasterBook: 'ashblade' }]);
    expect(r[0].ok).toBe(true);
    expect(s.flags.get('trainer.ashblade.masterBook')).toBe(true);
    expect(s.emitted.map((e) => e.type)).toEqual(['trainer.masterBook', 'hud.toast']);
  });

  it('an unknown class is an error result and the rest of the list still runs', () => {
    const s = store();
    const r = createEffectRunner(env(s)).run([{ grantMasterBook: 'bard' }, { setFlag: 'story.test.after', value: true }]);
    expect(r[0].ok).toBe(false);
    expect(r[1].ok).toBe(true);
    expect(s.emitted).toEqual([]);
    expect([...s.flags.keys()]).toEqual(['story.test.after']);
  });

  it('content cannot forge trainer.masterBook through the { event } effect', () => {
    expect(validateEffects([{ event: 'trainer.masterBook', payload: { classId: 'knight' } }]).length).toBe(1);
    const s = store();
    expect(createEffectRunner(env(s)).run([{ event: 'trainer.masterBook' }])[0].ok).toBe(false);
    expect(s.emitted).toEqual([]);
  });

  it('both validators accept the five classes and reject anything else', () => {
    for (const c of MASTER_BOOK_CLASSES) {
      const e: Effect[] = [{ grantMasterBook: c }];
      expect(validateEffects(e)).toEqual([]);
      expect(validateDialogueEffects(e, 'node')).toEqual([]);
    }
    for (const bad of ['', 'bard', 3]) {
      const e = [{ grantMasterBook: bad }] as unknown as Effect[];
      expect(validateEffects(e).length, String(bad)).toBe(1);
      expect(validateDialogueEffects(e, 'node').length, String(bad)).toBe(1);
    }
  });

  it('chain: learn refused in Act 3, the master gives the book, learn allowed', () => {
    const s = store({ 'story.gate.a3': true });
    const p = new Progression({
      emit: () => {},
      logger: { warn: () => {} },
      actor: () => fakeActor(),
      flags: { get: (k: string) => s.flags.get(k) as boolean | undefined, set: (k: string, v: boolean) => void s.flags.set(k, v) },
    });
    p.load({ xp: 0, storyPoints: 7, learned: ['knight.rimBash', 'knight.ironStance', 'knight.oathward'], bar: [], classId: null, respecUsed: false });
    expect(p.canLearn('knight.bastionWall')).toMatchObject({ ok: false, reason: 'master', textKey: 'hud.skills.master.knight' });
    createEffectRunner(env(s)).run([{ grantMasterBook: 'knight' }]);
    expect(p.learn('knight.bastionWall')).toEqual({ ok: true });
  });
});
