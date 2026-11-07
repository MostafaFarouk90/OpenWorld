// Regression tests for the fresh review's findings (plans/act5-N9.md section 14).
import { describe, expect, it } from 'vitest';
import { StubDocument, textOf } from '../dom';
import { CreditsModel } from './credits';
import { Act5Screens, CREDITS_END_HOLD_S, type KeyEvt, type KeySource2 } from './Screens';
import { SiegeModel } from './siegeModel';
import { lastChanceNote } from './scarNote';
import { ACT5_HUD_STRINGS_EN } from './strings.en';

const t = (k: string): string => ACT5_HUD_STRINGS_EN[k] ?? k;
class Keys implements KeySource2 {
  private l = { keydown: new Set<(e: KeyEvt) => void>(), keyup: new Set<(e: KeyEvt) => void>() };
  addEventListener(type: 'keydown' | 'keyup', f: (e: KeyEvt) => void): void { this.l[type].add(f); }
  removeEventListener(type: 'keydown' | 'keyup', f: (e: KeyEvt) => void): void { this.l[type].delete(f); }
  press(type: 'keydown' | 'keyup', key: string): void { for (const f of this.l[type]) f({ key }); }
}

describe('siege model: end and seed', () => {
  it('a finished siege hides until it starts a wave again', () => {
    const m = new SiegeModel({ siegeIds: () => ['m52', 'r27'] });
    m.waveStarted({ siegeId: 'r27', n: 2 });
    m.end('r27');
    expect(m.view()).toBeNull();
    m.waveStarted({ siegeId: 'r27', n: 1 });
    expect(m.view()).not.toBeNull();
  });
  it('seeds from the service after a reset so a load shows the right gate before any event', () => {
    const m = new SiegeModel();
    m.waveStarted({ siegeId: 'm52', n: 1 });
    m.reset();
    m.seed({ siegeId: 'm52', wave: 3, gatePct: 70, breached: false });
    expect(m.view()).toMatchObject({ wave: 3, gatePct: 70 });
    m.reset();
    m.seed(null);
    m.seed({ siegeId: 'unknown', wave: 1 });
    expect(m.view()).toBeNull();
  });
});

describe('screens: modal lock, keys, speaker, credits end, phase lines', () => {
  const make = (keys?: Keys) => {
    const log: string[] = [];
    const s = new Act5Screens(new StubDocument(), {
      t, keys, lock: () => { log.push('lock'); return () => log.push('unlock'); }, phaseLines: (id) => [`recap for ${id}`],
    });
    return { s, log };
  };
  it('locks gameplay input while open and releases on close, once', async () => {
    const { s, log } = make();
    const p = s.showEpilogue({ slides: [{ lines: ['a'] }] });
    expect(log).toEqual(['lock']);
    s.finish();
    await p;
    expect(log).toEqual(['lock', 'unlock']);
  });
  it('only interact, Enter and Space advance; a movement key does nothing', () => {
    const keys = new Keys();
    const { s } = make(keys);
    void s.showEpilogue({ slides: [{ lines: ['a'] }, { lines: ['b'] }] });
    s.update(0.6);
    keys.press('keydown', 'w');
    keys.press('keydown', 'Shift');
    expect(s.slideModel!.index).toBe(0);
    keys.press('keydown', 'f');
    expect(s.slideModel!.index).toBe(1);
  });
  it('draws the speaker, and a phase card with no lines builds its own', () => {
    const { s } = make();
    void s.showEpilogue({ speaker: 'Tobb', slides: [{ lines: ['a'] }] });
    expect(textOf(s.element)).toContain('Tobb speaks');
    s.finish();
    void s.showPhaseCard('rim-holds');
    expect(textOf(s.element)).toContain('recap for rim-holds');
  });
  it('the credits hold on the last frame, then close on F or by themselves; any held key skips', async () => {
    const keys = new Keys();
    const { s } = make(keys);
    const def = { blocks: [{ kind: 'heading' as const, text: 'End' }] };
    let p = s.showCredits(def);
    for (let i = 0; i < 200 && !(s.creditsModel as CreditsModel).finished; i++) s.update(0.5);
    expect(s.active()).toBe(true);
    expect(textOf(s.element)).toContain('Press F to continue');
    keys.press('keydown', 'f');
    await p;
    expect(s.active()).toBe(false);
    p = s.showCredits(def);
    for (let i = 0; i < 200 && !(s.creditsModel as CreditsModel).finished; i++) s.update(0.5);
    s.update(CREDITS_END_HOLD_S + 0.1);
    await p;
    expect(s.active()).toBe(false);
    p = s.showCredits({ blocks: [{ kind: 'heading' as const, text: 'End', names: Array.from({ length: 50 }, (_, i) => `n${i}`) }] });
    s.update(0.6);
    keys.press('keydown', 'w');
    s.update(1.6);
    await p;
    expect(s.active()).toBe(false);
  });
});

describe('lastChanceNote only lists quests that can be started', () => {
  const ports = (needs: Record<string, string[]>, states: Record<string, string>) => ({
    flag: () => false,
    questState: (id: string) => states[id] ?? 'inactive',
    questDef: () => ({ titleKey: 'k' }),
    needs: (id: string) => needs[id] ?? [],
    t,
  });
  it('an inactive quest whose prerequisites are not done is not listed', () => {
    const n = lastChanceNote(ports({ r28: ['m52'], r30: ['zz'] }, { d09: 'completed', r27: 'completed', m52: 'completed', zz: 'inactive', r29: 'completed' }))!;
    expect(n.lines).toHaveLength(2); // r28 only, plus the optional line
    expect(lastChanceNote(ports({ r28: ['zz'], r30: ['zz'] }, { d09: 'completed', r27: 'completed', r29: 'completed' }))).toBeNull();
  });
});
