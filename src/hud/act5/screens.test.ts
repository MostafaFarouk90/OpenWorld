import { describe, expect, it } from 'vitest';
import { StubDocument, textOf } from '../dom';
import { CARD_HOLD_S, CreditsModel, type CreditsDef } from './credits';
import { Act5Screens, SKIP_HOLD_S, type KeyEvt, type KeySource2 } from './Screens';
import { SlideModel } from './slides';
import { ACT5_HUD_STRINGS_EN } from './strings.en';
import { rimHoldsLines } from './phaseCard';

const t = (k: string): string => ACT5_HUD_STRINGS_EN[k] ?? k;

class Keys implements KeySource2 {
  private l = { keydown: new Set<(e: KeyEvt) => void>(), keyup: new Set<(e: KeyEvt) => void>() };
  addEventListener(type: 'keydown' | 'keyup', f: (e: KeyEvt) => void): void {
    this.l[type].add(f);
  }
  removeEventListener(type: 'keydown' | 'keyup', f: (e: KeyEvt) => void): void {
    this.l[type].delete(f);
  }
  press(type: 'keydown' | 'keyup', key: string): void {
    for (const f of this.l[type]) f({ key });
  }
}

const DEF: CreditsDef = {
  blocks: [
    { kind: 'heading', text: 'Embers of Valdren', names: ['A', 'B'] },
    { kind: 'verse', step: 'verse1', lines: ['l1', 'l2'] },
    { kind: 'card', id: 'dlc1', title: 'Saltmere', lines: ['a ship'] },
    { kind: 'verse', step: 'chosen', lines: ['c'] },
    { kind: 'verse', step: 'last', lines: ['z'] },
  ],
};

describe('SlideModel', () => {
  it('takes any string list: 0, 1 and 8 slides, drops blank lines and empty slides', () => {
    expect(new SlideModel({ slides: [] }).finished).toBe(true);
    expect(new SlideModel({ slides: [{ lines: ['', '  '] }] }).finished).toBe(true);
    const one = new SlideModel({ slides: [{ lines: ['x', ''] }] });
    expect(one.current!.lines).toEqual(['x']);
    expect(one.next()).toBe(true);
    const eight = new SlideModel({ speaker: 'Tobb', slides: Array.from({ length: 8 }, (_, i) => ({ lines: [`s${i}`] })) });
    let ended = false;
    for (let i = 0; i < 8; i++) ended = eight.next();
    expect(ended).toBe(true);
    expect(eight.finished).toBe(true);
  });
  it('back at slide 1 does nothing; finish is once', () => {
    const m = new SlideModel({ slides: [{ lines: ['a'] }, { lines: ['b'] }] });
    m.back();
    expect(m.index).toBe(0);
    m.next();
    m.back();
    expect(m.index).toBe(0);
    expect(m.finish()).toBe(true);
    expect(m.finish()).toBe(false);
  });
});

describe('CreditsModel', () => {
  it('scrolls to the end headless, fires each ballad step once, and ends once', () => {
    const m = new CreditsModel(DEF);
    const steps: string[] = [];
    m.onStep = (s) => steps.push(s);
    let ends = 0;
    for (let i = 0; i < 100000 && !m.finished; i++) if (m.update(0.1)) ends++;
    expect(ends).toBe(1);
    expect(m.progress).toBe(1);
    expect(steps).toEqual(['verse1', 'chosen', 'last']);
    expect(m.update(1)).toBe(false);
    expect(m.duration).toBeGreaterThan(CARD_HOLD_S);
  });
  it('finish skips to the end and still reports the ballad steps; an empty roll is already finished', () => {
    const m = new CreditsModel(DEF);
    const steps: string[] = [];
    m.onStep = (s) => steps.push(s);
    expect(m.finish()).toBe(true);
    expect(steps).toHaveLength(3);
    expect(m.finish()).toBe(false);
    expect(new CreditsModel({ blocks: [] }).finished).toBe(true);
  });
});

describe('Act5Screens', () => {
  const make = (keys?: Keys) => {
    const closed: string[] = [];
    const s = new Act5Screens(new StubDocument(), { t, keys, closed: (k, id) => closed.push(id ? `${k}:${id}` : k) });
    return { s, closed };
  };
  it('the phase card shows its lines, arms for half a second, then closes once on a key', async () => {
    const keys = new Keys();
    const { s, closed } = make(keys);
    const p = s.showPhaseCard('rim-holds', ['one', 'two']);
    expect(s.active()).toBe(true);
    expect(textOf(s.element)).toContain('The Rim holds');
    keys.press('keydown', 'f');
    expect(s.active()).toBe(true);
    s.update(0.6);
    keys.press('keydown', 'f');
    await p;
    expect(s.active()).toBe(false);
    expect(closed).toEqual(['phaseCard:rim-holds']);
    s.advance();
    expect(closed).toHaveLength(1);
  });
  it('the epilogue advances through any list, goes back, and closes after the last; zero slides close at once', async () => {
    const { s, closed } = make();
    const none = s.showEpilogue({ slides: [] });
    await none;
    expect(closed).toEqual(['epilogue']);
    const p = s.showEpilogue({ slides: [{ lines: ['a'] }, { lines: ['b'] }] });
    expect(textOf(s.element)).toContain('a');
    s.advance();
    expect(textOf(s.element)).toContain('b');
    s.advance();
    await p;
    expect(s.active()).toBe(false);
  });
  it('holding Escape skips the credits and the epilogue; a tap does not', async () => {
    const keys = new Keys();
    const { s, closed } = make(keys);
    const c = s.showCredits(DEF);
    s.update(0.6);
    keys.press('keydown', 'Escape');
    s.update(SKIP_HOLD_S - 0.5);
    expect(s.active()).toBe(true);
    keys.press('keyup', 'Escape');
    s.update(SKIP_HOLD_S);
    expect(s.active()).toBe(true);
    keys.press('keydown', 'Escape');
    s.update(SKIP_HOLD_S + 0.1);
    await c;
    expect(closed).toContain('credits');
  });
  it('the credits roll to the end headless and call the ballad step hook; a second screen replaces the first', async () => {
    const { s, closed } = make();
    const steps: string[] = [];
    const first = s.showEpilogue({ slides: [{ lines: ['a'] }] });
    const c = s.showCredits(DEF, { onStep: (x) => steps.push(x) });
    await first;
    for (let i = 0; i < 100000 && s.active(); i++) s.update(0.5);
    await c;
    expect(steps).toEqual(['verse1', 'chosen', 'last']);
    expect(closed).toEqual(['epilogue', 'credits']);
  });
  it('dispose removes key listeners', () => {
    const keys = new Keys();
    const { s } = make(keys);
    s.dispose();
    s.showPhaseCard('x', []);
    s.update(1);
    keys.press('keydown', 'f');
    expect(s.active()).toBe(true);
  });
});

describe('rimHoldsLines', () => {
  it('drops rows whose flag is missing, keeps the last line, and survives a throwing reader', () => {
    expect(rimHoldsLines(() => false, t)).toEqual(['hud.phase.rimHolds.next'.replace('hud.phase.rimHolds.next', t('hud.phase.rimHolds.next'))]);
    const lines = rimHoldsLines((k) => k === 'story.m52.complete', t);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Rim Gate');
    expect(rimHoldsLines(() => { throw new Error('x'); }, t)).toHaveLength(1);
  });
});
