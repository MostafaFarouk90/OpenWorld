// K5 (Q13, v0.7 item 17): the Quenched aura. One registration of the Burn gain slot; the scale reads the flags and the
// player's region at each gain; the toast shows once ever, never on a load.
import { describe, expect, it } from 'vitest';
import { ACT3_INTERIOR_PADS } from '../../region/act3/act3Places';
import { Burn } from '../../spells/Burn';
import { QUENCHED_AURA } from '../../status/quenched';
import {
  QUENCHED_EVERYWHERE_FLAG,
  QUENCHED_GREYFEN_FLAG,
  QUENCHED_SEEN_FLAG,
  QUENCHED_TOAST_KEY,
  QuenchedAura,
  quenchedOn,
} from './quenched';

const GREYFEN = { x: 3000, z: 12000 };
const DRAGONSPINE = { x: 13600, z: 11900 };
const BRIGHTWATER = { x: 0, z: 0 };

function rig(opts: { spells?: boolean } = {}) {
  const flags = new Map<string, unknown>();
  const toasts: string[] = [];
  const burn = new Burn();
  let registrations = 0;
  let feet = { ...BRIGHTWATER };
  const aura = new QuenchedAura({
    flag: (k) => flags.get(k),
    setFlag: (k, v) => void flags.set(k, v),
    feet: () => feet,
    setBurnGainScale: () =>
      opts.spells === false
        ? undefined
        : (fn) => {
            registrations++;
            return burn.setGainScale(fn);
          },
    toast: (k) => void toasts.push(k),
  });
  const gain = (n: number) => {
    burn.clear('test');
    burn.add(n, 'test');
    return burn.value;
  };
  return { aura, flags, toasts, burn, gain, at: (p: { x: number; z: number }) => (feet = { ...p }), registrations: () => registrations };
}

describe('quenchedOn', () => {
  it('is off before M26, on in the Greyfen after M26, everywhere after M34', () => {
    const f = new Map<string, unknown>();
    const flag = (k: string) => f.get(k);
    expect(quenchedOn(flag, 'greyfen')).toBe(false);
    f.set(QUENCHED_GREYFEN_FLAG, true);
    expect(quenchedOn(flag, 'greyfen')).toBe(true);
    expect(quenchedOn(flag, 'dragonspine')).toBe(false);
    expect(quenchedOn(flag, null)).toBe(false);
    f.set(QUENCHED_EVERYWHERE_FLAG, true);
    expect(quenchedOn(flag, 'harrowmark')).toBe(true);
    expect(quenchedOn(flag, null)).toBe(true);
  });

  it('reads only a true flag (a string or number value does not count)', () => {
    expect(quenchedOn((k) => (k === QUENCHED_GREYFEN_FLAG ? 'yes' : undefined), 'greyfen')).toBe(false);
    expect(quenchedOn((k) => (k === QUENCHED_EVERYWHERE_FLAG ? 1 : undefined), 'greyfen')).toBe(false);
  });
});

describe('QuenchedAura on a real Burn', () => {
  it('Burn gain 10 becomes 7.5 in the Greyfen after M26 and stays 10 outside; no event is needed', () => {
    const r = rig();
    expect(r.aura.ensureRegistered()).toBe(true);
    r.at(GREYFEN);
    expect(r.gain(10)).toBe(10);
    r.flags.set(QUENCHED_GREYFEN_FLAG, true);
    expect(r.gain(10)).toBeCloseTo(10 * QUENCHED_AURA.burnGainScale);
    r.at(DRAGONSPINE);
    expect(r.gain(10)).toBe(10);
    r.flags.set(QUENCHED_EVERYWHERE_FLAG, true);
    expect(r.gain(10)).toBeCloseTo(7.5);
    r.at(BRIGHTWATER);
    expect(r.gain(10)).toBeCloseTo(7.5);
  });

  it('a Greyfen interior float resolves from its x, z (the chapel and the hut)', () => {
    const r = rig();
    r.aura.ensureRegistered();
    r.flags.set(QUENCHED_GREYFEN_FLAG, true);
    for (const id of ['sunken-chapel', 'mireweather-hut'] as const) {
      const p = ACT3_INTERIOR_PADS[id];
      r.at({ x: p.x, z: p.z });
      expect(r.aura.active(), id).toBe(true);
      expect(r.gain(4), id).toBeCloseTo(3);
    }
  });

  it('removing Burn is never scaled', () => {
    const r = rig();
    r.aura.ensureRegistered();
    r.flags.set(QUENCHED_EVERYWHERE_FLAG, true);
    r.burn.clear('t');
    r.burn.add(40, 't');
    r.burn.add(-10, 't');
    expect(r.burn.value).toBeCloseTo(30 - 10 + 0);
  });

  it('registers once however often it is asked; dispose restores 1', () => {
    const r = rig();
    r.aura.ensureRegistered();
    r.aura.ensureRegistered();
    r.aura.ensureRegistered();
    expect(r.registrations()).toBe(1);
    r.flags.set(QUENCHED_EVERYWHERE_FLAG, true);
    expect(r.gain(10)).toBeCloseTo(7.5);
    r.aura.dispose();
    expect(r.aura.registered).toBe(false);
    expect(r.gain(10)).toBe(10);
  });

  it('without the spells slot it registers nothing and reports false (retried later by the plugin tick)', () => {
    const r = rig({ spells: false });
    expect(r.aura.ensureRegistered()).toBe(false);
    expect(r.aura.registered).toBe(false);
  });
});

describe('QuenchedAura toast', () => {
  it('toasts the first time it turns on at runtime, never again (border crossings included)', () => {
    const r = rig();
    r.at(GREYFEN);
    r.aura.onChange();
    expect(r.toasts).toEqual([]);
    r.flags.set(QUENCHED_GREYFEN_FLAG, true);
    r.aura.onChange();
    expect(r.toasts).toEqual([QUENCHED_TOAST_KEY]);
    expect(r.flags.get(QUENCHED_SEEN_FLAG)).toBe(true);
    for (let i = 0; i < 4; i++) {
      r.at(i % 2 ? GREYFEN : DRAGONSPINE);
      r.aura.onChange();
    }
    r.flags.set(QUENCHED_EVERYWHERE_FLAG, true);
    r.aura.onChange();
    expect(r.toasts).toHaveLength(1);
  });

  it('a load that finds it on latches silently: no toast then, none after', () => {
    const r = rig();
    r.at(GREYFEN);
    r.flags.set(QUENCHED_GREYFEN_FLAG, true);
    r.aura.onLoaded();
    expect(r.toasts).toEqual([]);
    expect(r.flags.get(QUENCHED_SEEN_FLAG)).toBe(true);
    r.aura.onChange();
    expect(r.toasts).toEqual([]);
  });

  it('a load while it is off does not latch, so the first runtime switch still toasts', () => {
    const r = rig();
    r.at(DRAGONSPINE);
    r.flags.set(QUENCHED_GREYFEN_FLAG, true);
    r.aura.onLoaded();
    expect(r.flags.get(QUENCHED_SEEN_FLAG)).toBeUndefined();
    r.at(GREYFEN);
    r.aura.onChange();
    expect(r.toasts).toEqual([QUENCHED_TOAST_KEY]);
  });
});
