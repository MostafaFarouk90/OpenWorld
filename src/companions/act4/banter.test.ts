import { describe, expect, it } from 'vitest';
import { AELFREDA } from '../aelfreda';
import { HROLF } from '../hrolf';
import { TOBB } from '../tobb';
import { ACT4_EVENT_PLACES, ACT4_PLACES, ACT4_TRIGGERS, GAUT_FALLEN_FLAG, WASTE_REGION, act4Pools, mourningSwap } from './banter';
import { OneShotLines, ONE_SHOT, type OneShotSpeaker } from './oneShots';
import { ACT4_BANTER_TEXT, MOURNING_LINES, act4BarkKey, companionAct4Strings } from './strings.en';
import { COMPANION_STRINGS_EN } from '../strings.en';
import { HROLF_STRINGS_EN } from '../strings.hrolf.en';
import { AELFREDA_STRINGS_EN } from '../strings.aelfreda.en';

const TOBB_STRINGS_EN: Record<string, string> = { ...COMPANION_STRINGS_EN, ...HROLF_STRINGS_EN, ...AELFREDA_STRINGS_EN };

const DEFS = [TOBB, HROLF, AELFREDA];

describe('Act 4 companion banter (L4)', () => {
  it('every companion has every Act 4 place and event place, each with lines that resolve to strings', () => {
    const strings = companionAct4Strings();
    for (const def of DEFS) {
      for (const place of ['a4.waste', 'a4.walkerCamp', 'a4.cinderChapel', 'a4.cathedral', 'a4.rim', ...ACT4_EVENT_PLACES]) {
        const keys = def.banter.area[place];
        expect(keys?.length, `${def.id} ${place}`).toBeGreaterThan(0);
        for (const k of keys!) expect(strings[k], k).toMatch(/\S/);
      }
    }
  });

  it('the defs map the Waste region and the four Waste triggers to the a4 places, keeping every older place', () => {
    for (const def of DEFS) {
      expect(def.places.regions[WASTE_REGION]).toBe('a4.waste');
      for (const [place, trg] of Object.entries(ACT4_TRIGGERS)) expect(def.places.triggers[trg]).toBe(`a4.${place}`);
      expect(def.places.regions.harrowmark).toBe('harrowmark');
      expect(def.lineSwap).toBe(mourningSwap);
    }
    expect(ACT4_PLACES.regions).toEqual({ 'ashen-waste': 'a4.waste' });
  });

  it('every Act 4 key sits in its own namespace (a4 places or a .mourning swap), so none shadows a shipped key', () => {
    for (const k of Object.keys(companionAct4Strings())) expect(/^companion\.[a-z]+\.bark\.(area\.a4\.|.*\.mourning$)/.test(k), k).toBe(true);
    const all = Object.keys(ACT4_BANTER_TEXT).flatMap((id) => Object.values(act4Pools(id)).flat());
    expect(new Set(all).size).toBe(all.length);
  });

  it('each companion table carries its own Act 4 strings', () => {
    for (const k of Object.keys(companionAct4Strings())) expect(TOBB_STRINGS_EN[k], k).toBeTypeOf('string');
  });

  it('mourning swaps only after M39 and only the listed lines', () => {
    const before = () => undefined;
    const after = (k: string) => (k === GAUT_FALLEN_FLAG ? true : undefined);
    expect(mourningSwap('companion.tobb.bark.elapsed.5', before)).toBe('companion.tobb.bark.elapsed.5');
    expect(mourningSwap('companion.tobb.bark.elapsed.5', after)).toBe(MOURNING_LINES['companion.tobb.bark.elapsed.5'].key);
    expect(mourningSwap('companion.tobb.bark.elapsed.4', after)).toBe('companion.tobb.bark.elapsed.4');
    // the shipped line it replaces is the one naming Gaut
    expect(TOBB_STRINGS_EN['companion.tobb.bark.elapsed.5']).toMatch(/Gaut/);
  });

  it('every shipped companion bark naming Gaut has a mourning swap', () => {
    const mourning = new Set(Object.values(MOURNING_LINES).map((m) => m.key));
    const naming = Object.entries(TOBB_STRINGS_EN).filter(([k, v]) => /bark/.test(k) && /Gaut/.test(v) && !mourning.has(k) && !/\.a4\.(mourning|bond2)\./.test(k));
    for (const [k] of naming) expect(MOURNING_LINES[k], k).toBeDefined();
  });
});

describe('one-shot lines (bond rank 2, mourning)', () => {
  const make = (speakers: Array<Partial<OneShotSpeaker> & { id: string }>) => {
    const flags = new Map<string, unknown>();
    const said: string[] = [];
    const gate = { busy: false };
    const list: OneShotSpeaker[] = speakers.map((s) => ({
      def: { id: s.id },
      joined: s.joined ?? true,
      rank: s.rank ?? (() => 1),
      sayLine: s.sayLine ?? ((k: string) => {
        if (gate.busy) return false;
        said.push(k);
        return true;
      }),
    }));
    const lines = new OneShotLines({ flag: (k) => flags.get(k), setFlag: (k, v) => void flags.set(k, v), speakers: () => list });
    return { flags, said, gate, list, lines };
  };

  it('says the bond line once per companion at rank 2, through a busy gate later, never again after', () => {
    const rank = { v: 1 };
    const t = make([{ id: 'tobb', rank: () => rank.v }, { id: 'hrolf', rank: () => rank.v }]);
    t.lines.tick(1);
    expect(t.said).toEqual([]);
    rank.v = 2;
    t.gate.busy = true;
    t.lines.tick(1);
    expect(t.said).toEqual([]);
    t.gate.busy = false;
    t.lines.tick(1);
    expect(t.said).toEqual([act4BarkKey('tobb', 'bond2', 1), act4BarkKey('hrolf', 'bond2', 1)]);
    for (let i = 0; i < 5; i++) t.lines.tick(1);
    expect(t.said).toHaveLength(2);
    expect(t.flags.get(ONE_SHOT.bondSaidFlag('tobb'))).toBe(true);
  });

  it('a benched companion (cannot speak) says it once seated again; an unjoined one never', () => {
    const seated = { v: false };
    const said: string[] = [];
    const t = make([
      { id: 'aelfreda', rank: () => 2, sayLine: (k) => (seated.v ? (said.push(k), true) : false) },
      { id: 'hrolf', rank: () => 2, joined: false },
    ]);
    t.lines.tick(1);
    expect(said).toEqual([]);
    seated.v = true;
    t.lines.tick(1);
    expect(said).toEqual([act4BarkKey('aelfreda', 'bond2', 1)]);
    expect(t.said).toEqual([]);
  });

  it('mourning waits for M39 and a rest, then once each; a rest before M39 does not arm it', () => {
    const t = make([{ id: 'tobb' }]);
    t.lines.rested();
    t.lines.tick(1);
    expect(t.said).toEqual([]);
    t.flags.set(GAUT_FALLEN_FLAG, true);
    t.lines.tick(1);
    expect(t.said).toEqual([]);
    t.lines.rested();
    t.lines.tick(1);
    expect(t.said).toEqual([act4BarkKey('tobb', 'mourning', 1)]);
    t.lines.rested();
    t.lines.tick(1);
    t.lines.tick(1);
    expect(t.said).toHaveLength(1);
  });

  it('paces its tries (one a second)', () => {
    const t = make([{ id: 'tobb', rank: () => 2 }]);
    t.gate.busy = true;
    t.lines.tick(1);
    t.gate.busy = false;
    t.lines.tick(0.5);
    expect(t.said).toEqual([]);
    t.lines.tick(0.5);
    expect(t.said).toHaveLength(1);
  });
});
