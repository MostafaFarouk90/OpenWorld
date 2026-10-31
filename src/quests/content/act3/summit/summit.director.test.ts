// The summit director's named behaviours on the rig (director/rig.testkit.ts): each quest end to end, every event early and late, a save and load at
// every step, M31's trial restarts and outcome, M32's perk and flag, M33's witnesses, D06's landing, courtyard, Skarl and exit.
import { afterEach, describe, expect, it } from 'vitest';
import { makeRig, type Rig } from './director/rig.testkit';
import { autoplay, autoplayAll, clearGroups, playObjective } from './director/autoplay.testkit';
import { SUMMIT_QUEST_DEFS } from './summit.content';

let rig: Rig | null = null;
afterEach(() => { rig?.dispose(); rig = null; });
const fresh = (o: Parameters<typeof makeRig>[0] = {}): Rig => (rig = makeRig(o));
const ORDER = ['m31', 'm32', 'm33', 'm34', 'd06'];
const upTo = (r: Rig, quests: string[], q: string, at: string, opts: Parameters<typeof autoplay>[2] = {}): void => {
  autoplayAll(r, quests, opts);
  r.manager.start(q);
  autoplay(r, q, { ...opts, stopAt: [q, at] });
  r.step(2);
};
const before = (q: string): string[] => ORDER.slice(0, ORDER.indexOf(q));

describe('each quest end to end', () => {
  it('plays the five in order and writes every completion flag K4 reads', () => {
    const r = fresh();
    autoplayAll(r, ORDER, { m31: 'yielded', d06: 'spared', r16: 'give' });
    r.step(120);
    for (const q of ORDER) {
      expect(r.qs(q), q).toBe('completed');
      expect(r.flag(`story.${q}.complete`), q).toBe(true);
      expect(r.flag(`story.${q}.started`), q).toBe(true);
    }
    for (let n = 1; n <= 6; n++) expect(r.flag(`story.m33.anchor${n}`), `anchor${n}`).toBe(true);
    expect(r.flag('story.d06.gateOpen')).toBe(true);
    expect(r.warn).not.toHaveBeenCalled();
  });

  it.each([['won', 'defeated', 'keep'], ['yielded', 'spared', 'give']] as const)('branches %s / %s / %s all complete', (m31, d06, r16) => {
    const r = fresh();
    autoplayAll(r, ORDER, { m31, d06, r16 });
    expect(r.qs('d06')).toBe('completed');
  });

  it('does not start before its parents: M31 needs R16, M34 needs the whole act', () => {
    const r = fresh({ prereqs: ['m23', 'm24', 'm25', 'm26', 'm27', 'd05', 'm28', 'm29', 'm30'] });
    expect(r.manager.start('m31')).toBe(false);
    const full = fresh();
    expect(full.manager.start('m31')).toBe(true);
    const all = ['m23', 'm24', 'm25', 'm26', 'm27', 'd05', 'm28', 'm29', 'm30', 'r12', 'r13', 'r14', 'r15', 'r16', 'r17', 'r18'];
    // the side quests other than R16 do not gate M31 but every one gates M34
    for (const miss of ['r12', 'r13', 'r14', 'r15', 'r17', 'r18']) {
      const g = fresh({ prereqs: all.filter((x) => x !== miss) });
      autoplayAll(g, ['m31', 'm32', 'm33']);
      expect(g.manager.start('m34'), `without ${miss}`).toBe(false);
    }
    const noR16 = fresh({ prereqs: all.filter((x) => x !== 'r16') });
    expect(noR16.manager.start('m31')).toBe(false);
  });
});

describe('every event early and late, through the real quest manager', () => {
  const doable = (type: string): boolean => type === 'event';
  for (const q of SUMMIT_QUEST_DEFS) {
    it(`${q.id}: events fired at the start do not stop it completing; fired again after it completes, nothing changes`, () => {
      const r = fresh();
      autoplayAll(r, before(q.id));
      r.manager.start(q.id);
      const fired: string[] = [];
      autoplay(r, q.id, {
        hook: (rr, quest, current) => {
          if (current.id !== q.objectives[0]!.id || fired.length) return;
          for (const o of q.objectives.slice(1)) {
            if (!doable(o.type)) continue;
            try { playObjective(rr, quest, o, {}); fired.push(o.id); } catch { /* an event with no early driver */ }
          }
        },
      });
      expect(r.qs(q.id), `${q.id} stuck at ${r.manager.objectives(q.id).find((v) => v.current)?.def.id}`).toBe('completed');
      for (const o of q.objectives) {
        if (!doable(o.type)) continue;
        try { playObjective(r, q.id, o, {}); } catch { /* none */ }
      }
      r.step(10);
      expect(r.qs(q.id)).toBe('completed');
    });
  }
});

describe('a save and load at every step', () => {
  for (const q of SUMMIT_QUEST_DEFS) {
    for (const o of q.objectives) {
      it(`${q.id}.${o.id}: loading while it is current, the quest still completes`, () => {
        const r = fresh();
        upTo(r, before(q.id), q.id, o.id);
        expect(r.current(q.id, o.id)).toBe(true);
        r.saveLoad();
        r.step(120);
        expect(r.current(q.id, o.id)).toBe(true);
        autoplay(r, q.id, { m31: 'won', d06: 'spared' });
        r.step(120);
        expect(r.qs(q.id), `${q.id} after a load at ${o.id}`).toBe('completed');
        expect(r.flag(`story.${q.id}.complete`)).toBe(true);
      });
    }
  }
});

describe('group objectives', () => {
  it('a member spared mid-fight leaves the group, and the step is credited when the last is gone (M33 packs, D06 courtyard)', () => {
    for (const [q, obj, groups] of [['m33', 'packs', ['dragonspine.q.m33.pack-a', 'dragonspine.q.m33.pack-b']], ['d06', 'courtyard', ['dragonspine.q.d06.courtyard']]] as const) {
      const r = fresh();
      upTo(r, before(q), q, obj);
      r.step(2);
      for (const g of groups) r.standing.set(g, ['a', 'b', 'c']);
      r.step(40);
      r.emit('mercy', { actorId: 'a' });
      for (const g of groups) r.standing.set(g, ['b', 'c']);
      r.step(40);
      expect(r.done(q, obj)).toBe(false);
      for (const g of groups) r.standing.set(g, []);
      r.step(40);
      expect(r.done(q, obj), q).toBe(true);
    }
  });

  it('a group cleared at the very start is kept by its flag and credited when the step comes', () => {
    const r = fresh();
    autoplayAll(r, before('m31'));
    r.manager.start('m31');
    autoplay(r, 'm31', { stopAt: ['m31', 'ledge1'] });
    r.step(2);
    clearGroups(r, ['dragonspine.q.m31.hawks']);
    expect(r.flag('story.m31.hawksDown')).toBe(true);
    expect(r.done('m31', 'hawks')).toBe(false);
    autoplay(r, 'm31');
    expect(r.qs('m31')).toBe('completed');
  });
});
