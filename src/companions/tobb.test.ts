import { describe, expect, it } from 'vitest';
import { COMPANION_STRINGS_EN } from './strings.en';
import { TOBB } from './tobb';
import { TOBB_TUNING } from './tuning';

const KEY = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/;
const pools = (): Array<[string, readonly string[]]> => [
  ...Object.entries(TOBB.banter.area).map(([k, v]): [string, readonly string[]] => [`area.${k}`, v]),
  ['combatStart', TOBB.banter.combatStart],
  ['combatEnd', TOBB.banter.combatEnd],
  ['elapsed', TOBB.banter.elapsed],
];

describe('TOBB definition', () => {
  it.each(pools())('banter pool %s is non-empty', (_n, lines) => {
    expect(lines.length).toBeGreaterThan(0);
  });
  it.each(pools())('every line key of pool %s exists in the strings', (_n, lines) => {
    for (const k of lines) {
      expect(COMPANION_STRINGS_EN[k], k).toBeTypeOf('string');
      expect(COMPANION_STRINGS_EN[k].length).toBeGreaterThan(0);
    }
  });
  it('pools hold only their own strings, with no duplicates across pools', () => {
    const seen = new Set<string>();
    for (const [name, lines] of pools()) {
      const prefix = name.startsWith('area.') ? `companion.tobb.bark.${name}.` : `companion.tobb.bark.${name}.`;
      for (const k of lines) {
        expect(k.startsWith(prefix), `${k} in ${name}`).toBe(true);
        expect(seen.has(k), `duplicate ${k}`).toBe(false);
        seen.add(k);
      }
    }
  });
  it('every bark string in the table is used by some pool', () => {
    const used = new Set(pools().flatMap(([, l]) => l));
    const orphans = Object.keys(COMPANION_STRINGS_EN).filter((k) => k.includes('.bark.') && !used.has(k));
    expect(orphans).toEqual([]);
  });
  it('every string key looks like a dotted namespaced key', () => {
    for (const k of Object.keys(COMPANION_STRINGS_EN)) expect(k, k).toMatch(KEY);
    expect(Object.keys(COMPANION_STRINGS_EN).every((k) => k.startsWith('companion.'))).toBe(true);
  });
  it('rejects obviously malformed keys with the same pattern', () => {
    for (const bad of ['Companion.x', 'companion', 'companion.', '.x.y', 'companion..x', 'companion.a b']) {
      expect(KEY.test(bad), bad).toBe(false);
    }
  });
  it('string values are non-empty and have balanced braces', () => {
    for (const [k, v] of Object.entries(COMPANION_STRINGS_EN)) {
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect(v.split('{').length, k).toBe(v.split('}').length);
    }
  });
  it('the name and aura name keys resolve', () => {
    expect(COMPANION_STRINGS_EN[TOBB.nameKey]).toBe('Tobb Fenwick');
    expect(COMPANION_STRINGS_EN[TOBB.aura.nameKey]).toBeTruthy();
  });
  it('the aura is 4 s and x1.05, from the tuning', () => {
    expect(TOBB.aura.seconds).toBe(4);
    expect(TOBB.aura.attackSpeed).toBe(1.05);
    expect(TOBB_TUNING.auraSeconds).toBe(4);
    expect(TOBB_TUNING.auraMultiplier).toBe(1.05);
  });
  it('every mapped place has a banter pool', () => {
    const { triggers, interiors, regions } = TOBB.places;
    for (const place of [...Object.values(triggers), ...Object.values(interiors), ...Object.values(regions)]) {
      expect(TOBB.banter.area[place]?.length, place).toBeGreaterThan(0);
    }
  });
  it('every banter place is reachable from a trigger, interior or region', () => {
    const { triggers, interiors, regions } = TOBB.places;
    const reachable = new Set([...Object.values(triggers), ...Object.values(interiors), ...Object.values(regions)]);
    for (const place of Object.keys(TOBB.banter.area)) expect(reachable.has(place), place).toBe(true);
  });
  it('interior entry anchors exist for the interiors he comments on', () => {
    for (const id of Object.keys(TOBB.places.interiors)) expect(TOBB.interiorEntry[id], id).toBeTruthy();
  });
  it('identity fields agree with each other', () => {
    expect(TOBB.id).toBe('tobb');
    expect(TOBB.npcId).toBe('tobb');
    expect(TOBB.dialogueId).toBe('npc-tobb');
    expect(TOBB.aura.buffId.startsWith('companion.tobb.')).toBe(true);
  });
});
