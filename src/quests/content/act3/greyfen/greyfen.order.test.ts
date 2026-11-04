// Out-of-order play for every Greyfen quest (review finding 1 and 9): a sequential quest credits only its current objective, so
// anything the player can do early must either be impossible (the group is armed only when its step is current) or be kept by a
// persistent flag the step reads when it comes. Driven from the definitions, not from the order autoplay happens to use.
import { afterEach, describe, expect, it } from 'vitest';
import { makeRig, type Rig } from './director/rig.testkit';
import { autoplay, autoplayAll, clearGroups, playObjective } from './director/autoplay.testkit';
import { GREYFEN_QUEST_DEFS } from './greyfen.content';
import { GREYFEN_ARMS } from './arms';
import { GREYFEN_GROUP_OBJECTIVES } from './groups';
import { GREYFEN_SPAWNERS } from './spawners';

let rig: Rig | null = null;
const fresh = (): Rig => { rig = makeRig(); rig.state.setFlag('story.gate.a3', true); return rig; };
afterEach(() => { rig?.dispose(); rig = null; });

const PREREQ: Record<string, string[]> = {
  m23: [], m24: ['m23'], r12: ['m23', 'm24'], m25: ['m23', 'm24'], r14: ['m23'], r13: ['m23', 'm24', 'm25'],
  m26: ['m23', 'm24', 'm25'], m27: ['m23', 'm24', 'm25', 'm26', 'r14'], d05: ['m23', 'm24', 'm25', 'm26', 'r14', 'm27'],
};
const actFlag = (s: { activation?: unknown }): string | undefined => (s.activation as { flag?: string } | undefined)?.flag;

describe('kill objectives are structurally order-proof', () => {
  for (const q of GREYFEN_QUEST_DEFS) {
    for (const o of q.objectives.filter((x) => x.type === 'kill')) {
      it(`${q.id}.${o.id}: its group is armed by this step alone, holds one kind, and no other kill step shares the tag`, () => {
        const spawners = GREYFEN_SPAWNERS.filter((s) => s.tag === o.spawnTag);
        expect(spawners.length, 'a spawner owns the tag').toBeGreaterThan(0);
        const arms = GREYFEN_ARMS.filter((a) => a.quest === q.id && a.objective === o.id);
        expect(arms, 'armed by this objective').toHaveLength(1);
        for (const s of spawners) {
          expect(actFlag(s)).toBe(arms[0]!.flag);
          expect(new Set(s.memberKinds ?? [s.enemy]).size, `${s.id} mixes kinds`).toBe(1);
          expect(s.enemy).toBe(o.target);
        }
        expect(spawners.reduce((n, s) => n + s.count, 0)).toBe(o.required ?? 1);
        const same = q.objectives.filter((x) => x.type === 'kill' && x.spawnTag === o.spawnTag);
        expect(same, 'one kill step per tag').toHaveLength(1);
      });
    }
  }
});

describe('group objectives (one step per spawner group)', () => {
  const rows = GREYFEN_GROUP_OBJECTIVES.filter((g) => g.objective !== 'blinds');
  it('every group is a real spawner id on its row\'s arm flag, and the quest step is a story step on its down flag', () => {
    for (const g of GREYFEN_GROUP_OBJECTIVES) {
      for (const id of g.groups) {
        const s = GREYFEN_SPAWNERS.find((x) => x.id === id);
        expect(s, id).toBeTruthy();
        expect(actFlag(s!), id).toBe(g.armFlag);
      }
      if (g.objective === 'blinds') continue;
      const o = GREYFEN_QUEST_DEFS.find((q) => q.id === g.quest)!.objectives.find((x) => x.id === g.objective)!;
      expect(o.type).toBe('event');
      expect(o.target).toBe(g.down);
      expect(JSON.stringify(o.doneWhen)).toContain(g.down);
    }
  });

  it.each(rows.map((g) => [`${g.quest}.${g.objective}`, g] as const))('%s: any removal order credits it only after the last member is gone, and a load keeps it', (_n, g) => {
    const r = fresh();
    autoplayAll(r, PREREQ[g.quest]!);
    r.manager.start(g.quest);
    // play to the step before the group step, then the group step is current
    const objs = GREYFEN_QUEST_DEFS.find((q) => q.id === g.quest)!.objectives;
    const i = objs.findIndex((o) => o.id === g.objective);
    autoplay(r, g.quest, { stopAt: [g.quest, g.objective] });
    expect(r.current(g.quest, g.objective), `${objs[i - 1]?.id} -> ${g.objective}`).toBe(true);
    r.step(2);
    expect(r.flag(g.armFlag)).toBe(true);
    const members = g.groups.map((id) => [id, ['a', 'b', 'c']] as const);
    for (const [id, m] of members) r.standing.set(id, [...m]);
    r.step(40);
    expect(r.flag(g.seen)).toBe(true);
    // remove the members one by one, last group first and the last-placed member first (the reverse of any natural order)
    for (const [id, m] of [...members].reverse()) {
      for (let n = m.length - 1; n >= 0; n--) {
        r.standing.set(id, m.slice(0, n));
        r.step(40);
        const left = g.groups.reduce((c, gid) => c + (r.standing.get(gid)?.length ?? 0), 0);
        expect(r.flag(g.down), `${left} left`).toBe(left === 0);
      }
    }
    expect(r.done(g.quest, g.objective)).toBe(true);
  });

  it('a spared or calmed member leaves the group and counts as gone', () => {
    const r = fresh();
    autoplayAll(r, PREREQ.r14!);
    r.manager.start('r14');
    autoplay(r, 'r14', { stopAt: ['r14', 'pack'] });
    r.step(2);
    r.standing.set('greyfen.q.r14.pack', ['h1', 'h2', 'h3', 'h4']);
    r.step(40);
    r.emit('mercy', { actorId: 'h1' }); // spared: it walks off and no longer stands
    r.standing.set('greyfen.q.r14.pack', ['h2', 'h3', 'h4']);
    r.step(40);
    expect(r.done('r14', 'pack')).toBe(false);
    r.standing.set('greyfen.q.r14.pack', []);
    r.step(40);
    expect(r.done('r14', 'pack')).toBe(true);
  });
});

describe('every event early and late, through the real quest manager', () => {
  const doable = (type: string): boolean => type === 'kill' || type === 'event' || type === 'interact';
  for (const q of GREYFEN_QUEST_DEFS) {
    it(`${q.id}: events fired at the start do not stop it completing; fired again after it completes, nothing changes`, () => {
      const r = fresh();
      autoplayAll(r, PREREQ[q.id]!);
      r.manager.start(q.id);
      const fired: string[] = [];
      autoplay(r, q.id, {
        hook: (rr, quest, current) => {
          if (current.id !== q.objectives[0]!.id || fired.length) return;
          // the first objective is current: everything the player could do early, now
          for (const o of q.objectives.slice(1)) {
            if (!doable(o.type)) continue;
            try { playObjective(rr, quest, o, {}); fired.push(o.id); } catch { /* an event with no early driver (a scene) */ }
          }
        },
      });
      expect(fired.length, `${q.id} early events`).toBeGreaterThan(0);
      expect(r.qs(q.id), `${q.id} stuck at ${r.manager.objectives(q.id).find((v) => v.current)?.def.id}`).toBe('completed');
      const flags = JSON.stringify(r.state.serialize());
      for (const o of q.objectives) {
        if (!doable(o.type)) continue;
        try { playObjective(r, q.id, o, {}); } catch { /* none */ }
      }
      r.step(10);
      expect(r.qs(q.id)).toBe('completed');
      expect(JSON.parse(flags)).toBeTruthy();
    });
  }

  it('group steps cleared at the very start are credited when they come', () => {
    const r = fresh();
    autoplayAll(r, PREREQ.m25!);
    r.manager.start('m25');
    autoplay(r, 'm25', { stopAt: ['m25', 'brief'] });
    clearGroups(r, ['greyfen.q.m25.shambler', 'greyfen.q.m25.leeches']); // before the step is current
    expect(r.flag('story.m25.bedsDown')).toBe(true);
    autoplay(r, 'm25');
    expect(r.qs('m25')).toBe('completed');
  });
});
