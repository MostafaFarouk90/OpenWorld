// The plan 2.4 readers at every band (plans/act5-N4.md section 10 and 14).
import { describe, expect, it } from 'vitest';
import { FAVOUR_TRACKS, snapshotFlag, type FavourBand, type FavourTrack } from '../state/favour';
import { ACT5_PRESET_FAVOUR, ACT5_PRESET_FLAGS } from '../quests/act5Jump';
import { m52Roster, r19Pair, r27Roster, rosterBodies, siegeRoster, ROSTER_SIZES, type SiegeRoster } from './roster';
import { WORST_FLAGS } from './siege.dev.plugin';
import { siegeSupply } from './supply';

const VALUE: Record<FavourBand, number> = { cold: 10, banked: 30, stoked: 60, hearthbound: 80 };
const BANDS: FavourBand[] = ['cold', 'banked', 'stoked', 'hearthbound'];

function state(flags: Record<string, unknown>, bands: Partial<Record<FavourTrack, FavourBand>> = {}, snapshot = true) {
  const f = new Map<string, unknown>(Object.entries(flags));
  if (snapshot) {
    for (const t of FAVOUR_TRACKS) f.set(snapshotFlag('m52', t), VALUE[bands[t] ?? 'cold']);
    f.set(snapshotFlag('m52', 'taken'), true);
  }
  return { getFlag: (k: string) => f.get(k) };
}

const won = { 'story.m36.delegate.halvard': 'won', 'story.m36.delegate.oswin': 'won', 'story.m36.delegate.grisel': 'won' };
const squad = (r: SiegeRoster, id: string) => r.squads.find((s) => s.id === id);
const members = (r: SiegeRoster, prefix: string) => r.squads.filter((s) => s.id.startsWith(prefix)).reduce((n, s) => n + s.members, 0);

describe('Halvard', () => {
  it.each(BANDS)('%s: archers by band under the banner', (b) => {
    const r = m52Roster(state(won, { halvard: b }));
    expect(members(r, 'halvard-archers')).toBe(ROSTER_SIZES.halvardArchers[b]);
    expect(r.banners).toContain('halvard');
    expect(r.sally).toBe(b === 'hearthbound');
  });
  it('without the banner none fight, whatever the band and R19', () => {
    const r = m52Roster(state({ ...won, 'story.m36.delegate.halvard': 'lost', 'story.r19.choice': 'archers-pikes' }, { halvard: 'hearthbound' }));
    expect(r.squads.some((s) => s.track === 'halvard' || s.id.startsWith('r19'))).toBe(false);
    expect(r.banners).not.toContain('halvard');
    expect(r.sally).toBe(false);
  });
  it.each([
    ['archers-pikes', ['r19-archers', 'r19-pikes'], false, false],
    ['archers-horse', ['r19-archers'], true, false],
    ['archers-engineers', ['r19-archers'], false, true],
    ['horse-pikes', ['r19-pikes'], true, false],
    ['engineers-pikes', ['r19-pikes'], false, true],
    ['engineers-horse', [], true, true],
  ] as const)('R19 %s at Stoked', (pair, squads, sally, engineers) => {
    const r = m52Roster(state({ ...won, 'story.r19.choice': pair }, { halvard: 'stoked' }));
    expect(r.squads.filter((s) => s.id.startsWith('r19')).map((s) => s.id).sort()).toEqual([...squads].sort());
    expect(r.sally).toBe(sally);
    expect(r.engineers).toBe(engineers);
    if (squads.includes('r19-archers' as never)) expect(squad(r, 'r19-archers')!.members).toBe(4);
    if (squads.includes('r19-pikes' as never)) expect(squad(r, 'r19-pikes')!.members).toBe(6);
  });
  it('r19Pair refuses junk', () => {
    expect(r19Pair('archers-archers')).toEqual([]);
    expect(r19Pair('archers')).toEqual([]);
    expect(r19Pair('archers-cooks')).toEqual([]);
    expect(r19Pair(3)).toEqual([]);
  });
});

describe('Oswin', () => {
  it.each(BANDS)('%s: the supply band, both roads', (b) => {
    for (const road of ['fast', 'long'] as const) {
      const r = m52Roster(state({ ...won, 'story.r26.choice': road }, { oswin: b }));
      if (b === 'cold') expect(r.supply).toBeNull();
      else expect(r.supply).toEqual({ band: b, road });
    }
  });
  it("N7's numbers: Cold 0, Banked 3, Stoked 6, Hearthbound 6 and a resupply; the long road two thirds", () => {
    expect(siegeSupply('cold', 'fast')).toEqual({ perBreak: 0, resupplies: 0 });
    expect(siegeSupply('banked', 'fast')).toEqual({ perBreak: 3, resupplies: 0 });
    expect(siegeSupply('stoked', 'fast')).toEqual({ perBreak: 6, resupplies: 0 });
    expect(siegeSupply('hearthbound', 'fast')).toEqual({ perBreak: 6, resupplies: 1 });
    expect(siegeSupply('banked', 'long').perBreak).toBe(2);
    expect(siegeSupply('stoked', 'long').perBreak).toBe(4);
    expect(siegeSupply('hearthbound', 'long')).toEqual({ perBreak: 4, resupplies: 1 });
  });
  it('without the banner, no crates', () => {
    expect(m52Roster(state({ ...won, 'story.m36.delegate.oswin': 'lost' }, { oswin: 'hearthbound' })).supply).toBeNull();
  });
});

describe('Grisel', () => {
  it.each(BANDS)('%s: miners by band, sappers at Hearthbound; R21 all +4', (b) => {
    for (const r21 of ['all', 'leaders']) {
      const r = m52Roster(state({ ...won, 'story.r21.choice': r21 }, { grisel: b }));
      const n = ROSTER_SIZES.griselMiners[b] + (r21 === 'all' ? 4 : 0);
      const s = squad(r, 'grisel-miners');
      if (n === 0) expect(s).toBeUndefined();
      else {
        expect(s!.members).toBe(n);
        expect(s!.role).toBe(b === 'hearthbound' ? 'sappers' : 'melee');
      }
    }
  });
  it('R21 all needs the banner', () => {
    expect(squad(m52Roster(state({ ...won, 'story.m36.delegate.grisel': 'lost', 'story.r21.choice': 'all' })), 'grisel-miners')).toBeUndefined();
  });
});

describe('dragons (F2, the band, R11)', () => {
  it.each([
    ['cold', ['ysmeryth']],
    ['banked', ['ysmeryth', 'hathren']],
    ['stoked', ['ysmeryth', 'hathren', 'orsk']],
    ['hearthbound', ['ysmeryth', 'hathren', 'orsk']],
  ] as const)('%s', (b, who) => {
    const r = m52Roster(state({}, { dragons: b }));
    expect(r.dragons.map((d) => d.id)).toEqual(who);
    expect(r.firstRamBreath).toBe(b === 'hearthbound');
  });
  it('F2: won arrives on wave 3, yielded on wave 2', () => {
    expect(m52Roster(state({ 'story.m31.choice': 'won' })).dragons[0].arriveWave).toBe(3);
    expect(m52Roster(state({ 'story.m31.choice': 'yielded' })).dragons[0].arriveWave).toBe(2);
  });
  it('R11 spared: the hill wyrm flies with them', () => {
    expect(m52Roster(state({ 'story.r11.choice': 'spared' })).dragons.map((d) => d.id)).toContain('hill-wyrm');
    expect(m52Roster(state({ 'story.r11.choice': 'slain' })).dragons.map((d) => d.id)).not.toContain('hill-wyrm');
  });
});

describe('Ashwalkers (F8)', () => {
  it.each(BANDS)('%s: all brings them by band, Hearthbound storm-cover', (b) => {
    const r = m52Roster(state({ 'story.r24.choice': 'all' }, { ashwalkers: b }));
    expect(squad(r, 'ashwalkers')!.members).toBe(ROSTER_SIZES.ashwalkers[b]);
    expect(squad(r, 'ashwalkers')!.named).toEqual(['wulfhild']);
    expect(r.stormCover).toBe(b === 'hearthbound');
  });
  it('half: none come', () => {
    const r = m52Roster(state({ 'story.r24.choice': 'half' }, { ashwalkers: 'hearthbound' }));
    expect(squad(r, 'ashwalkers')).toBeUndefined();
    expect(r.stormCover).toBe(false);
  });
});

describe('Rook (F7) and Edric (R22)', () => {
  it('public: Rook and eight watchmen; private: Rook alone', () => {
    expect(squad(m52Roster(state({ 'story.r23.choice': 'public' })), 'rook-watch')!.members).toBe(9);
    expect(squad(m52Roster(state({ 'story.r23.choice': 'private' })), 'rook-watch')!.members).toBe(1);
  });
  it('light: a duellist at the lee; heavy: pikes reach at the banner', () => {
    const light = squad(m52Roster(state({ 'story.r22.choice': 'light' })), 'edric')!;
    expect(light).toMatchObject({ role: 'melee', duellist: true, post: 'caldera.siege.lee' });
    const heavy = squad(m52Roster(state({ 'story.r22.choice': 'heavy' })), 'edric')!;
    expect(heavy).toMatchObject({ role: 'pikes', post: 'caldera.siege.banner' });
  });
});

describe('the presets and the worst case', () => {
  const preset = (p: 'marshal' | 'keepers') => {
    const flags: Record<string, unknown> = { ...ACT5_PRESET_FLAGS[p] };
    FAVOUR_TRACKS.forEach((t, i) => (flags[snapshotFlag('m52', t)] = ACT5_PRESET_FAVOUR[p].m52[i]));
    flags[snapshotFlag('m52', 'taken')] = true;
    return m52Roster({ getFlag: (k) => flags[k] });
  };
  it('Marshal: Halvard Hearthbound archers and the sally, Oswin cold (no crates), no Grisel, no Ashwalkers, dragons on wave 3', () => {
    const r = preset('marshal');
    expect(r.squads.map((s) => `${s.id}:${s.members}`)).toEqual(['halvard-archers-left:6', 'halvard-archers-right:6', 'rook-watch:1', 'edric:1']);
    expect(r).toMatchObject({ sally: true, supply: null, stormCover: false, firstRamBreath: false });
    expect(r.dragons.map((d) => `${d.id}@${d.arriveWave}`)).toEqual(['ysmeryth@3']);
  });
  it('Keepers: Oswin Stoked crates, Grisel Banked miners, Ashwalkers Stoked, three dragons on wave 2', () => {
    const r = preset('keepers');
    expect(r.squads.map((s) => `${s.id}:${s.members}`)).toEqual(['grisel-miners:4', 'ashwalkers:10', 'rook-watch:1', 'edric:1']);
    expect(r.supply).toEqual({ band: 'stoked', road: 'fast' });
    expect(r.dragons.map((d) => `${d.id}@${d.arriveWave}`)).toEqual(['ysmeryth@2', 'hathren@2', 'orsk@2']);
  });
  it('the worst case stands 54 squad bodies (58 with the two companions and the sally riders off the field)', () => {
    const flags: Record<string, unknown> = { ...WORST_FLAGS };
    for (const t of FAVOUR_TRACKS) flags[snapshotFlag('m52', t)] = 95;
    flags[snapshotFlag('m52', 'taken')] = true;
    const r = m52Roster({ getFlag: (k) => flags[k] });
    expect(rosterBodies(r)).toBe(54);
  });
  it('a missing snapshot reads Cold and says so', () => {
    const r = m52Roster(state(won, {}, false));
    expect(r.snapshotMissing).toBe(true);
    expect(Object.values(r.bands).every((b) => b === 'cold')).toBe(true);
  });
});

describe('R27 (F5)', () => {
  it.each([
    ['miners', ['wenna:1', 'tunnel-miners:4']],
    ['stewards', ['wenna:1', 'tunnel-stewards:4']],
    ['compromise', ['wenna:1', 'tunnel-miners:2', 'tunnel-stewards:2']],
    [undefined, ['wenna:1']],
  ] as const)('%s', (r10, squads) => {
    const r = r27Roster(state(r10 ? { 'story.r10.choice': r10 } : {}));
    expect(r.squads.map((s) => `${s.id}:${s.members}`)).toEqual(squads);
    expect(r).toMatchObject({ dragons: [], sally: false, stormCover: false, supply: null });
    expect(siegeRoster(state({}), 'r27').siegeId).toBe('r27');
  });
});
