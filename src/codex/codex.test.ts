import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus';
import type { GameEventMap } from '../core/events';
import { Services } from '../core/Services';
import { StubDocument, textOf, type ElementLike } from '../hud/dom';
import { StringTable } from '../strings/StringTable';
import { CodexModel, normaliseTally } from './CodexModel';
import { CODEX_MODAL_ID, createCodexModal } from './CodexView';
import { CODEX_ENTRIES, CodexRegistry, HOWTO_IDS, codexEntry, entriesOf } from './entries';
import codexPlugin from './codex.plugin';
import { CODEX_STRINGS_EN } from './strings.en';
import type { CodexService } from './service';

beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('CodexModel', () => {
  it('unlock and has', () => {
    const m = new CodexModel();
    expect(m.has('howto.release')).toBe(false);
    expect(m.unlock('howto.release')).toBe(true);
    expect(m.unlock('howto.release')).toBe(false);
    expect(m.has('howto.release')).toBe(true);
    expect(m.unlock('')).toBe(false);
  });

  it('round trips only unlocked and read', () => {
    const m = new CodexModel();
    m.unlock('a');
    m.unlock('b');
    m.markRead('a');
    m.markRead('zzz'); // not unlocked: ignored
    const saved = JSON.parse(JSON.stringify(m.serialize()));
    expect(Object.keys(saved).sort()).toEqual(['read', 'unlocked']);
    const n = new CodexModel();
    n.load(saved);
    expect(n.serialize()).toEqual({ unlocked: ['a', 'b'], read: ['a'] });
  });

  it('survives corrupt payloads and warns', () => {
    const warn = vi.fn();
    const m = new CodexModel();
    for (const bad of [null, 5, 'x', [1], { unlocked: 'nope', read: 3 }]) {
      m.load(bad, warn);
      expect(m.serialize()).toEqual({ unlocked: [], read: [] });
    }
    expect(warn).toHaveBeenCalled();
    m.load({ unlocked: ['ok', 3, null, ''], read: [{}] }, warn);
    expect(m.serialize().unlocked).toEqual(['ok']);
  });

  it('keeps unknown string ids', () => {
    const m = new CodexModel();
    m.load({ unlocked: ['lore.from-a-future-build'] });
    expect(m.has('lore.from-a-future-build')).toBe(true);
  });

  it('normalises tallies from records and maps', () => {
    const r = normaliseTally({ 'ash-wraith': { release: 2, spare: 1.9, calm: -1, killed: 'x' }, bad: 3 });
    expect(r.get('ash-wraith')).toEqual({ release: 2, spare: 1, calm: 0, killed: 0 });
    expect(r.has('bad')).toBe(false);
    expect(normaliseTally(new Map([['k', { release: 1 }]])).get('k')?.release).toBe(1);
    expect(normaliseTally(undefined).size).toBe(0);
  });
});

describe('strings', () => {
  it('has a name and body for every entry and registers cleanly', () => {
    for (const e of CODEX_ENTRIES) {
      expect(CODEX_STRINGS_EN[e.nameKey]).toBeTruthy();
      expect(CODEX_STRINGS_EN[e.bodyKey]).toBeTruthy();
    }
    expect(() => new StringTable().register('en', CODEX_STRINGS_EN)).not.toThrow();
  });

  it('has no scarecrow or Blightbloom entry', () => {
    expect(CODEX_ENTRIES.map((e) => e.id).join(' ')).not.toMatch(/scarecrow|blightbloom/);
  });
});

function findAll(el: ElementLike, cls: string, out: ElementLike[] = []): ElementLike[] {
  if (el.className.split(' ').includes(cls)) out.push(el);
  for (const c of el.children) findAll(c, cls, out);
  return out;
}

function makeView(unlocked: string[] = [], tally: ((k: string) => any) | null = null) {
  const set = new Set(unlocked);
  const strings = new StringTable();
  strings.register('en', CODEX_STRINGS_EN);
  const view = createCodexModal({
    has: (id) => set.has(id),
    markRead: () => {},
    isRead: () => false,
    tally: tally ?? (() => null),
    t: (k, p) => strings.t(k, p),
    doc: new StubDocument(),
  });
  return { view, set, root: view.element as unknown as ElementLike };
}

describe('CodexView', () => {
  it('masks locked entries with ???', () => {
    const { root } = makeView();
    const items = findAll(root, 'codex-modal__item').concat(findAll(root, 'codex-modal__item--selected'));
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(i.textContent).toBe('???');
    expect(textOf(root)).not.toContain('Footman');
  });

  it('shows names and detail when unlocked', () => {
    const { root } = makeView(['blighted-soldier']);
    expect(textOf(root)).toContain('Charred Footman');
  });

  it('keyboard: tabs wrap, selection clamps', () => {
    const { view } = makeView();
    expect(view.tab).toBe('bestiary');
    view.key('ArrowRight');
    expect(view.tab).toBe('lore');
    view.key('ArrowRight');
    view.key('ArrowRight');
    expect(view.tab).toBe('bestiary');
    view.key('ArrowLeft');
    expect(view.tab).toBe('howto');
    expect(view.selectedId).toBe(entriesOf('howto')[0].id);
    view.key('ArrowDown');
    expect(view.selectedId).toBe(entriesOf('howto')[1].id);
    for (let i = 0; i < 20; i++) view.key('ArrowDown');
    expect(view.selectedId).toBe(entriesOf('howto').at(-1)!.id);
    for (let i = 0; i < 20; i++) view.key('ArrowUp');
    expect(view.selectedId).toBe(entriesOf('howto')[0].id);
    expect(view.key('KeyQ')).toBe(false);
  });

  it('tally row shows zeros without the service and counts with it', () => {
    const none = makeView(['ash-wraith']);
    none.view.key('ArrowDown');
    expect(textOf(none.root)).toContain('Released 0 · Spared 0 · Calmed 0');
    const some = makeView(['ash-wraith'], () => ({ release: 2, spare: 1, calm: 0, killed: 4 }));
    some.view.key('ArrowDown');
    expect(textOf(some.root)).toContain('Released 2 · Spared 1 · Calmed 0');
  });

  it('refreshes on update when an entry unlocks', () => {
    const { view, set, root } = makeView();
    expect(textOf(root)).not.toContain('Charred Footman');
    set.add('blighted-soldier');
    view.update?.(0.1);
    expect(textOf(root)).toContain('Charred Footman');
  });

  it('select jumps to the entry tab', () => {
    const { view } = makeView();
    view.select('howto.rally-cry');
    expect(view.tab).toBe('howto');
    expect(view.selectedId).toBe('howto.rally-cry');
    view.select('nonsense');
    expect(view.selectedId).toBe('howto.rally-cry');
  });
});

// ---- plugin against a fake context ----

interface Rig {
  events: EventBus<GameEventMap>;
  services: Services;
  flags: Map<string, boolean | number>;
  saved: Map<string, { version: number; serialize(): unknown; load(d: unknown, v: number): void }>;
  pressed: Set<string>;
  systems: Array<{ fixedUpdate(dt: number): void }>;
  modal: { id: string | null; closers: number };
  blockModal: boolean;
  top: string;
  codex: CodexService;
  tick(...actions: string[]): void;
  widget(): any;
}

async function rig(opts: { enemies?: () => unknown; noHud?: boolean } = {}): Promise<Rig> {
  const events = new EventBus<GameEventMap>();
  const services = new Services();
  const flags = new Map<string, boolean | number>();
  const saved: Rig['saved'] = new Map();
  const systems: Rig['systems'] = [];
  const pressed = new Set<string>();
  let widget: any = null;
  const r = { modal: { id: null as string | null, closers: 0 }, blockModal: false, top: 'gameplay' } as Rig;
  const strings = new StringTable();
  const ctx: any = {
    events,
    services,
    strings,
    state: {
      getBool: (k: string) => (typeof flags.get(k) === 'boolean' ? flags.get(k) : false),
      getNumber: (k: string) => (typeof flags.get(k) === 'number' ? flags.get(k) : 0),
    },
    persist: { register: (p: any) => void saved.set(p.key, p) },
    systems: { add: (s: any) => void systems.push(s) },
    input: {
      actions: { pressed: (a: string) => pressed.has(a) },
      contexts: { top: () => r.top },
      bindings: { glyph: (a: string) => ({ mercy: 'G', surgeLeap: 'Q', codex: 'K', menu: 'Tab' })[a] ?? '?' },
    },
    actors: { get: (id: string) => (id === 'w1' ? { kind: 'ash-wraith' } : undefined) },
    hud: {
      get modalOpen() {
        return r.modal.id;
      },
      openModal: (w: any) => {
        if (r.blockModal || r.modal.id) return null;
        r.modal.id = w.id;
        widget = w;
        events.emit('ui.modal', { id: w.id, open: true });
        return () => {
          r.modal.closers++;
          r.modal.id = null;
          events.emit('ui.modal', { id: w.id, open: false });
        };
      },
    },
  };
  if (opts.enemies) services.provide('enemies' as any, { mercyTally: opts.enemies } as any);
  await codexPlugin.setup(ctx);
  Object.assign(r, {
    events, services, flags, saved, pressed, systems,
    codex: services.get('codex')!,
    tick: (...a: string[]) => {
      pressed.clear();
      a.forEach((x) => pressed.add(x));
      for (const s of systems) s.fixedUpdate(1 / 60);
      pressed.clear();
    },
    widget: () => widget,
  });
  return r;
}

const mercy = (verb: string, creature: string) =>
  ({ verb, tier: 'normal', track: null, creature }) as GameEventMap['mercy'];

describe('codex plugin', () => {
  it('provides the service and persists under key codex v1', async () => {
    const r = await rig();
    expect(r.codex.has('x')).toBe(false);
    r.codex.unlock('x');
    expect(r.codex.has('x')).toBe(true);
    const p = r.saved.get('codex')!;
    expect(p.version).toBe(1);
    const data = JSON.parse(JSON.stringify(p.serialize()));
    expect(Object.keys(data).sort()).toEqual(['read', 'unlocked']);
    const r2 = await rig();
    r2.saved.get('codex')!.load(data, 1);
    expect(r2.codex.has('x')).toBe(true);
    r2.saved.get('codex')!.load({ unlocked: 'bad' }, 1);
    expect(r2.codex.has('x')).toBe(false);
  });

  it('splits Release and Spare by mercy verb and unlocks the creature', async () => {
    const r = await rig();
    r.events.emit('mercy', mercy('release', 'ash-wraith'));
    expect(r.codex.has('howto.release')).toBe(true);
    expect(r.codex.has('howto.spare')).toBe(false);
    expect(r.codex.has('ash-wraith')).toBe(true);
    r.events.emit('mercy', mercy('spare', 'blighted-soldier'));
    expect(r.codex.has('howto.spare')).toBe(true);
    expect(r.codex.has('blighted-soldier')).toBe(true);
    r.events.emit('mercy', mercy('calm', 'scarecrow'));
    expect(r.codex.has('scarecrow')).toBe(false);
  });

  it('unlocks one Calm how-to for calm and for warmHand', async () => {
    const r = await rig();
    expect(r.codex.has('howto.calm')).toBe(false);
    r.events.emit('mercy', mercy('calm', 'ember-hound'));
    expect(r.codex.has('howto.calm')).toBe(true);
    const r2 = await rig();
    r2.events.emit('mercy', mercy('warmHand', 'ember-hound'));
    expect(r2.codex.has('howto.calm')).toBe(true);
    expect(r2.codex.has('howto.release')).toBe(false);
  });

  it('unlocks on ability.learned, skill.learned, boss.started, aggro, scar, warmth', async () => {
    const r = await rig();
    r.events.emit('ability.learned', { id: 'surge-leap', source: 'm03' });
    r.events.emit('ability.learned', { id: 'something-else', source: 'x' });
    expect(r.codex.has('howto.surge-leap')).toBe(true);
    expect(r.codex.has('howto.rally-cry')).toBe(false);
    r.events.emit('companion.joined' as any, { companionId: 'tobb', actorId: 'a' });
    expect(r.codex.has('howto.rally-cry')).toBe(false); // joining a companion is not learning Rally Cry
    r.events.emit('skill.learned' as any, { skillId: 'knight.oathward' });
    expect(r.codex.has('howto.rally-cry')).toBe(false);
    r.events.emit('skill.learned' as any, { skillId: 'knight.rallyCry' });
    expect(r.codex.has('howto.rally-cry')).toBe(true);
    r.events.emit('boss.started', { bossId: 'ashen-prior', actorId: 'b' });
    expect(r.codex.has('ashen-prior')).toBe(true);
    r.events.emit('ai.aggro', { actorId: 'w1', targetId: 'player' });
    expect(r.codex.has('ash-wraith')).toBe(true);
    r.events.emit('scar.added', { total: 1, source: 'x' });
    expect(r.codex.has('howto.burn-scars')).toBe(true);
    r.events.emit('warmth.changed', { tier: 0, previous: 1 });
    expect(r.codex.has('howto.warmth-tier')).toBe(false);
    r.events.emit('warmth.changed', { tier: 1, previous: 0 });
    expect(r.codex.has('howto.warmth-tier')).toBe(true);
  });

  it('backfills from flags and the tally after load, with no codex entry in the save', async () => {
    const tally = { 'ash-wraith': { release: 3, spare: 0, calm: 0, killed: 0 }, 'blighted-soldier': { release: 0, spare: 2, calm: 0, killed: 5 } };
    const r = await rig({ enemies: () => tally });
    r.flags.set('prompt.mercy.count', 5);
    r.flags.set('prompt.surgeLeap.count', 1);
    r.services.provide('progression' as any, { learned: (id: string) => id === 'knight.rallyCry' } as any);
    // A save without a codex entry: the persistable's load is never called.
    expect(r.codex.has('howto.release')).toBe(false);
    r.events.emit('save.loaded', { slot: 'a' });
    for (const id of ['howto.release', 'howto.spare', 'howto.surge-leap', 'howto.rally-cry', 'ash-wraith', 'blighted-soldier']) {
      expect(r.codex.has(id)).toBe(true);
    }
    expect(r.codex.has('howto.warmth-tier')).toBe(false);
  });

  it('backfill without a tally service falls back to Release only', async () => {
    const r = await rig();
    r.flags.set('prompt.mercy.count', 1);
    r.events.emit('save.loaded', { slot: 'a' });
    expect(r.codex.has('howto.release')).toBe(true);
    expect(r.codex.has('howto.spare')).toBe(false);
  });

  it('backfill after a codex load keeps loaded ids', async () => {
    const r = await rig();
    r.saved.get('codex')!.load({ unlocked: ['lore.leap-a'] }, 1);
    r.flags.set('shrine.quenchstone.lit', true);
    r.events.emit('save.loaded', { slot: 'a' });
    expect(r.codex.has('lore.leap-a')).toBe(true);
    expect(r.codex.has('howto.warmth-tier')).toBe(true);
  });

  it('a throwing tally does not break backfill', async () => {
    const r = await rig({ enemies: () => { throw new Error('boom'); } });
    r.flags.set('prompt.mercy.count', 1);
    expect(() => r.events.emit('save.loaded', { slot: 'a' })).not.toThrow();
    expect(r.codex.has('howto.release')).toBe(true);
  });

  it('toggles open and closed on L, closes on Esc', async () => {
    const r = await rig();
    r.tick('codex');
    expect(r.modal.id).toBe(CODEX_MODAL_ID);
    r.tick('codex');
    expect(r.modal.id).toBeNull();
    r.tick('codex');
    expect(r.modal.id).toBe(CODEX_MODAL_ID);
    r.tick('menu');
    expect(r.modal.id).toBeNull();
    expect(r.modal.closers).toBe(2);
    r.tick('menu'); // nothing open: no effect
    expect(r.modal.id).toBeNull();
  });

  it('does not open outside gameplay', async () => {
    const r = await rig();
    r.top = 'dialogue';
    r.tick('codex');
    expect(r.modal.id).toBeNull();
  });

  it('open() is a safe no-op while another modal is open', async () => {
    const r = await rig();
    r.modal.id = 'map.modal';
    expect(() => r.codex.open()).not.toThrow();
    r.tick('codex');
    expect(r.modal.id).toBe('map.modal');
    r.modal.id = null;
    r.blockModal = true;
    expect(() => r.codex.open('howto.release')).not.toThrow();
    r.blockModal = false;
    r.codex.open('howto.release');
    expect(r.widget().selectedId).toBe('howto.release');
    r.codex.open('lore.leap-b'); // already open: just selects
    expect(r.widget().selectedId).toBe('lore.leap-b');
  });

  it('shows the tally from the service in the open modal, zeros without', async () => {
    const r = await rig({ enemies: () => ({ 'ash-wraith': { release: 2, spare: 1, calm: 3, killed: 0 } }) });
    r.codex.unlock('ash-wraith');
    r.codex.open('ash-wraith');
    expect(textOf(r.widget().element)).toContain('Released 2 · Spared 1 · Calmed 3');
    const bare = await rig();
    bare.codex.unlock('ash-wraith');
    bare.codex.open('ash-wraith');
    expect(textOf(bare.widget().element)).toContain('Released 0 · Spared 0 · Calmed 0');
  });

  it('works with no hud services other than core, and a locked entry stays masked', async () => {
    const r = await rig();
    r.codex.open('ash-wraith');
    expect(textOf(r.widget().element)).toContain('???');
  });

  it('Warmth Tier backfills from the warmth service tier, not a stored flag', async () => {
    const r = await rig();
    r.flags.set('warmth.tier', 3); // a flag that never exists in the real game: must not count
    r.events.emit('save.loaded', { slot: 'a' });
    expect(r.codex.has('howto.warmth-tier')).toBe(false);
    r.services.provide('warmth' as any, { tier: () => 2 } as any);
    r.events.emit('save.loaded', { slot: 'a' });
    expect(r.codex.has('howto.warmth-tier')).toBe(true);
  });

  it('a lit shrine flag unlocks Warmth Tier live and on load', async () => {
    const r = await rig();
    r.flags.set('shrine.hushed-anvil.lit', true);
    r.events.emit('flag.changed' as any, { key: 'shrine.hushed-anvil.lit', value: true });
    expect(r.codex.has('howto.warmth-tier')).toBe(true);
  });

  it('shows bound glyphs, not hard-coded keys, and follows a rebind', async () => {
    const r = await rig();
    r.codex.unlock('howto.release');
    r.codex.unlock('howto.surge-leap');
    r.codex.open('howto.release');
    let text = textOf(r.widget().element);
    expect(text).toContain('Hold G near');
    expect(text).toContain('K or Tab: close');
    expect(text).not.toContain('Hold T');
    r.widget().select('howto.surge-leap');
    expect(textOf(r.widget().element)).toContain('Press Q to leap');
  });

  it('polls the mercy tally at most 10 Hz while open', () => {
    let t = 0;
    const calls = vi.fn(() => ({ release: 1, spare: 0, calm: 0, killed: 0 }));
    const view = createCodexModal({
      has: () => true,
      markRead: () => {},
      isRead: () => true,
      tally: calls,
      t: (k) => k,
      now: () => t,
      glyph: () => 'x',
    });
    view.select('ash-wraith');
    const base = calls.mock.calls.length;
    for (let i = 0; i < 30; i++) {
      t += 1;
      view.update?.(1 / 60);
    }
    expect(calls.mock.calls.length - base).toBeLessThanOrEqual(1);
    t += 200;
    view.update?.(1 / 60);
    expect(calls.mock.calls.length - base).toBeGreaterThanOrEqual(1);
  });
});

describe('codex.register', () => {
  const defs = [
    codexEntry('howto', 'howto.mage.blink', 'mage-blink', 'blink'),
    codexEntry('lore', 'lore.mage.tower', 'mage-tower'),
    codexEntry('bestiary', 'mage-imp', 'mage-imp'),
  ];
  const view = (reg: CodexRegistry, unlocked: string[] = []) => {
    const set = new Set(unlocked);
    const strings = new StringTable();
    strings.register('en', {
      ...CODEX_STRINGS_EN,
      'codex.howto.mage-blink.name': 'Blink', 'codex.howto.mage-blink.body': 'Press {key} to blink.',
    });
    const v = createCodexModal({
      has: (id) => set.has(id), markRead: () => {}, isRead: () => false, tally: () => null,
      t: (k, p) => strings.t(k, p), glyph: (a) => (a === 'blink' ? 'B' : '?'), entries: reg, doc: new StubDocument(),
    });
    return { v, set };
  };

  it('registers after built-ins in order, in each tab, and dispose removes exactly them (idempotent)', () => {
    const reg = new CodexRegistry();
    const builtinHowto = entriesOf('howto').length;
    const off = reg.register(defs);
    expect(reg.of('howto').map((e) => e.id).slice(builtinHowto)).toEqual(['howto.mage.blink']);
    expect(reg.of('lore').at(-1)?.id).toBe('lore.mage.tower');
    expect(reg.of('bestiary').at(-1)?.id).toBe('mage-imp');
    const other = reg.register([codexEntry('howto', 'howto.other', 'other')]);
    off();
    off();
    expect(reg.find('howto.mage.blink')).toBeUndefined();
    expect(reg.find('howto.other')).toBeDefined();
    other();
    expect(reg.of('howto')).toHaveLength(builtinHowto);
  });

  it('skips duplicates (built-in and registered) with a warning, adds the rest; dispose spares the original', () => {
    const warn = vi.fn();
    const reg = new CodexRegistry(undefined, warn);
    const first = reg.register([defs[0]]);
    const off = reg.register([codexEntry('howto', HOWTO_IDS.release, 'x'), defs[0], defs[1]]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(reg.find(HOWTO_IDS.release)?.nameKey).toBe('codex.howto.release.name');
    expect(reg.find('lore.mage.tower')).toBeDefined();
    off();
    expect(reg.find('howto.mage.blink')).toBeDefined();
    expect(reg.find('lore.mage.tower')).toBeUndefined();
    first();
  });

  it('skips invalid entries with a warning', () => {
    const warn = vi.fn();
    const reg = new CodexRegistry(undefined, warn);
    const bad: any[] = [null, { tab: 'howto', nameKey: 'a', bodyKey: 'b' }, { id: 'x', tab: 'nope', nameKey: 'a', bodyKey: 'b' },
      { id: 'y', tab: 'howto' }, { id: '', tab: 'howto', nameKey: 'a', bodyKey: 'b' }];
    reg.register([...bad, defs[0]]);
    expect(warn).toHaveBeenCalledTimes(bad.length);
    expect(reg.find('howto.mage.blink')).toBeDefined();
    expect(() => reg.register(undefined as any)).not.toThrow();
  });

  it('view: glyph action from the def, locked masking, re-render when open on register and dispose', () => {
    const reg = new CodexRegistry();
    const { v, set } = view(reg);
    const root = v.element as unknown as ElementLike;
    v.key('ArrowRight');
    v.key('ArrowRight');
    expect(v.tab).toBe('howto');
    const off = reg.register([defs[0]]);
    v.update?.(0);
    expect(findAll(root, 'codex-modal__item').length).toBe(entriesOf('howto').length + 1);
    set.add('howto.mage.blink');
    v.select('howto.mage.blink');
    expect(textOf(root)).toContain('Press B to blink.');
    off();
    v.update?.(0);
    expect(v.selectedId).not.toBe('howto.mage.blink');
    expect(textOf(root)).not.toContain('Blink');
  });

  it('service: unlock before register shows unlocked; persisted unknown ids are retained', async () => {
    const r = await rig();
    r.codex.unlock('howto.mage.blink');
    r.saved.get('codex')!.load({ unlocked: ['howto.mage.blink', 'lore.future'], read: [] }, 1);
    expect(r.codex.has('howto.mage.blink')).toBe(true);
    const off = r.codex.register([defs[0]]);
    expect(r.codex.has('howto.mage.blink')).toBe(true);
    off();
    off();
    expect(r.codex.has('howto.mage.blink')).toBe(true);
    expect(r.saved.get('codex')!.serialize()).toMatchObject({ unlocked: ['howto.mage.blink', 'lore.future'] });
  });

  it('service: open codex re-renders on register', async () => {
    const r = await rig();
    r.codex.open('howto.release');
    const w = r.widget();
    const off = r.codex.register([defs[0]]);
    r.codex.unlock('howto.mage.blink');
    w.update(0);
    w.select('howto.mage.blink');
    expect(w.selectedId).toBe('howto.mage.blink');
    off();
    w.update(0);
    expect(w.selectedId).not.toBe('howto.mage.blink');
  });
});

describe('Act 2 codex (A15)', () => {
  it('every Act 2 entry has name and body strings, unique ids, and none collides with Act 1 or the other threads\' ids', async () => {
    const { ACT2_CODEX_ENTRIES, ACT2_CODEX_STRINGS_EN } = await import('./act2');
    const ids = ACT2_CODEX_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of ACT2_CODEX_ENTRIES) {
      expect(ACT2_CODEX_STRINGS_EN[e.nameKey], e.nameKey).toBeTruthy();
      expect(ACT2_CODEX_STRINGS_EN[e.bodyKey], e.bodyKey).toBeTruthy();
    }
    const others = [...CODEX_ENTRIES.map((e) => e.id), 'lore.hushed-anvil.mural-1', 'lore.hushed-anvil.mural-2', 'lore.hushed-anvil.mural-3', 'lore.poi.lore-stone-1', 'cinder-golem', 'slag-crawler', 'kindling-fox', 'hunter-spearman', 'hunter-harpooner', 'ember-wyrm', 'wyrmling'];
    for (const id of ids) expect(others).not.toContain(id);
  });

  it('registers cleanly with the built-ins (no duplicate warning)', async () => {
    await rig();
    expect((console.warn as any).mock.calls.filter((c: unknown[]) => String(c[0]).includes('codex'))).toEqual([]);
  });

  it('a registered boss id unlocks on boss.started, once; an unknown boss does nothing; Act 1 ids behave as before', async () => {
    const r = await rig();
    expect(r.codex.has('thrandil-redmane')).toBe(false);
    r.events.emit('boss.started', { bossId: 'thrandil-redmane', actorId: 'b' });
    expect(r.codex.has('thrandil-redmane')).toBe(true);
    r.events.emit('boss.started', { bossId: 'the-slagmaw', actorId: 'b2' });
    expect(r.codex.has('the-slagmaw')).toBe(true);
    r.events.emit('boss.started', { bossId: 'nobody', actorId: 'b3' });
    expect(r.codex.has('nobody')).toBe(false);
    r.events.emit('boss.started', { bossId: 'ashen-prior', actorId: 'b4' });
    expect(r.codex.has('ashen-prior')).toBe(true);
  });

  it('a registered bestiary kind unlocks on sight and on a mercy event; a lore id is not treated as a creature', async () => {
    const r = await rig();
    const off = r.codex.register([codexEntry('bestiary', 'ember-wyrm', 'ember-wyrm')]);
    r.events.emit('mercy', mercy('calm', 'ember-wyrm'));
    expect(r.codex.has('ember-wyrm')).toBe(true);
    r.events.emit('mercy', mercy('calm', 'lore.pickett'));
    expect(r.codex.has('lore.pickett')).toBe(false);
    off();
  });

  it('how-tos unlock on their events', async () => {
    const r = await rig();
    r.events.emit('boss.spared', { bossId: 'someone-else', actorId: 'a' });
    expect(r.codex.has('howto.spare-redmane')).toBe(false);
    r.events.emit('boss.spared', { bossId: 'thrandil-redmane', actorId: 'a' });
    expect(r.codex.has('howto.spare-redmane')).toBe(true);
    r.events.emit('gear.tempered', { itemId: 'x', level: 1 });
    expect(r.codex.has('howto.tempering')).toBe(true);
    r.events.emit('rite.performed', { act: 2, removed: 1 });
    expect(r.codex.has('howto.hearth-rite')).toBe(true);
    r.events.emit('party.offered', { waystoneId: 'w' });
    expect(r.codex.has('howto.party')).toBe(true);
  });

  it('places unlock on discovery; unknown places and a repeat do nothing new', async () => {
    const r = await rig();
    r.events.emit('discover', { placeId: 'waystone.cinderford', kind: 'waystone' });
    expect(r.codex.has('lore.place.cinderford')).toBe(true);
    r.events.emit('discover', { placeId: 'oldsmoke', kind: 'region' });
    expect(r.codex.has('lore.place.oldsmoke-mines')).toBe(true);
    r.events.emit('discover', { placeId: 'camp-1', kind: 'poi' });
    r.events.emit('discover', { placeId: 'waystone.cinderford', kind: 'waystone' });
    expect(r.codex.has('lore.place.deepgate')).toBe(false);
  });

  it('quest events unlock their places; a different quest or phase does not; no flag names are involved', async () => {
    const r = await rig();
    r.events.emit('quest.started', { questId: 'd03' });
    expect(r.codex.has('lore.place.scorchhold')).toBe(true);
    r.events.emit('quest.started', { questId: 'm19' }); // the nursery waits for completion
    expect(r.codex.has('lore.nursery')).toBe(false);
    r.events.emit('quest.completed', { questId: 'm19' });
    expect(r.codex.has('lore.nursery')).toBe(true);
    r.events.emit('quest.started', { questId: 'r08' });
    expect(r.codex.has('lore.pickett')).toBe(true);
    r.events.emit('quest.started', { questId: 'm01' });
    expect(r.codex.has('lore.place.deepgate')).toBe(false);
  });

  it('a load backfills from the quests service and the discovery flag', async () => {
    const r = await rig();
    const states: Record<string, string> = { d03: 'completed', m16: 'active', r08: 'inactive', m19: 'active' };
    r.services.provide('quests' as any, { state: (id: string) => states[id] ?? 'inactive' } as any);
    r.flags.set('place.oldsmoke.discovered', true);
    r.events.emit('save.loaded', { slot: 't' });
    expect(r.codex.has('lore.place.scorchhold')).toBe(true);
    expect(r.codex.has('lore.place.deepgate')).toBe(true);
    expect(r.codex.has('lore.pickett')).toBe(false);
    expect(r.codex.has('lore.nursery')).toBe(false);
    expect(r.codex.has('lore.place.oldsmoke-mines')).toBe(true);
  });

  it('a load backfills the Cinderford place entry from its lit waystone flag, and not without it', async () => {
    const r = await rig();
    r.events.emit('save.loaded', { slot: 't' });
    expect(r.codex.has('lore.place.cinderford')).toBe(false);
    r.flags.set('waystone.cinderford.lit', true);
    r.events.emit('save.loaded', { slot: 't' });
    expect(r.codex.has('lore.place.cinderford')).toBe(true);
  });

  it('a throwing quests service does not break the load', async () => {
    const r = await rig();
    r.services.provide('quests' as any, { state: () => { throw new Error('x'); } } as any);
    expect(() => r.events.emit('save.loaded', { slot: 't' })).not.toThrow();
  });

  it('the entries show in their tabs', async () => {
    const r = await rig();
    r.codex.unlock('thrandil-redmane');
    r.codex.open('thrandil-redmane');
    expect(r.widget().selectedId).toBe('thrandil-redmane');
  });
});
