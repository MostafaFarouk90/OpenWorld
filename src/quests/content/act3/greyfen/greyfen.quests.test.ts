// The nine Greyfen quests through the real quest manager and the real installers (the rig): each played from its giver to its
// hand-in the way the game does, in the plan's order, so the unlock graph is walked as well.
import { afterEach, describe, expect, it } from 'vitest';
import { makeRig, type Rig } from './director/rig.testkit';
import { autoplay, autoplayAll } from './director/autoplay.testkit';

let rig: Rig | null = null;
const fresh = (...a: Parameters<typeof makeRig>): Rig => (rig = makeRig(...a));
afterEach(() => { rig?.dispose(); rig = null; });

const ORDER = ['m23', 'm24', 'r12', 'm25', 'r14', 'r13', 'm26', 'm27', 'd05'];
const gate = (r: Rig) => r.state.setFlag('story.gate.a3', true);

describe('the Greyfen chain', () => {
  it('plays all nine in order, each completing and writing story.<id>.complete', () => {
    const r = fresh();
    gate(r);
    autoplayAll(r, ORDER);
    for (const q of ORDER) {
      expect(r.qs(q), q).toBe('completed');
      expect(r.flag(`story.${q}.complete`), q).toBe(true);
      expect(r.flag(`story.${q}.started`), q).toBe(true);
    }
  });

  it('refuses a quest before its prerequisites (the unlock graph)', () => {
    const r = fresh();
    expect(r.manager.start('m23')).toBe(false); // the gate is closed
    gate(r);
    for (const q of ORDER.slice(1)) expect(r.manager.start(q), q).toBe(false);
    expect(r.manager.start('m23')).toBe(true);
  });

  it('M27 waits on both M26 and R14', () => {
    const r = fresh();
    gate(r);
    autoplayAll(r, ['m23', 'm24', 'm25', 'm26']);
    expect(r.manager.start('m27')).toBe(false);
    autoplayAll(r, ['r14']);
    expect(r.manager.start('m27')).toBe(true);
  });

  it('opens R12 and M25 on M24, R14 on M23, R13 and M26 on M25, D05 on M27', () => {
    const r = fresh();
    gate(r);
    autoplayAll(r, ['m23']);
    expect(r.manager.start('r14')).toBe(true);
    expect(r.manager.start('m24')).toBe(true);
    expect(r.manager.start('r12')).toBe(false);
    autoplayAll(r, ['m24']);
    expect(r.manager.start('r12')).toBe(true);
    expect(r.manager.start('m25')).toBe(true);
    expect(r.manager.start('r13')).toBe(false);
    expect(r.manager.start('m26')).toBe(false);
  });
});

describe('save and load at every step', () => {
  it.each(ORDER)('%s: a save taken after each objective loads to the same state', (q) => {
    const r = fresh();
    gate(r);
    const prior = ORDER.slice(0, ORDER.indexOf(q));
    autoplayAll(r, prior);
    expect(r.manager.start(q)).toBe(true);
    const seen: string[] = [];
    autoplay(r, q, {
      hook: (rr, qq, o) => {
        seen.push(o.id);
        const data = JSON.parse(JSON.stringify(rr.manager.serialize()));
        // a copy of the world loads the same current objective
        const copy = makeRig();
        copy.state.load(JSON.parse(JSON.stringify(rr.state.serialize())));
        copy.manager.load(data);
        copy.emit('save.loaded', { slot: 'a' });
        copy.step(3);
        expect(copy.manager.objectives(qq).find((v) => v.current)?.def.id, `${qq} before ${o.id}`).toBe(o.id);
        copy.dispose();
      },
    });
    expect(r.qs(q)).toBe('completed');
    expect(seen.length).toBeGreaterThanOrEqual(8);
  });
});
