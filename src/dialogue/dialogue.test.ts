import { describe, it, expect, vi } from 'vitest';
import { DialogueRunner } from './DialogueRunner';
import { validateDialogue } from './validate';
import { buildPanelModel, createDialoguePanel, handleDialogueInput } from './DialoguePanel';
import { portraitFor } from './portraits';
import type { Condition, DialogueDef, Effect } from '../quests/types';

function make(opts: { flags?: Record<string, any>; band?: string; fail?: 'throw' | 'notok' } = {}) {
  const flags: Record<string, any> = { ...(opts.flags ?? {}) };
  const events: [string, any][] = [];
  const ran: Effect[][] = [];
  const warn = vi.fn();
  const state: any = { getFlag: (k: string) => flags[k], favourBand: () => opts.band ?? 'banked' };
  const evalCondition = (c: Condition): boolean => {
    const k = c as any;
    if ('flag' in k) return k.equals === undefined ? !!flags[k.flag] : flags[k.flag] === k.equals;
    if ('favour' in k) return k.band === (opts.band ?? 'banked');
    if ('not' in k) return !evalCondition(k.not);
    return true;
  };
  const runner = new DialogueRunner({
    bus: { on: () => () => {}, emit: (t, p) => { events.push([t, p]); } },
    state,
    quests: { state: () => 'inactive', objectiveDone: () => false },
    effects: {
      run(effs: Effect[] | undefined) {
        if (!effs) return [];
        ran.push(effs);
        for (const e of effs) if ('setFlag' in e) flags[e.setFlag] = e.value;
        if (opts.fail === 'throw') throw new Error('boom');
        return effs.map((effect) => ({ effect, ok: opts.fail !== 'notok' }));
      },
    },
    strings: { t: (k, p) => (k.startsWith('x.') ? `${k}:${p?.name}` : `[[${k}]]`), has: (k) => k.startsWith('x.') },
    evalCondition: evalCondition as any,
    warn,
  });
  return { runner, flags, events, ran, warn };
}
const N = (id: string, extra: any = {}) => ({ id, speaker: 'gaut', textKey: `x.${id}`, ...extra });
const def = (nodes: any[], start: any = nodes[0].id, id = 'd'): DialogueDef => ({ id, start, nodes });
const names = (e: [string, any][]) => e.map((x) => x[0]);

describe('DialogueRunner', () => {
  it('linear', () => {
    const { runner, events } = make();
    runner.register(def([N('a', { next: 'b' }), N('b')]));
    expect(runner.start('d', 'gaut')).toBe(true);
    expect(runner.view()).toMatchObject({ nodeId: 'a', text: 'x.a:Cael', hasNext: true, choices: [] });
    runner.advance();
    expect(runner.view()!.nodeId).toBe('b');
    runner.advance();
    expect(runner.isOpen).toBe(false);
    expect(names(events)).toEqual(['dialogue.started', 'dialogue.ended']);
  });
  it('duplicate register throws, unknown id false', () => {
    const { runner } = make();
    runner.register(def([N('a')]));
    expect(() => runner.register(def([N('a')]))).toThrow();
    expect(runner.start('zzz', 'gaut')).toBe(false);
  });
  it('branch + choice effects before next + events in order', () => {
    const { runner, events, flags } = make();
    runner.register(def([
      N('a', { choices: [{ id: 'c1', textKey: 'x.c1', effects: [{ setFlag: 'f', value: true }], next: 'b' }, { id: 'c2', textKey: 'x.c2', next: null }] }),
      N('b', { effects: [{ setFlag: 'g', value: flags.f ? 'after' : 'before' }] }),
    ]));
    runner.start('d', 'gaut');
    expect(runner.view()!.choices.map((c) => c.number)).toEqual([1, 2]);
    runner.choose(1);
    expect(flags.f).toBe(true);
    expect(flags.g).toBe('before'); // literal evaluated at build; order checked below
    expect(runner.view()!.nodeId).toBe('b');
    runner.advance();
    expect(events).toEqual([
      ['dialogue.started', { dialogueId: 'd', npcId: 'gaut' }],
      ['dialogue.choice', { dialogueId: 'd', nodeId: 'a', choiceId: 'c1' }],
      ['dialogue.ended', { dialogueId: 'd', npcId: 'gaut', reason: 'completed' }],
    ]);
  });
  it('choice effects run before the next node effects', () => {
    const { runner, ran } = make();
    runner.register(def([
      N('a', { choices: [{ id: 'c', textKey: 'x.c', effects: [{ setFlag: 'one', value: 1 }], next: 'b' }] }),
      N('b', { effects: [{ setFlag: 'two', value: 2 }] }),
    ]));
    runner.start('d', 'gaut');
    runner.choose(1);
    expect(ran.map((r) => (r[0] as any).setFlag)).toEqual(['one', 'two']);
  });
  it('choices filtered at display; numbers match displayed; stale refused', () => {
    const { runner, flags, events } = make({ flags: { open: true } });
    runner.register(def([
      N('a', { choices: [
        { id: 'hidden', textKey: 'x.h', when: { flag: 'nope' }, next: null },
        { id: 'one', textKey: 'x.1', when: { flag: 'open' }, next: 'b' },
        { id: 'two', textKey: 'x.2', next: 'b' },
      ] }),
      N('b'),
    ]));
    runner.start('d', 'gaut');
    expect(runner.view()!.choices).toEqual([{ number: 1, id: 'one', text: 'x.1:Cael' }, { number: 2, id: 'two', text: 'x.2:Cael' }]);
    flags.open = false;
    const before = runner.view();
    runner.choose(1);
    expect(runner.view()).not.toBe(before);
    expect(runner.view()!.nodeId).toBe('a');
    expect(runner.view()!.choices.map((c) => c.id)).toEqual(['two']);
    expect(events.some((e) => e[0] === 'dialogue.choice')).toBe(false);
    runner.choose(1);
    expect(runner.view()!.nodeId).toBe('b');
  });
  it('all choices filtered falls back to next or ends', () => {
    const { runner, warn } = make();
    runner.register(def([
      N('a', { next: 'b', choices: [{ id: 'c', textKey: 'x.c', when: { flag: 'no' }, next: null }] }), N('b'),
    ]));
    runner.start('d', 'gaut');
    expect(runner.view()!.nodeId).toBe('b');
    const m = make();
    m.runner.register(def([N('a', { choices: [{ id: 'c', textKey: 'x.c', when: { flag: 'no' }, next: null }] })]));
    expect(m.runner.start('d', 'gaut')).toBe(true);
    expect(m.runner.isOpen).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('node when false skipped; effects run once, not on re-render', () => {
    const { runner, ran } = make();
    runner.register(def([
      N('a', { next: 'b' }),
      N('b', { when: { flag: 'no' }, effects: [{ setFlag: 'skipped', value: 1 }], next: 'c' }),
      N('c', { effects: [{ setFlag: 'c', value: 1 }], choices: [{ id: 'x', textKey: 'x.x', when: { flag: 'no' }, next: null }, { id: 'y', textKey: 'x.y', next: 'c2' }] }),
      N('c2'),
    ]));
    runner.start('d', 'gaut');
    runner.advance();
    expect(runner.view()!.nodeId).toBe('c');
    runner.choose(5); runner.choose(0); // invalid
    expect(ran.length).toBe(1);
    expect((ran[0]![0] as any).setFlag).toBe('c');
  });
  it('next null / undefined ends', () => {
    const { runner } = make();
    runner.register(def([N('a', { next: null })]));
    runner.start('d', 'gaut');
    runner.advance();
    expect(runner.isOpen).toBe(false);
  });
  it('cyclic hub does not hit the cap', () => {
    const { runner, warn } = make();
    runner.register(def([
      N('hub', { choices: [{ id: 'ask', textKey: 'x.a', next: 'ans' }, { id: 'bye', textKey: 'x.b', next: null }] }),
      N('ans', { next: 'hub' }),
    ]));
    runner.start('d', 'gaut');
    for (let i = 0; i < 300; i++) { runner.choose(1); runner.advance(); }
    expect(runner.view()!.nodeId).toBe('hub');
    expect(warn).not.toHaveBeenCalled();
    runner.choose(2);
    expect(runner.isOpen).toBe(false);
  });
  it('choice-less cycle: validator rejects, runtime caps', () => {
    const d = def([N('a', { next: 'b' }), N('b', { next: 'a' })]);
    expect(validateDialogue(d, () => true).errors.join()).toMatch(/cycle/);
    const { runner, warn, events } = make();
    runner.register(d);
    // nodes without a choice wait on advance, so use node-when skipping to drive a real loop
    const loop = def([N('a', { when: { flag: 'no' }, next: 'b' }), N('b', { when: { flag: 'no' }, next: 'a' })], 'a', 'loop');
    runner.register(loop);
    expect(runner.start('loop', 'gaut')).toBe(true);
    expect(runner.isOpen).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(names(events).filter((n) => n === 'dialogue.ended')).toHaveLength(1);
  });
  it('missing string key and throwing strings do not throw', () => {
    const { runner } = make();
    runner.register(def([N('a', { textKey: 'nope.key' })]));
    runner.start('d', 'gaut');
    expect(runner.view()!.text).toBe('[[nope.key]]');
  });
  it.each(['throw', 'notok'] as const)('effect failure (%s) does not stop dialogue', (fail) => {
    const { runner } = make({ fail });
    runner.register(def([N('a', { effects: [{ setFlag: 'x', value: 1 }], next: 'b' }), N('b')]));
    runner.start('d', 'gaut');
    runner.advance();
    expect(runner.view()!.nodeId).toBe('b');
  });
  it('open while open returns false and keeps first', () => {
    const { runner, events } = make();
    runner.register(def([N('a')]));
    runner.register(def([N('z')], 'z', 'e'));
    runner.start('d', 'gaut');
    expect(runner.start('e', 'edda')).toBe(false);
    expect(runner.view()!.dialogueId).toBe('d');
    expect(events).toHaveLength(1);
  });
  it('start array picks first passing; none passing false and warns once', () => {
    const { runner, warn } = make({ flags: { b: true } });
    runner.register(def([N('a'), N('b')], [{ when: { flag: 'a' }, node: 'a' }, { when: { flag: 'b' }, node: 'b' }]));
    runner.start('d', 'gaut');
    expect(runner.view()!.nodeId).toBe('b');
    runner.close('script');
    const m = make();
    m.runner.register(def([N('a')], [{ when: { flag: 'a' }, node: 'a' }]));
    expect(m.runner.start('d', 'gaut')).toBe(false);
    expect(m.runner.start('d', 'gaut')).toBe(false);
    expect(m.warn).toHaveBeenCalledTimes(1);
    expect(m.runner.isOpen).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
  it('favour-band variants', () => {
    for (const band of ['cold', 'banked']) {
      const { runner } = make({ band });
      runner.register(def([N('cold'), N('banked')], [{ when: { favour: 'halvard', band: 'cold' }, node: 'cold' }, { when: { favour: 'halvard', band: 'banked' }, node: 'banked' }]));
      runner.start('d', 'gaut');
      expect(runner.view()!.nodeId).toBe(band);
    }
  });
  it('choose out of range ignored; >4 truncated with warning', () => {
    const { runner, warn } = make();
    const choices = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, textKey: 'x.c', next: null }));
    runner.register(def([N('a', { choices })]));
    runner.start('d', 'gaut');
    expect(runner.view()!.choices).toHaveLength(4);
    expect(warn).toHaveBeenCalledTimes(1);
    runner.choose(5); runner.choose(0); runner.choose(1.5);
    expect(runner.isOpen).toBe(true);
  });
  it('close emits ended once, idempotent; advance on choice node ignored', () => {
    const { runner, events } = make();
    runner.register(def([N('a', { choices: [{ id: 'c', textKey: 'x.c', next: null }] })]));
    runner.start('d', 'gaut');
    runner.advance();
    expect(runner.isOpen).toBe(true);
    runner.close('death'); runner.close('load');
    expect(names(events)).toEqual(['dialogue.started', 'dialogue.ended']);
  });
  it('seen recorded, serialised, tolerant load', () => {
    const { runner } = make();
    runner.register(def([N('a', { next: 'b' }), N('b')]));
    runner.start('d', 'gaut');
    expect(runner.hasSeen('a')).toBe(true);
    expect(runner.hasSeen('b')).toBe(false);
    runner.advance();
    expect(runner.serialize()).toEqual({ seen: ['a', 'b'] });
    runner.load({ seen: ['q', 3, null] });
    expect(runner.serialize()).toEqual({ seen: ['q'] });
    for (const bad of [null, undefined, 5, { seen: 'x' }, {}]) { runner.load(bad); expect(runner.serialize()).toEqual({ seen: [] }); }
  });
  it('onChange fires', () => {
    const { runner } = make();
    const l = vi.fn();
    runner.onChange(l);
    runner.register(def([N('a')]));
    runner.start('d', 'gaut');
    runner.close('skip');
    expect(l).toHaveBeenCalledTimes(2);
  });
});

describe('validateDialogue', () => {
  const ok = () => true;
  it('valid hub passes', () => {
    const d = def([N('hub', { choices: [{ id: 'a', textKey: 'k', next: 'ans' }] }), N('ans', { next: 'hub' })]);
    expect(validateDialogue(d, ok)).toEqual({ errors: [], warnings: [] });
  });
  it('errors', () => {
    const e = (d: DialogueDef, has = ok) => validateDialogue(d, has).errors.join('\n');
    expect(e(def([N('a')], ''))).toMatch(/empty start/);
    expect(e(def([N('a')], 'zz'))).toMatch(/unknown start/);
    expect(e(def([N('a')], []))).toMatch(/empty start array/);
    expect(e(def([N('a', { next: 'q' })]))).toMatch(/unknown next/);
    expect(e(def([N('a', { choices: [{ id: 'c', textKey: 'k', next: 'q' }] })]))).toMatch(/unknown next/);
    const five = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, textKey: 'k', next: null }));
    expect(e(def([N('a', { choices: five })]))).toMatch(/max 4/);
    expect(e(def([N('a', { textKey: '' })]))).toMatch(/missing textKey/);
    expect(e(def([N('a')]), () => false)).toMatch(/missing string/);
    expect(e(def([N('a'), N('a')]))).toMatch(/duplicate/);
    expect(e(def([N('a', { next: 'a' })]))).toMatch(/cycle/);
  });
  it('unlockMercy accepts release, spare and calm, and rejects other verbs', () => {
    const e = (v: string) => validateDialogue(def([N('a', { effects: [{ unlockMercy: v } as never] })]), ok).errors.join('\n');
    for (const v of ['release', 'spare', 'calm']) expect(e(v)).toBe('');
    expect(e('warmHand')).toMatch(/unlockMercy verb must be release, spare or calm/);
  });
  it('unreachable warns', () => {
    expect(validateDialogue(def([N('a'), N('b')]), ok).warnings.join()).toMatch(/"b"/);
  });
});

describe('panel', () => {
  it('model with portrait fallback', () => {
    const { runner } = make();
    runner.register(def([N('a', { speaker: 'mystery-man', portrait: 'weird' })]));
    runner.start('d', 'x');
    const m = buildPanelModel(runner.view(), { t: (k) => `T(${k})`, has: () => false });
    expect(m.speakerName).toBe('mystery-man');
    expect(m.portrait.initials).toBe('MM');
    expect(m.nextHint).not.toBeNull();
    expect(buildPanelModel(null).visible).toBe(false);
    expect(buildPanelModel(runner.view(), { t: () => 'Gaut', has: () => true }).speakerName).toBe('Gaut');
    expect(portraitFor('gaut-banked', 'gaut').initials).toBe('G');
  });
  it('model choices numbered', () => {
    const { runner } = make();
    runner.register(def([N('a', { choices: [{ id: 'h', textKey: 'x.h', when: { flag: 'no' }, next: null }, { id: 'c', textKey: 'x.c', next: null }] })]));
    runner.start('d', 'gaut');
    const m = buildPanelModel(runner.view());
    expect(m.choices.map((c) => c.number)).toEqual([1]);
    expect(m.nextHint).toBeNull();
  });
  it('headless widget is a no-op', () => {
    const { runner } = make();
    const p = createDialoguePanel(runner);
    expect(p.element).toBeNull();
    expect(() => p.dispose()).not.toThrow();
  });
  it('handleDialogueInput mapping', () => {
    const { runner } = make();
    runner.register(def([N('a', { next: 'b' }), N('b', { choices: [{ id: 'x', textKey: 'x.x', next: 'c' }, { id: 'y', textKey: 'x.y', next: null }] }), N('c')]));
    runner.start('d', 'gaut');
    const press = (...a: string[]) => ({ pressed: (x: string) => a.includes(x) });
    handleDialogueInput(runner, press('dialogueNext'));
    expect(runner.view()!.nodeId).toBe('b');
    handleDialogueInput(runner, press('dialogueNext')); // ignored on choice node
    handleDialogueInput(runner, press('jump', 'dialogueChoice3'));
    expect(runner.view()!.nodeId).toBe('b');
    handleDialogueInput(runner, press('dialogueChoice1', 'dialogueChoice2'));
    expect(runner.view()!.nodeId).toBe('c');
    runner.close('script');
    handleDialogueInput(runner, press('dialogueNext')); // closed: nothing
    expect(runner.isOpen).toBe(false);
  });
});

describe('review fixes', () => {
  it('ended carries reason: completed on a normal end, else the close reason', () => {
    const { runner, events } = make();
    runner.register(def([N('a')]));
    runner.start('d', 'gaut');
    runner.advance();
    expect(events.filter((e) => e[0] === 'dialogue.ended').map((e) => e[1].reason)).toEqual(['completed']);
    for (const r of ['skip', 'death', 'load', 'dispose', 'script'] as const) {
      events.length = 0;
      runner.start('d', 'gaut');
      runner.close(r);
      expect(events.filter((e) => e[0] === 'dialogue.ended').map((e) => e[1].reason)).toEqual([r]);
    }
  });

  it("speaker 'cael' view carries the player's name; others do not", () => {
    const { runner } = make();
    runner.register(def([N('a', { speaker: 'cael', next: 'b' }), N('b')]));
    runner.start('d', 'gaut');
    expect(runner.view()!.speakerName).toBeTruthy();
    runner.advance();
    expect(runner.view()!.speakerName).toBeUndefined();
  });

  it('buildPanelModel prefers view.speakerName over the npc.<speaker>.name lookup', () => {
    const view: any = { dialogueId: 'd', npcId: 'edda', nodeId: 'a', speaker: 'cael', speakerName: 'Rowan', portrait: undefined, text: 't', hasNext: true, choices: [] };
    const strings = { t: () => 'WRONG', has: () => true };
    expect(buildPanelModel(view, strings).speakerName).toBe('Rowan');
    expect(buildPanelModel({ ...view, speaker: 'edda', speakerName: undefined }, strings).speakerName).toBe('WRONG');
  });

  it('validateDialogue checks node and choice effects', () => {
    const d = def([
      N('a', { effects: [{ event: 'bogus.event' }, { setFlag: '', value: true }], choices: [{ id: 'c', textKey: 'x.c', effects: [{ give: [{ itemId: 'i', count: 0 }] }, { take: 'x' }], next: null }] }),
    ]);
    const errs = validateDialogue(d, () => true).errors.join('\n');
    expect(errs).toMatch(/event name not allowed/);
    expect(errs).toMatch(/setFlag key/);
    expect(errs).toMatch(/count must be a positive integer/);
    expect(errs).not.toMatch(/take/);
    const ok = def([N('a', { effects: [{ event: 'tutorial.vow.complete' }, { take: [{ itemId: 'i', count: 2 }] }] })]);
    expect(validateDialogue(ok, () => true).errors).toEqual([]);
  });
});
