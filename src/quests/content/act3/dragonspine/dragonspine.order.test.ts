// Out-of-order play for the lower Dragonspine quests: a sequential quest credits only its current objective, so anything the
// player can do early must either be impossible (a group is armed only when its step is current) or be kept by a persistent flag
// the step reads when it comes. Driven from the definitions, not from the order autoplay happens to use.
import { afterEach, describe, expect, it } from 'vitest';
import { makeRig, type Rig } from './director/rig.testkit';
import { autoplay, autoplayAll, clearGroups, playObjective } from './director/autoplay.testkit';
import { DRAGONSPINE_QUEST_DEFS } from './dragonspine.content';
import { DRAGONSPINE_ARMS } from './arms';
import { DRAGONSPINE_GROUP_OBJECTIVES } from './groups';
import { DRAGONSPINE_SPAWNERS } from './spawners';

let rig: Rig | null = null;
const fresh = (): Rig => (rig = makeRig({ flags: { 'story.gate.a3': true }, kindsDefined: true }));
afterEach(() => { rig?.dispose(); rig = null; });

const PREREQ: Record<string, string[]> = {
  m28: [], r15: ['m28'], r18: ['m28'], m29: ['m28'], r16: ['m28', 'm29'], m30: ['m28', 'm29'], r17: ['m28', 'm29', 'm30'],
};
const actFlag = (s: { activation?: unknown }): string | undefined => (s.activation as { flag?: string } | undefined)?.flag;

describe('kill objectives are structurally order-proof', () => {
  for (const q of DRAGONSPINE_QUEST_DEFS) {
    for (const o of q.objectives.filter((x) => x.type === 'kill')) {
      it(`${q.id}.${o.id}: its group is armed by this step alone, holds one kind, and no other kill step shares the tag`, () => {
        const spawners = DRAGONSPINE_SPAWNERS.filter((s) => s.tag === o.spawnTag);
        expect(spawners.length, 'a spawner owns the tag').toBeGreaterThan(0);
        const arms = DRAGONSPINE_ARMS.filter((a) => a.quest === q.id && a.objective === o.id);
        expect(arms, 'armed by this objective').toHaveLength(1);
        for (const s of spawners) {
          expect(actFlag(s)).toBe(arms[0]!.flag);
          expect(new Set(s.memberKinds ?? [s.enemy]).size, `${s.id} mixes kinds`).toBe(1);
          expect(s.enemy).toBe(o.target);
        }
        expect(spawners.reduce((n, s) => n + s.count, 0)).toBe(o.required ?? 1);
        expect(q.objectives.filter((x) => x.type === 'kill' && x.spawnTag === o.spawnTag)).toHaveLength(1);
      });
    }
  }
});

describe('group objectives (one step per spawner group)', () => {
  const rows = DRAGONSPINE_GROUP_OBJECTIVES;
  it("every group is a real spawner id on its row's arm flag, and the quest step is a story step on its down flag", () => {
    for (const g of rows) {
      for (const id of g.groups) {
        const s = DRAGONSPINE_SPAWNERS.find((x) => x.id === id);
        expect(s, id).toBeTruthy();
        expect(actFlag(s!), id).toBe(g.armFlag);
      }
      const o = DRAGONSPINE_QUEST_DEFS.find((q) => q.id === g.quest)!.objectives.find((x) => x.id === g.objective)!;
      expect(o.type).toBe('event');
      expect(o.target).toBe(g.down);
      expect(JSON.stringify(o.doneWhen)).toContain(g.down);
      expect(DRAGONSPINE_ARMS.some((a) => a.quest === g.quest && a.objective === g.objective && a.flag === g.armFlag)).toBe(true);
    }
  });

  it.each(rows.map((g) => [`${g.quest}.${g.objective}`, g] as const))('%s: any removal order credits it only after the last member is gone, and a load keeps it', (_n, g) => {
    const r = fresh();
    autoplayAll(r, PREREQ[g.quest]!);
    r.manager.start(g.quest);
    autoplay(r, g.quest, { stopAt: [g.quest, g.objective] });
    expect(r.current(g.quest, g.objective)).toBe(true);
    r.step(2);
    expect(r.flag(g.armFlag)).toBe(true);
    const members = g.groups.map((id) => [id, ['a', 'b', 'c']] as const);
    for (const [id, m] of members) r.standing.set(id, [...m]);
    r.step(40);
    expect(r.flag(g.seen)).toBe(true);
    for (const [id, m] of [...members].reverse()) {
      for (let n = m.length - 1; n >= 0; n--) {
        r.standing.set(id, m.slice(0, n));
        r.step(40);
        const left = g.groups.reduce((c, gid) => c + (r.standing.get(gid)?.length ?? 0), 0);
        expect(r.flag(g.down), `${left} left`).toBe(left === 0);
      }
    }
    expect(r.done(g.quest, g.objective)).toBe(true);
    r.saveLoad();
    r.step(120);
    expect(r.flag(g.down)).toBe(true);
  });

  it('a spared or calmed member leaves the group and counts as gone', () => {
    const r = fresh();
    autoplayAll(r, PREREQ.r16!);
    r.manager.start('r16');
    autoplay(r, 'r16', { stopAt: ['r16', 'pack'] });
    r.step(2);
    r.standing.set('dragonspine.q.r16.pack', ['ogre', 'h1', 'h2', 'h3', 'h4']);
    r.step(40);
    r.emit('mercy', { actorId: 'ogre' }); // calmed: it walks off and no longer stands
    r.standing.set('dragonspine.q.r16.pack', ['h1', 'h2', 'h3', 'h4']);
    r.step(40);
    expect(r.done('r16', 'pack')).toBe(false);
    r.standing.set('dragonspine.q.r16.pack', []);
    r.step(40);
    expect(r.done('r16', 'pack')).toBe(true);
  });

  it('a group cleared at the very start (its members standing, then gone) is kept by its flag and credited when the step comes', () => {
    const r = fresh();
    autoplayAll(r, PREREQ.m29!);
    r.manager.start('m29');
    autoplay(r, 'm29', { stopAt: ['m29', 'greet'] });
    clearGroups(r, ['dragonspine.q.m29.hawks']);
    expect(r.flag('story.m29.hawksDown')).toBe(true);
    expect(r.done('m29', 'hawks')).toBe(false);
    autoplay(r, 'm29');
    expect(r.qs('m29')).toBe('completed');
  });
});

describe('every event early and late, through the real quest manager', () => {
  const doable = (type: string): boolean => type === 'kill' || type === 'event' || type === 'interact';
  for (const q of DRAGONSPINE_QUEST_DEFS) {
    it(`${q.id}: events fired at the start do not stop it completing; fired again after it completes, nothing changes`, () => {
      const r = fresh();
      autoplayAll(r, PREREQ[q.id]!);
      r.manager.start(q.id);
      const fired: string[] = [];
      autoplay(r, q.id, {
        hook: (rr, quest, current) => {
          if (current.id !== q.objectives[0]!.id || fired.length) return;
          for (const o of q.objectives.slice(1)) {
            if (!doable(o.type)) continue;
            try { playObjective(rr, quest, o, {}); fired.push(o.id); } catch { /* an event with no early driver (a scene, a locked gate) */ }
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
