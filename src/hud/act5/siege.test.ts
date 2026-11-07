import { describe, expect, it } from 'vitest';
import { StubDocument, textOf } from '../dom';
import { SiegeHud } from './SiegeHud';
import { MAX_CHIPS, SiegeModel } from './siegeModel';
import { ACT5_HUD_STRINGS_EN } from './strings.en';

const t = (k: string, p?: Record<string, string | number>): string => (ACT5_HUD_STRINGS_EN[k] ?? k).replace(/\{(\w+)\}/g, (_, n: string) => String(p?.[n] ?? `{${n}}`));

describe('SiegeModel', () => {
  it('is hidden until a known siege speaks, then reads wave, gate, rams and chips from events', () => {
    const m = new SiegeModel({ waveTotal: () => 4 });
    expect(m.view()).toBeNull();
    m.waveStarted({ siegeId: 'm52', n: 2 });
    m.gateDamaged({ siegeId: 'm52', pct: 62.4 });
    m.allyArrived({ siegeId: 'm52', id: 'archers' });
    m.ram('m52.cart.3.1', 0.5, 0);
    const v = m.view()!;
    expect(v).toMatchObject({ wave: 2, waves: 4, gatePct: 62.4, chips: ['archers'], between: false });
    expect(v.rams).toEqual([{ id: 'm52.cart.3.1', fill: 0.5, stalled: 0 }]);
    m.setStall('m52.cart.3.1', 3.2);
    expect(m.view()!.rams[0].stalled).toBe(3.2);
  });
  it('never guesses: an unknown siege id, junk payloads and a non-siege line break show nothing', () => {
    const m = new SiegeModel();
    m.waveStarted({ siegeId: 'bogus', n: 1 });
    m.gateDamaged({ siegeId: 'm52', pct: Number.NaN });
    m.waveStarted({} as never);
    m.lineBroken();
    expect(m.view()).toBeNull();
  });
  it('R27 shows when it is a listed siege id and swapping sieges resets', () => {
    const m = new SiegeModel({ siegeIds: () => ['m52', 'r27'] });
    m.waveStarted({ siegeId: 'm52', n: 3 });
    m.waveStarted({ siegeId: 'r27', n: 1 });
    expect(m.view()).toMatchObject({ siegeId: 'r27', wave: 1, gatePct: 100 });
    const only = new SiegeModel({ siegeIds: () => ['m52'] });
    only.waveStarted({ siegeId: 'r27', n: 1 });
    expect(only.view()).toBeNull();
  });
  it('a breach shows and recovers when the gate is patched; the wave cleared flag is between waves', () => {
    const m = new SiegeModel();
    m.waveStarted({ siegeId: 'm52', n: 1 });
    m.gateBreached({ siegeId: 'm52' });
    expect(m.view()).toMatchObject({ breached: true, gatePct: 0 });
    m.gateDamaged({ siegeId: 'm52', pct: 30 });
    expect(m.view()).toMatchObject({ breached: false, gatePct: 30 });
    m.ram('x.cart.1.1', 1, 0);
    m.waveCleared({ siegeId: 'm52', n: 1 });
    expect(m.view()).toMatchObject({ between: true, rams: [] });
  });
  it('the order and line-broken flashes expire; the chips cap with a +n', () => {
    const m = new SiegeModel();
    m.waveStarted({ siegeId: 'm52', n: 1 });
    m.order({ siegeId: 'm52', id: 'brace' });
    m.lineBroken();
    expect(m.view()!.flash).toEqual({ textKey: 'hud.siege.order.brace' });
    expect(m.view()!.lineBroken).toBe(true);
    m.tick(10);
    expect(m.view()).toMatchObject({ flash: null, lineBroken: false });
    for (let i = 0; i < MAX_CHIPS + 3; i++) m.allyArrived({ siegeId: 'm52', id: `a${i}` });
    m.allyArrived({ siegeId: 'm52', id: 'a0' });
    expect(m.view()).toMatchObject({ chipsMore: 3 });
    expect(m.view()!.chips).toHaveLength(MAX_CHIPS);
  });
  it('is hidden once the siege is over, and reset (a load) clears it', () => {
    let over = false;
    const m = new SiegeModel({ over: () => over });
    m.waveStarted({ siegeId: 'm52', n: 4 });
    over = true;
    expect(m.view()).toBeNull();
    over = false;
    m.reset();
    expect(m.view()).toBeNull();
  });
});

describe('SiegeHud widget', () => {
  it('draws the counter, gate, ram, chips and the cues, and hides outside the siege', () => {
    const m = new SiegeModel({ waveTotal: () => 4 });
    const hud = new SiegeHud(new StubDocument(), { model: m, t });
    hud.update(0.1);
    expect(hud.element.style.display).toBe('none');
    m.waveStarted({ siegeId: 'm52', n: 2 });
    m.gateDamaged({ siegeId: 'm52', pct: 40 });
    m.ram('m52.cart.2.1', 0.25, 0);
    m.allyArrived({ siegeId: 'm52', id: 'pikes' });
    m.lineBroken();
    hud.update(0.1);
    const s = textOf(hud.element);
    expect(hud.element.style.display).toBe('block');
    for (const part of ['Wave 2 of 4', 'The Rim Gate: 40%', 'Siege Ram', 'Pikes', 'Line broken: spare them']) expect(s).toContain(part);
    m.setStall('m52.cart.2.1', 2.1);
    m.gateBreached({ siegeId: 'm52' });
    hud.update(0.1);
    expect(textOf(hud.element)).toContain('stalled 3 s');
    expect(textOf(hud.element)).toContain('Breached: clear the court');
  });
  it('reads nothing when the line-broken event never fires, and a throwing poll is harmless', () => {
    const m = new SiegeModel();
    m.waveStarted({ siegeId: 'm52', n: 1 });
    const hud = new SiegeHud(new StubDocument(), {
      model: m,
      t,
      poll: () => {
        throw new Error('x');
      },
    });
    expect(() => hud.update(0.1)).not.toThrow();
    expect(textOf(hud.element)).not.toContain('Line broken');
  });
});
