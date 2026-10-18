import { describe, expect, it, vi } from 'vitest';
import { GameEvents, type GameEventMap } from '../core/events';
import { PersistRegistry } from '../core/Persist';
import { BOSS_MERCY_MAX, CREATURE_MERCY_CAP, FAVOUR_START, FAVOUR_TRACKS, bandFor, isFavourTrack, type FavourTrack } from './favour';
import { FLAG_KEY, WORLD_STATE_KEY, WORLD_STATE_VERSION, WorldState } from './WorldState';

function make() {
  const events = new GameEvents(() => {});
  const warn = vi.fn();
  const ws = new WorldState(events, warn);
  const seen: { type: keyof GameEventMap; payload: unknown }[] = [];
  events.onAny((type, payload) => seen.push({ type, payload }));
  const of = <K extends keyof GameEventMap>(t: K) => seen.filter((s) => s.type === t).map((s) => s.payload as GameEventMap[K]);
  return { events, ws, warn, seen, of };
}

const mercy = (over: Record<string, unknown> = {}) =>
  ({ verb: 'spare', tier: 'normal', track: 'halvard', creature: 'wolf', ...over }) as never;

describe('favour helpers', () => {
  it('five starting values', () => {
    expect(FAVOUR_START).toEqual({ halvard: 30, oswin: 20, grisel: 20, dragons: 10, ashwalkers: 15 });
    expect(FAVOUR_TRACKS).toHaveLength(5);
  });
  it('band edges 24/25, 49/50, 69/70', () => {
    expect(bandFor(0)).toBe('cold');
    expect(bandFor(24)).toBe('cold');
    expect(bandFor(24.9)).toBe('cold');
    expect(bandFor(25)).toBe('banked');
    expect(bandFor(49)).toBe('banked');
    expect(bandFor(50)).toBe('stoked');
    expect(bandFor(69)).toBe('stoked');
    expect(bandFor(70)).toBe('hearthbound');
    expect(bandFor(100)).toBe('hearthbound');
  });
  it('isFavourTrack accepts only the five tracks', () => {
    for (const t of FAVOUR_TRACKS) expect(isFavourTrack(t)).toBe(true);
    for (const v of ['bogus', '', null, undefined, 3, {}, 'constructor']) expect(isFavourTrack(v)).toBe(false);
  });
});

describe('flags', () => {
  it('unknown flag reads undefined and typed fallbacks', () => {
    const { ws } = make();
    expect(ws.getFlag('quest.a.done')).toBeUndefined();
    expect(ws.hasFlag('quest.a.done')).toBe(false);
    expect(ws.getBool('quest.a.done')).toBe(false);
    expect(ws.getBool('quest.a.done', true)).toBe(true);
    expect(ws.getNumber('quest.a.n')).toBe(0);
    expect(ws.getNumber('quest.a.n', 7)).toBe(7);
    expect(ws.getString('quest.a.s')).toBe('');
    expect(ws.getString('quest.a.s', 'x')).toBe('x');
  });

  it('wrong-type reads give the fallback', () => {
    const { ws } = make();
    ws.setFlag('a.b', 5);
    ws.setFlag('a.c', 'text');
    ws.setFlag('a.d', true);
    expect(ws.getBool('a.b', true)).toBe(true);
    expect(ws.getString('a.b', 'f')).toBe('f');
    expect(ws.getNumber('a.c', 9)).toBe(9);
    expect(ws.getNumber('a.d', 9)).toBe(9);
    expect(ws.getBool('a.c')).toBe(false);
    expect(ws.getNumber('a.b')).toBe(5);
    expect(ws.getString('a.c')).toBe('text');
    expect(ws.getBool('a.d')).toBe(true);
  });

  it('falsy values are real values', () => {
    const { ws } = make();
    ws.setFlag('a.zero', 0);
    ws.setFlag('a.empty', '');
    ws.setFlag('a.false', false);
    expect(ws.hasFlag('a.zero')).toBe(true);
    expect(ws.hasFlag('a.empty')).toBe(true);
    expect(ws.hasFlag('a.false')).toBe(true);
    expect(ws.getNumber('a.zero', 5)).toBe(0);
    expect(ws.getString('a.empty', 'f')).toBe('');
  });

  it('set emits flag.changed with previous', () => {
    const { ws, of } = make();
    ws.setFlag('chest.bakery-barrel.opened', true);
    ws.setFlag('chest.bakery-barrel.opened', false);
    expect(of('flag.changed')).toEqual([
      { key: 'chest.bakery-barrel.opened', value: true, previous: undefined },
      { key: 'chest.bakery-barrel.opened', value: false, previous: true },
    ]);
  });

  it('setting the same value emits nothing', () => {
    const { ws, of } = make();
    ws.setFlag('a.b', 1);
    ws.setFlag('a.b', 1);
    expect(of('flag.changed')).toHaveLength(1);
  });

  it('1 and true are different values', () => {
    const { ws, of } = make();
    ws.setFlag('a.b', 1);
    ws.setFlag('a.b', true);
    expect(of('flag.changed')).toHaveLength(2);
  });

  it.each(['', 'nodot', 'Upper.case', '1abc.x', 'a.', '.a', 'a..b', 'a b.c', 'a.b c', 'tutorial.t04.vow1!'])('invalid key %j throws', (key) => {
    const { ws, of } = make();
    expect(() => ws.setFlag(key, true)).toThrow(/invalid flag key/);
    expect(of('flag.changed')).toEqual([]);
  });

  it.each(['a.b', 'tutorial.t04.vow1', 'chest.bakery-barrel.opened', 'door.bakery.open', 'aB.c_d-e', 'a.1'])('valid key %j', (key) => {
    expect(FLAG_KEY.test(key)).toBe(true);
    const { ws } = make();
    expect(() => ws.setFlag(key, 1)).not.toThrow();
  });

  it('undefined, NaN, Infinity, null, objects throw', () => {
    const { ws, of } = make();
    for (const v of [undefined, NaN, Infinity, -Infinity, null, {}, []]) {
      expect(() => ws.setFlag('a.b', v as never)).toThrow(/invalid value/);
    }
    expect(ws.hasFlag('a.b')).toBe(false);
    expect(of('flag.changed')).toEqual([]);
  });

  it('clear removes and emits with value undefined', () => {
    const { ws, of } = make();
    ws.setFlag('a.b', 'x');
    ws.clearFlag('a.b');
    expect(ws.hasFlag('a.b')).toBe(false);
    expect(of('flag.changed')[1]).toEqual({ key: 'a.b', value: undefined, previous: 'x' });
  });

  it('clearing a missing flag emits nothing', () => {
    const { ws, of } = make();
    ws.clearFlag('a.b');
    ws.clearFlag('not a key');
    expect(of('flag.changed')).toEqual([]);
  });

  it('flagsWith lists keys by prefix', () => {
    const { ws } = make();
    ws.setFlag('chest.a.opened', true);
    ws.setFlag('chest.b.opened', true);
    ws.setFlag('door.a.open', true);
    expect(ws.flagsWith('chest.').sort()).toEqual(['chest.a.opened', 'chest.b.opened']);
    expect(ws.flagsWith('nothing')).toEqual([]);
    expect(ws.flagsWith('').length).toBe(3);
  });

  it('events emitted during a dispatch are queued, not nested', () => {
    const { ws, events } = make();
    const log: string[] = [];
    events.on('flag.changed', (e) => {
      log.push(`start:${e.key}`);
      if (e.key === 'a.one') ws.setFlag('a.two', true);
      log.push(`end:${e.key}`);
    });
    ws.setFlag('a.one', true);
    expect(log).toEqual(['start:a.one', 'end:a.one', 'start:a.two', 'end:a.two']);
    expect(ws.getBool('a.two')).toBe(true); // state is applied immediately
  });
});

describe('favour tracks', () => {
  it('starts at the start values with bands', () => {
    const { ws } = make();
    for (const t of FAVOUR_TRACKS) expect(ws.favour(t)).toBe(FAVOUR_START[t]);
    expect(ws.favourBand('halvard')).toBe('banked');
    expect(ws.favourBand('dragons')).toBe('cold');
  });

  it('adds, emits favour.changed with delta, band and source', () => {
    const { ws, of } = make();
    expect(ws.addFavour('oswin', 10, 'quest')).toBe(10);
    expect(of('favour.changed')).toEqual([{ track: 'oswin', value: 30, previous: 20, delta: 10, source: 'quest', band: 'banked' }]);
  });

  it('clamps at 100 and returns the applied delta', () => {
    const { ws } = make();
    expect(ws.addFavour('halvard', 500, 'script')).toBe(70);
    expect(ws.favour('halvard')).toBe(100);
    expect(ws.addFavour('halvard', 5, 'script')).toBe(0);
  });

  it('clamps at 0 and returns the applied (negative) delta', () => {
    const { ws } = make();
    expect(ws.addFavour('dragons', -500, 'script')).toBe(-10);
    expect(ws.favour('dragons')).toBe(0);
    expect(ws.addFavour('dragons', -1, 'script')).toBe(0);
  });

  it('a clamped-to-nothing change emits nothing; a zero delta emits nothing', () => {
    const { ws, of } = make();
    ws.addFavour('halvard', 0, 'quest');
    ws.addFavour('halvard', 70, 'quest');
    ws.addFavour('halvard', 3, 'quest');
    expect(of('favour.changed')).toHaveLength(1);
  });

  it('non-finite delta is ignored with a warning', () => {
    const { ws, warn, of } = make();
    for (const d of [NaN, Infinity, -Infinity]) expect(ws.addFavour('halvard', d, 'quest')).toBe(0);
    expect(ws.favour('halvard')).toBe(30);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(of('favour.changed')).toEqual([]);
  });

  it('unknown track is ignored with a warning; favour() of unknown is 0', () => {
    const { ws, warn } = make();
    expect(ws.addFavour('bogus' as never, 5, 'quest')).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(ws.favour('bogus' as never)).toBe(0);
    expect(ws.favour('constructor' as never)).toBe(0);
  });

  it('fractional deltas apply exactly', () => {
    const { ws } = make();
    expect(ws.addFavour('halvard', 0.5, 'quest')).toBe(0.5);
    expect(ws.favour('halvard')).toBe(30.5);
  });
});

describe('mercy', () => {
  it('normal +1, elite +2, with source mercy; counts the mercy', () => {
    const { ws, of } = make();
    expect(ws.recordMercy(mercy())).toEqual({ applied: 1, capped: false });
    expect(ws.recordMercy(mercy({ tier: 'elite' }))).toEqual({ applied: 2, capped: false });
    expect(ws.favour('halvard')).toBe(33);
    expect(ws.creatureMercyFavour('halvard')).toBe(3);
    expect(ws.mercyCount()).toBe(2);
    expect(of('favour.changed').every((e) => e.source === 'mercy')).toBe(true);
  });

  it('creature cap +10 per track is reached exactly', () => {
    const { ws } = make();
    for (let i = 0; i < CREATURE_MERCY_CAP; i++) expect(ws.recordMercy(mercy()).applied).toBe(1);
    expect(ws.creatureMercyFavour('halvard')).toBe(10);
    expect(ws.favour('halvard')).toBe(40);
    const r = ws.recordMercy(mercy());
    expect(r).toEqual({ applied: 0, capped: true });
    expect(ws.favour('halvard')).toBe(40);
  });

  it('overflow applies partially (9 + elite 2 applies 1)', () => {
    const { ws } = make();
    for (let i = 0; i < 9; i++) ws.recordMercy(mercy());
    const r = ws.recordMercy(mercy({ tier: 'elite' }));
    expect(r).toEqual({ applied: 1, capped: true });
    expect(ws.creatureMercyFavour('halvard')).toBe(10);
  });

  it('past the cap still counts the mercy', () => {
    const { ws } = make();
    for (let i = 0; i < 12; i++) ws.recordMercy(mercy());
    expect(ws.mercyCount()).toBe(12);
  });

  it('the cap is per track', () => {
    const { ws } = make();
    for (let i = 0; i < 12; i++) ws.recordMercy(mercy());
    expect(ws.recordMercy(mercy({ track: 'oswin' })).applied).toBe(1);
  });

  it('a null track counts only: no favour, no event, no cap use', () => {
    const { ws, of } = make();
    expect(ws.recordMercy(mercy({ track: null }))).toEqual({ applied: 0, capped: false });
    expect(ws.mercyCount()).toBe(1);
    expect(of('favour.changed')).toEqual([]);
    for (const t of FAVOUR_TRACKS) expect(ws.creatureMercyFavour(t)).toBe(0);
  });

  it('mercy at 100 favour is clamped and burns no cap room', () => {
    const { ws } = make();
    ws.addFavour('halvard', 100, 'script');
    expect(ws.recordMercy(mercy())).toEqual({ applied: 0, capped: false });
    expect(ws.favour('halvard')).toBe(100);
    expect(ws.creatureMercyFavour('halvard')).toBe(0);
  });

  it('unknown verb or tier is ignored with a warning', () => {
    const { ws, warn } = make();
    expect(ws.recordMercy(mercy({ verb: 'smite' }))).toEqual({ applied: 0, capped: false });
    expect(ws.recordMercy(mercy({ tier: 'legendary' }))).toEqual({ applied: 0, capped: false });
    expect(ws.recordMercy(null as never)).toEqual({ applied: 0, capped: false });
    expect(warn).toHaveBeenCalledTimes(3);
    expect(ws.mercyCount()).toBe(0);
    expect(ws.favour('halvard')).toBe(30);
  });

  it('unknown track is ignored with a warning and not counted', () => {
    const { ws, warn } = make();
    expect(ws.recordMercy(mercy({ track: 'bogus' }))).toEqual({ applied: 0, capped: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(ws.mercyCount()).toBe(0);
  });

  describe('boss mercy', () => {
    it('is uncapped, applies its ledger amount and does not touch the creature cap', () => {
      const { ws } = make();
      for (let i = 0; i < 12; i++) ws.recordMercy(mercy({ track: 'ashwalkers' }));
      const before = ws.favour('ashwalkers');
      const r = ws.recordMercy(mercy({ tier: 'boss', track: 'ashwalkers', amount: 4, verb: 'release' }));
      expect(r).toEqual({ applied: 4, capped: false });
      expect(ws.favour('ashwalkers')).toBe(before + 4);
      expect(ws.creatureMercyFavour('ashwalkers')).toBe(10);
    });

    it('amount is validated: missing, negative, NaN, above BOSS_MERCY_MAX', () => {
      const { ws, warn } = make();
      for (const amount of [undefined, -1, NaN, Infinity, BOSS_MERCY_MAX + 1, '3']) {
        expect(ws.recordMercy(mercy({ tier: 'boss', amount }))).toEqual({ applied: 0, capped: false });
      }
      expect(warn).toHaveBeenCalledTimes(6);
      expect(ws.favour('halvard')).toBe(30);
    });

    it('amount 0 and BOSS_MERCY_MAX are accepted', () => {
      const { ws } = make();
      expect(ws.recordMercy(mercy({ tier: 'boss', amount: 0 })).applied).toBe(0);
      expect(ws.recordMercy(mercy({ tier: 'boss', amount: BOSS_MERCY_MAX })).applied).toBe(BOSS_MERCY_MAX);
    });

    it('a boss with a null track applies nothing', () => {
      const { ws } = make();
      expect(ws.recordMercy(mercy({ tier: 'boss', track: null, amount: 5 })).applied).toBe(0);
    });
  });

  describe('revoke', () => {
    it('returns exactly the credit, frees the cap room and emits mercy.revoked', () => {
      const { ws, of } = make();
      ws.recordMercy(mercy({ actorId: 'wolf#1' }));
      ws.recordMercy(mercy({ actorId: 'wolf#2', tier: 'elite' }));
      expect(ws.isMercied('wolf#1')).toBe(true);
      expect(ws.revokeMercy('wolf#2')).toBe(2);
      expect(ws.favour('halvard')).toBe(31);
      expect(ws.creatureMercyFavour('halvard')).toBe(1);
      expect(ws.isMercied('wolf#2')).toBe(false);
      expect(of('mercy.revoked')).toEqual([{ actorId: 'wolf#2', track: 'halvard', removed: 2 }]);
    });

    it('revoking twice removes nothing the second time and emits once', () => {
      const { ws, of } = make();
      ws.recordMercy(mercy({ actorId: 'w' }));
      expect(ws.revokeMercy('w')).toBe(1);
      expect(ws.revokeMercy('w')).toBe(0);
      expect(of('mercy.revoked')).toHaveLength(1);
    });

    it('an unknown actor revokes nothing and emits nothing', () => {
      const { ws, of } = make();
      expect(ws.revokeMercy('nobody')).toBe(0);
      expect(of('mercy.revoked')).toEqual([]);
    });

    it('a mercy without an actorId cannot be revoked', () => {
      const { ws } = make();
      ws.recordMercy(mercy());
      expect(ws.isMercied('')).toBe(false);
    });

    it('a null-track credit is revoked with removed 0 and still emits', () => {
      const { ws, of } = make();
      ws.recordMercy(mercy({ track: null, actorId: 'w' }));
      expect(ws.revokeMercy('w')).toBe(0);
      expect(of('mercy.revoked')).toEqual([{ actorId: 'w', track: null, removed: 0 }]);
    });

    it('a credit that applied 0 (past the cap) revokes 0 and does not free room', () => {
      const { ws } = make();
      for (let i = 0; i < 10; i++) ws.recordMercy(mercy());
      ws.recordMercy(mercy({ actorId: 'late' }));
      expect(ws.revokeMercy('late')).toBe(0);
      expect(ws.creatureMercyFavour('halvard')).toBe(10);
    });

    it('revokes only what is still removable when favour already dropped', () => {
      const { ws } = make();
      ws.recordMercy(mercy({ actorId: 'w', tier: 'elite' })); // 32
      ws.addFavour('halvard', -31, 'script'); // 1
      expect(ws.revokeMercy('w')).toBe(1);
      expect(ws.favour('halvard')).toBe(0);
    });

    it('boss credit is revocable but does not touch the creature cap', () => {
      const { ws } = make();
      ws.recordMercy(mercy({ tier: 'boss', amount: 4, actorId: 'boss' }));
      ws.recordMercy(mercy({ actorId: 'wolf' }));
      expect(ws.revokeMercy('boss')).toBe(4);
      expect(ws.creatureMercyFavour('halvard')).toBe(1);
    });

    it('a second mercy for the same actor replaces its credit', () => {
      const { ws } = make();
      ws.recordMercy(mercy({ actorId: 'w' }));
      ws.recordMercy(mercy({ actorId: 'w' }));
      expect(ws.revokeMercy('w')).toBe(1);
    });

    it('forgetMercy ends the window: no later revoke', () => {
      const { ws } = make();
      ws.recordMercy(mercy({ actorId: 'w' }));
      ws.forgetMercy('w');
      expect(ws.isMercied('w')).toBe(false);
      expect(ws.revokeMercy('w')).toBe(0);
      expect(ws.favour('halvard')).toBe(31);
      ws.forgetMercy('never');
    });
  });
});

describe('persistence', () => {
  it('implements Persistable with key and version', () => {
    const { ws } = make();
    expect(ws.key).toBe(WORLD_STATE_KEY);
    expect(ws.version).toBe(WORLD_STATE_VERSION);
    const reg = new PersistRegistry(() => {});
    expect(() => reg.register(ws)).not.toThrow();
  });

  it('serialize and load round trip, emitting no events on load', () => {
    const a = make();
    a.ws.setFlag('a.b', 5);
    a.ws.setFlag('a.c', 'x');
    a.ws.setFlag('a.d', true);
    a.ws.addFavour('oswin', 15, 'quest');
    for (let i = 0; i < 4; i++) a.ws.recordMercy(mercy());
    const data = JSON.parse(JSON.stringify(a.ws.serialize()));
    const b = make();
    b.ws.load(data);
    expect(b.ws.serialize()).toEqual(a.ws.serialize());
    expect(b.ws.getNumber('a.b')).toBe(5);
    expect(b.ws.favour('oswin')).toBe(35);
    expect(b.ws.mercyCount()).toBe(4);
    expect(b.ws.creatureMercyFavour('halvard')).toBe(4);
    expect(b.seen).toEqual([]);
  });

  it('load replaces everything, including flags and credits', () => {
    const { ws } = make();
    ws.setFlag('old.flag', true);
    ws.recordMercy(mercy({ actorId: 'w' }));
    ws.load({ flags: { 'new.flag': 1 } });
    expect(ws.hasFlag('old.flag')).toBe(false);
    expect(ws.getNumber('new.flag')).toBe(1);
    expect(ws.isMercied('w')).toBe(false);
    expect(ws.favour('halvard')).toBe(30);
    expect(ws.mercyCount()).toBe(0);
  });

  it('load tolerates null, undefined and junk', () => {
    const { ws } = make();
    for (const junk of [null, undefined, 5, 'x', [], {}]) {
      expect(() => ws.load(junk)).not.toThrow();
      for (const t of FAVOUR_TRACKS) expect(ws.favour(t)).toBe(FAVOUR_START[t]);
    }
  });

  it('load drops invalid flags and unknown tracks with warnings', () => {
    const { ws, warn } = make();
    ws.load({
      flags: { 'good.flag': 1, BadKey: true, 'a.b': NaN, 'a.c': null, 'a.d': {} },
      favour: { halvard: 50, hobgoblin: 99 },
    });
    expect(ws.flagsWith('')).toEqual(['good.flag']);
    expect(ws.favour('halvard')).toBe(50);
    expect(isFavourTrack('hobgoblin')).toBe(false);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('hobgoblin'))).toBe(true);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('invalid saved flag')).length).toBe(4);
  });

  it('load clamps and defaults bad numbers', () => {
    const { ws } = make();
    ws.load({
      favour: { halvard: 500, oswin: -5, grisel: 'x', dragons: NaN },
      creatureMercy: { halvard: 99, oswin: -3, grisel: 'x' },
      mercyCount: 3.9,
    });
    expect(ws.favour('halvard')).toBe(100);
    expect(ws.favour('oswin')).toBe(0);
    expect(ws.favour('grisel')).toBe(FAVOUR_START.grisel);
    expect(ws.favour('dragons')).toBe(FAVOUR_START.dragons);
    expect(ws.favour('ashwalkers')).toBe(FAVOUR_START.ashwalkers);
    expect(ws.creatureMercyFavour('halvard')).toBe(CREATURE_MERCY_CAP);
    expect(ws.creatureMercyFavour('oswin')).toBe(0);
    expect(ws.creatureMercyFavour('grisel')).toBe(0);
    expect(ws.mercyCount()).toBe(3);
  });

  it('load coerces a bad mercyCount to 0', () => {
    const { ws } = make();
    for (const m of [-4, NaN, 'x', undefined]) {
      ws.load({ mercyCount: m });
      expect(ws.mercyCount()).toBe(0);
    }
  });

  it('load accepts a wrong (older/newer) version number argument without throwing', () => {
    const { ws } = make();
    expect(() => ws.load({ flags: { 'a.b': 1 } }, 0)).not.toThrow();
    expect(() => ws.load({ flags: { 'a.b': 1 } }, 99)).not.toThrow();
  });

  it('works through PersistRegistry save and load; newer versions are refused', () => {
    const events = new GameEvents(() => {});
    const warn = vi.fn();
    const reg = new PersistRegistry(warn);
    const ws = new WorldState(events, () => {});
    reg.register(ws);
    ws.setFlag('a.b', 1);
    const saved = reg.saveAll();
    ws.setFlag('a.b', 2);
    reg.loadAll(saved, events, 's');
    expect(ws.getNumber('a.b')).toBe(1);
    reg.loadAll([{ key: WORLD_STATE_KEY, version: WORLD_STATE_VERSION + 1, data: { flags: { 'a.b': 9 } } }], events, 's');
    expect(ws.getNumber('a.b')).toBe(1);
    expect(warn).toHaveBeenCalled();
  });

  it('serialize returns copies, not live state', () => {
    const { ws } = make();
    const d = ws.serialize();
    d.favour.halvard = 99;
    d.flags['x.y'] = 1;
    expect(ws.favour('halvard')).toBe(30);
    expect(ws.hasFlag('x.y')).toBe(false);
  });

  it('typing: tracks are the known five', () => {
    const t: FavourTrack = 'dragons';
    expect(FAVOUR_TRACKS).toContain(t);
  });
});
