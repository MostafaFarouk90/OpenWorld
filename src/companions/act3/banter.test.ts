// K5: the Act 3 bark data (places, pools, strings, the reveal variant) and the event-bark mapping.
import { describe, expect, it } from 'vitest';
import type { GameEventMap } from '../../core/events';
import { DRAGONSPINE_LAYOUT } from '../../dragonspine/dragonspine.layout';
import { CHAPEL_ID } from '../../greyfen/chapelInterior';
import { GREYFEN_LAYOUT } from '../../greyfen/greyfen.layout';
import { HUT_ID } from '../../greyfen/hutInterior';
import { WYRMWATCH_HALL_ID } from '../../dragonspine/wyrmwatchHall';
import { AELFREDA } from '../aelfreda';
import { HROLF, R11_CHOICE_FLAG } from '../hrolf';
import { AELFREDA_STRINGS_EN } from '../strings.aelfreda.en';
import { COMPANION_STRINGS_EN } from '../strings.en';
import { HROLF_STRINGS_EN } from '../strings.hrolf.en';
import { TOBB } from '../tobb';
import type { CompanionDef } from '../types';
import { ACT3_EVENT_PLACES, ACT3_PLACES, REVEAL_FLAG, REVEAL_PLACES, act3Pools, act3Variant, isAct3IndirectPool } from './banter';
import { listenEventBarks, YSMERYTH_TRIAL_ID } from './eventBarks';
import { ACT3_BANTER_TEXT } from './strings.en';

const DEFS: [CompanionDef, Record<string, string>][] = [
  [TOBB, COMPANION_STRINGS_EN],
  [HROLF, HROLF_STRINGS_EN],
  [AELFREDA, AELFREDA_STRINGS_EN],
];
const ALL_PLACES = [
  ...Object.values(ACT3_PLACES.triggers),
  ...Object.values(ACT3_PLACES.interiors),
  ...Object.values(ACT3_PLACES.regions),
  ...REVEAL_PLACES.map((p) => `${p}.after`),
  ...ACT3_EVENT_PLACES,
];

describe.each(DEFS)('$id: Act 3 barks', (def, table) => {
  it('has at least two lines for every Act 3 place, variant and event', () => {
    for (const place of ALL_PLACES) expect(def.banter.area[place]?.length ?? 0, place).toBeGreaterThanOrEqual(2);
  });
  it('every Act 3 line key resolves in its own string table, non-empty', () => {
    for (const keys of Object.values(act3Pools(def.id))) for (const k of keys) expect(table[k]?.length ?? 0, k).toBeGreaterThan(10);
  });
  it('maps every Act 3 trigger, interior and region, and has an entry anchor for each interior', () => {
    for (const [id, place] of Object.entries(ACT3_PLACES.triggers)) expect(def.places.triggers[id]).toBe(place);
    for (const [id, place] of Object.entries(ACT3_PLACES.interiors)) {
      expect(def.places.interiors[id]).toBe(place);
      expect(def.interiorEntry[id], id).toBeTruthy();
    }
    for (const [id, place] of Object.entries(ACT3_PLACES.regions)) expect(def.places.regions[id]).toBe(place);
  });
  it('after the reveal a Dragonspine place speaks from its .after pool; before, the plain one', () => {
    const flags = new Map<string, unknown>();
    const v = (place: string) => def.areaVariant!(place, (k) => flags.get(k));
    for (const p of REVEAL_PLACES) expect(v(p)).toBe(p);
    expect(v('greyfen')).toBe('greyfen');
    flags.set(REVEAL_FLAG, true);
    for (const p of REVEAL_PLACES) expect(v(p)).toBe(`${p}.after`);
    expect(v('greyfen')).toBe('greyfen');
  });
  it('no line before the reveal names the dragons keepers (design 3: nothing spoils M32)', () => {
    const text = ACT3_BANTER_TEXT[def.id];
    for (const [place, lines] of Object.entries(text)) {
      if (place === 'reveal' || place.endsWith('.after')) continue;
      for (const l of lines) expect(l.toLowerCase(), `${place}: ${l}`).not.toMatch(/keeper/);
    }
  });
});

describe('Act 3 bark data', () => {
  it('K3 and K4 define every trigger the barks listen to', () => {
    const ids = new Set([...GREYFEN_LAYOUT.triggers, ...DRAGONSPINE_LAYOUT.triggers].map((t) => t.id));
    for (const id of Object.keys(ACT3_PLACES.triggers)) expect(ids.has(id), id).toBe(true);
  });
  it('the interior ids are K3 and K4 ids', () => {
    expect(Object.keys(ACT3_PLACES.interiors).sort()).toEqual([CHAPEL_ID, HUT_ID, WYRMWATCH_HALL_ID].sort());
  });
  it("Hrolf's den variant still holds next to the reveal rule", () => {
    const flags = new Map<string, unknown>([[R11_CHOICE_FLAG, 'spared']]);
    expect(HROLF.areaVariant!('den', (k) => flags.get(k))).toBe('den.spared');
    flags.clear();
    expect(HROLF.areaVariant!('den', (k) => flags.get(k))).toBeNull();
  });
  it('event and variant pools are the only indirect ones', () => {
    for (const p of ACT3_EVENT_PLACES) expect(isAct3IndirectPool(p)).toBe(true);
    expect(isAct3IndirectPool('lodge.after')).toBe(true);
    expect(isAct3IndirectPool('lodge')).toBe(false);
    expect(isAct3IndirectPool('greyfen.after')).toBe(false);
  });
  it('act3Variant leaves non-Dragonspine places and a non-true flag alone', () => {
    expect(act3Variant('lodge', () => 'yes')).toBe('lodge');
    expect(act3Variant('mere', () => true)).toBe('mere');
  });
});

describe('event barks', () => {
  function bus() {
    const fns = new Map<string, ((p: any) => void)[]>();
    const said: string[] = [];
    const off = listenEventBarks({
      on: (type, fn) => {
        fns.set(type, [...(fns.get(type) ?? []), fn as (p: any) => void]);
        return () => fns.set(type, (fns.get(type) ?? []).filter((f) => f !== fn));
      },
      say: (p) => void said.push(p),
    });
    const emit = <K extends keyof GameEventMap>(type: K, p: GameEventMap[K]) => (fns.get(type) ?? []).forEach((f) => f(p));
    return { emit, said, off };
  }

  it("maps Ysmeryth's trial events; other trials and the opponent's breaks say nothing", () => {
    const b = bus();
    b.emit('trial.started', { trialId: 'm13', opponentId: 'x', breaksToWin: 3 });
    b.emit('trial.started', { trialId: YSMERYTH_TRIAL_ID, opponentId: 'x', breaksToWin: 3 });
    b.emit('trial.break', { trialId: YSMERYTH_TRIAL_ID, by: 'opponent', player: 0, opponent: 1 });
    b.emit('trial.break', { trialId: YSMERYTH_TRIAL_ID, by: 'player', player: 1, opponent: 1 });
    b.emit('trial.won', { trialId: YSMERYTH_TRIAL_ID });
    b.emit('trial.lost', { trialId: YSMERYTH_TRIAL_ID });
    b.emit('trial.won', { trialId: 'm13' });
    expect(b.said).toEqual(['trial.start', 'trial.break', 'trial.won', 'trial.lost']);
  });

  it('the reveal only on a false-to-true change of story.m32.complete; any ferry stop says ferry', () => {
    const b = bus();
    b.emit('flag.changed', { key: 'story.m31.complete', value: true, previous: undefined });
    b.emit('flag.changed', { key: REVEAL_FLAG, value: false, previous: undefined });
    b.emit('flag.changed', { key: REVEAL_FLAG, value: true, previous: false });
    b.emit('flag.changed', { key: REVEAL_FLAG, value: true, previous: true });
    b.emit('ferry.arrived', { routeId: 'ferry.reedgate-mere', stop: 'mere', skipped: false });
    expect(b.said).toEqual(['reveal', 'ferry']);
  });

  it('unsubscribes everything', () => {
    const b = bus();
    b.off();
    b.emit('trial.won', { trialId: YSMERYTH_TRIAL_ID });
    b.emit('ferry.arrived', { routeId: 'r', stop: 's', skipped: true });
    expect(b.said).toEqual([]);
  });
});
