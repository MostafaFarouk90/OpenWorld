import { describe, expect, it } from 'vitest';
import { createGoal } from './goals';
import type { DirectorEvent, GoalSpec, StateQuery, TickSample, Vec3 } from './types';

function mkQ(o: Partial<{
  equipped: Record<string, string | null>;
  learned: string[];
  lit: string[];
  flags: string[];
  anchors: Record<string, Vec3>;
  quests: Record<string, 'inactive' | 'active' | 'completed' | 'failed'>;
}> = {}): StateQuery {
  return {
    equipped: (s) => o.equipped?.[s] ?? null,
    learned: (id) => !!o.learned?.includes(id),
    isLit: (id) => !!o.lit?.includes(id),
    flag: (k) => !!o.flags?.includes(k),
    anchor: (id) => o.anchors?.[id] ?? null,
    questState: (id) => o.quests?.[id] ?? 'inactive',
  };
}
const Q = mkQ();
const tk = (o: Partial<TickSample> = {}): TickSample => ({
  dt: 0.1,
  feet: { x: 0, y: 0, z: 0 },
  sprinting: false,
  moving: false,
  camera: null,
  ...o,
});
const feet = (x: number, z = 0): Vec3 => ({ x, y: 0, z });
const kill = (actorId: string, over: Partial<Extract<DirectorEvent, { type: 'kill' }>> = {}): DirectorEvent => ({
  type: 'kill', actorId, kind: 'wolf', spawnTag: 't', byPlayer: true, ...over,
});
const hit = (slot: 0 | 1 | 2 | 3 | 4, targetId = 'x', killed = false): DirectorEvent => ({ type: 'hit', slot, targetId, killed });

/** Restore a fresh tracker from `g.progress`, sync, and expect the same done/progress. */
function roundTrip(spec: GoalSpec, g: ReturnType<typeof createGoal>, q: StateQuery = Q): void {
  const r = createGoal(spec);
  r.restore(g.progress);
  r.sync(q);
  expect(r.done).toBe(g.done);
  expect(r.progress).toBe(g.progress);
}

describe('trigger / consume / travel / rest / interact / spell / lit / quest / vow', () => {
  const cases: { spec: GoalSpec; good: DirectorEvent; bad: DirectorEvent[] }[] = [
    { spec: { kind: 'trigger', id: 'a' }, good: { type: 'trigger', id: 'a' }, bad: [{ type: 'trigger', id: 'b' }] },
    { spec: { kind: 'consume' }, good: { type: 'itemUsed', itemId: 'p' }, bad: [{ type: 'blocked' }] },
    { spec: { kind: 'travel' }, good: { type: 'fastTravel', fromId: 'a', toId: 'b' }, bad: [{ type: 'rest', waystoneId: 'a' }] },
    { spec: { kind: 'rest' }, good: { type: 'rest', waystoneId: 'a' }, bad: [{ type: 'blocked' }] },
    { spec: { kind: 'interact', id: 'door' }, good: { type: 'interact', id: 'door' }, bad: [{ type: 'interact', id: 'x' }] },
    { spec: { kind: 'spell', spellId: 'fire' }, good: { type: 'spellReleased', spellId: 'fire' }, bad: [{ type: 'spellReleased', spellId: 'ice' }] },
    { spec: { kind: 'lit', waystoneId: 'w' }, good: { type: 'rekindled', waystoneId: 'w' }, bad: [{ type: 'rekindled', waystoneId: 'z' }] },
    { spec: { kind: 'quest', questId: 'q' }, good: { type: 'questCompleted', questId: 'q' }, bad: [{ type: 'questCompleted', questId: 'r' }] },
    { spec: { kind: 'vow', dialogueId: 'd' }, good: { type: 'vowComplete' }, bad: [{ type: 'dialogueEnded', dialogueId: 'e', reason: undefined }] },
  ];
  for (const c of cases) {
    it(`${c.spec.kind}: success, wrong event ignored, round trip, stays done`, () => {
      const g = createGoal(c.spec);
      expect(g.done).toBe(false);
      expect(g.progress).toBe(0);
      expect(g.detail()).toBeNull();
      for (const b of c.bad) g.onEvent(b);
      expect(g.done).toBe(false);
      roundTrip(c.spec, g);
      g.onEvent(c.good);
      expect(g.done).toBe(true);
      expect(g.progress).toBe(1);
      roundTrip(c.spec, g);
      g.tick(tk(), Q);
      g.sync(Q);
      expect(g.done).toBe(true);
    });
  }

  it('vow also completes on dialogueEnded of its dialogue with any reason', () => {
    const g = createGoal({ kind: 'vow', dialogueId: 'd' });
    g.onEvent({ type: 'dialogueEnded', dialogueId: 'd', reason: 'script' });
    expect(g.done).toBe(true);
  });
  it('quest completes on sync from questState', () => {
    const s: GoalSpec = { kind: 'quest', questId: 'q' };
    const g = createGoal(s);
    g.sync(mkQ({ quests: { q: 'active' } }));
    expect(g.done).toBe(false);
    g.sync(mkQ({ quests: { q: 'completed' } }));
    expect(g.done).toBe(true);
  });
  it('lit completes on sync from isLit only for its waystone', () => {
    const g = createGoal({ kind: 'lit', waystoneId: 'w' });
    g.sync(mkQ({ lit: ['other'] }));
    expect(g.done).toBe(false);
    g.sync(mkQ({ lit: ['w'] }));
    expect(g.done).toBe(true);
  });
  it('restore(1) then sync keeps done', () => {
    const g = createGoal({ kind: 'consume' });
    g.restore(1);
    g.sync(Q);
    expect(g.done).toBe(true);
    g.restore(0);
    expect(g.done).toBe(false);
  });
});

describe('flag', () => {
  const spec: GoalSpec = { kind: 'flag', key: 'k' };
  it('reads on tick and sync', () => {
    const g = createGoal(spec);
    g.tick(tk(), mkQ({ flags: ['other'] }));
    expect(g.done).toBe(false);
    g.tick(tk(), mkQ({ flags: ['k'] }));
    expect(g.done).toBe(true);
    const h = createGoal(spec);
    h.sync(mkQ({ flags: ['k'] }));
    expect(h.done).toBe(true);
    roundTrip(spec, h);
  });
  it('stays done when the flag drops', () => {
    const g = createGoal(spec);
    g.tick(tk(), mkQ({ flags: ['k'] }));
    g.tick(tk(), Q);
    expect(g.done).toBe(true);
  });
});

describe('kill', () => {
  const spec: GoalSpec = { kind: 'kill', creature: 'wolf', spawnTag: 't', count: 2 };
  it('credits matching player kills and finishes at count', () => {
    const g = createGoal(spec);
    g.onEvent(kill('a'));
    expect(g.progress).toBe(1);
    expect(g.done).toBe(false);
    g.onEvent(kill('b'));
    expect(g.done).toBe(true);
    expect(g.progress).toBe(2);
    roundTrip(spec, g);
  });
  it('ignores wrong tag, wrong creature, non-player and undefined tag', () => {
    const g = createGoal(spec);
    g.onEvent(kill('a', { spawnTag: 'T' }));
    g.onEvent(kill('b', { spawnTag: undefined }));
    g.onEvent(kill('c', { kind: 'bear' }));
    g.onEvent(kill('d', { byPlayer: false }));
    g.onEvent({ type: 'mercy', actorId: 'e', creature: 'wolf', spawnTag: 'x' });
    g.onEvent({ type: 'mercy', actorId: 'f', creature: 'bear', spawnTag: 't' });
    expect(g.progress).toBe(0);
  });
  it('dedupes the same actor', () => {
    const g = createGoal(spec);
    g.onEvent(kill('a'));
    g.onEvent(kill('a'));
    expect(g.progress).toBe(1);
  });
  it('mercy then kill of the same actor credits once; kill then mercy too', () => {
    const g = createGoal(spec);
    g.onEvent({ type: 'mercy', actorId: 'a', creature: 'wolf', spawnTag: 't' });
    g.onEvent(kill('a'));
    expect(g.progress).toBe(1);
    g.onEvent(kill('b'));
    g.onEvent({ type: 'mercy', actorId: 'b', creature: 'wolf', spawnTag: 't' });
    expect(g.progress).toBe(2);
  });
  it('mercy with undefined actorId always credits', () => {
    const g = createGoal(spec);
    g.onEvent({ type: 'mercy', actorId: undefined, creature: 'wolf', spawnTag: 't' });
    g.onEvent({ type: 'mercy', actorId: undefined, creature: 'wolf', spawnTag: 't' });
    expect(g.done).toBe(true);
  });
  it('partial progress round trips and clamps', () => {
    const g = createGoal(spec);
    g.onEvent(kill('a'));
    roundTrip(spec, g);
    const r = createGoal(spec);
    r.restore(99);
    expect(r.progress).toBe(2);
    expect(r.done).toBe(true);
  });
});

describe('gaze', () => {
  const spec: GoalSpec = { kind: 'gaze', anchors: ['a', 'b'], degrees: 10, dwell: 1 };
  const anchors = { a: { x: 0, y: 0, z: -10 }, b: { x: 10, y: 0, z: 0 } };
  const q = mkQ({ anchors });
  const cam = (fx: number, fz: number): TickSample['camera'] => ({ position: { x: 0, y: 0, z: 0 }, forward: { x: fx, y: 0, z: fz } });
  const look = (g: ReturnType<typeof createGoal>, c: TickSample['camera'], n: number, dt = 0.25, qq = q): void => {
    for (let i = 0; i < n; i++) g.tick(tk({ dt, camera: c }), qq);
  };
  it('advances through anchors in order after the dwell', () => {
    const g = createGoal(spec);
    expect(g.detail()).toBe('a');
    look(g, cam(0, -1), 3);
    expect(g.progress).toBe(0);
    look(g, cam(0, -1), 1);
    expect(g.progress).toBe(1);
    expect(g.detail()).toBe('b');
    look(g, cam(1, 0), 4);
    expect(g.done).toBe(true);
    expect(g.detail()).toBeNull();
    roundTrip(spec, g, q);
  });
  it('looking at a later anchor first does nothing', () => {
    const g = createGoal(spec);
    look(g, cam(1, 0), 10);
    expect(g.progress).toBe(0);
  });
  it('leaving the cone resets dwell', () => {
    const g = createGoal(spec);
    look(g, cam(0, -1), 3);
    look(g, cam(0, 1), 1);
    look(g, cam(0, -1), 3);
    expect(g.progress).toBe(0);
    look(g, cam(0, -1), 1);
    expect(g.progress).toBe(1);
  });
  it('null camera does nothing and keeps dwell', () => {
    const g = createGoal(spec);
    look(g, null, 20);
    expect(g.progress).toBe(0);
    look(g, cam(0, -1), 3);
    look(g, null, 5);
    look(g, cam(0, -1), 1);
    expect(g.progress).toBe(1);
  });
  it('skips a missing anchor in tick', () => {
    const g = createGoal(spec);
    const qb = mkQ({ anchors: { b: anchors.b } });
    look(g, cam(1, 0), 1, 0.25, qb);
    expect(g.progress).toBe(1);
    look(g, cam(1, 0), 3, 0.25, qb);
    expect(g.done).toBe(true);
  });
  it('skips missing anchors in sync, even all of them', () => {
    const g = createGoal(spec);
    g.sync(mkQ({ anchors: { b: anchors.b } }));
    expect(g.progress).toBe(1);
    const h = createGoal(spec);
    h.sync(Q);
    expect(h.done).toBe(true);
    expect(h.detail()).toBeNull();
  });
  it('a missing anchor with a null camera is still skipped in tick', () => {
    const g = createGoal({ kind: 'gaze', anchors: ['zz'], degrees: 5, dwell: 1 });
    g.tick(tk(), Q);
    expect(g.done).toBe(true);
  });
  it('restore resets dwell and clamps', () => {
    const g = createGoal(spec);
    g.restore(1);
    expect(g.detail()).toBe('b');
    g.restore(50);
    expect(g.done).toBe(true);
  });
});

describe('count', () => {
  it('counts only the matching event type', () => {
    const spec: GoalSpec = { kind: 'count', event: 'blocked', count: 2 };
    const g = createGoal(spec);
    g.onEvent({ type: 'dodged' });
    g.onEvent({ type: 'blocked' });
    expect(g.progress).toBe(1);
    roundTrip(spec, g);
    g.onEvent({ type: 'blocked' });
    expect(g.done).toBe(true);
    roundTrip(spec, g);
    g.onEvent({ type: 'blocked' });
    expect(g.progress).toBe(2);
  });
  it('dodged variant', () => {
    const g = createGoal({ kind: 'count', event: 'dodged', count: 1 });
    g.onEvent({ type: 'blocked' });
    expect(g.done).toBe(false);
    g.onEvent({ type: 'dodged' });
    expect(g.done).toBe(true);
  });
});

describe('sprint', () => {
  const spec: GoalSpec = { kind: 'sprint', meters: 10, count: 2 };
  const run = (g: ReturnType<typeof createGoal>, xs: number[], sprinting = true): void => {
    for (const x of xs) g.tick(tk({ feet: feet(x), sprinting }), Q);
  };
  it('counts a segment, resets on stop, counts a second', () => {
    const g = createGoal(spec);
    run(g, [0, 3, 6, 9, 12]);
    expect(g.progress).toBe(1);
    run(g, [12], false);
    run(g, [12, 15, 18, 21, 24]);
    expect(g.done).toBe(true);
    roundTrip(spec, g);
  });
  it('first tick has no previous feet', () => {
    const g = createGoal({ kind: 'sprint', meters: 1, count: 1 });
    run(g, [100]);
    expect(g.done).toBe(false);
    run(g, [101]);
    expect(g.done).toBe(true);
  });
  it('ignores teleport steps over 5 m', () => {
    const g = createGoal({ kind: 'sprint', meters: 10, count: 1 });
    run(g, [0, 4, 100, 104]);
    expect(g.progress).toBe(0);
    run(g, [107, 110]);
    expect(g.done).toBe(true);
  });
  it('stopping resets the partial segment', () => {
    const g = createGoal({ kind: 'sprint', meters: 10, count: 1 });
    run(g, [0, 4, 8]);
    run(g, [8], false);
    run(g, [8, 12]);
    expect(g.progress).toBe(0);
  });
  it('one long segment counts once', () => {
    const g = createGoal({ kind: 'sprint', meters: 10, count: 3 });
    for (let x = 0; x <= 100; x += 2) run(g, [x]);
    expect(g.progress).toBe(1);
  });
  it('uses horizontal distance only', () => {
    const g = createGoal({ kind: 'sprint', meters: 4, count: 1 });
    g.tick(tk({ feet: { x: 0, y: 0, z: 0 }, sprinting: true }), Q);
    g.tick(tk({ feet: { x: 0, y: 4.9, z: 0 }, sprinting: true }), Q);
    expect(g.progress).toBe(0);
    g.tick(tk({ feet: { x: 3, y: 4.9, z: 4 }, sprinting: true }), Q);
    expect(g.done).toBe(true);
  });
  it('not sprinting never counts', () => {
    const g = createGoal(spec);
    run(g, [0, 3, 6, 9, 12, 15], false);
    expect(g.progress).toBe(0);
  });
});

describe('attacks', () => {
  const spec: GoalSpec = { kind: 'attacks', slots: [1, 2], chain: 3, window: 1 };
  const t = (g: ReturnType<typeof createGoal>, dt: number): void => g.tick(tk({ dt }), Q);
  it('records the slot bitmask', () => {
    const g = createGoal(spec);
    g.onEvent(hit(2));
    expect(g.progress).toBe(4);
    g.onEvent(hit(1));
    expect(g.progress).toBe(6);
    roundTrip(spec, g);
  });
  it('slot 0 and non-hit events do not count', () => {
    const g = createGoal(spec);
    g.onEvent(hit(0));
    g.onEvent({ type: 'blocked' });
    expect(g.progress).toBe(0);
  });
  it('the hit landing the last slot does not start the chain; later hits do', () => {
    const g = createGoal(spec);
    g.onEvent(hit(1));
    g.onEvent(hit(2));
    g.onEvent(hit(1));
    g.onEvent(hit(1));
    expect(g.done).toBe(false);
    g.onEvent(hit(2));
    expect(g.done).toBe(true);
    expect(g.progress).toBe(6 + 32);
    roundTrip(spec, g);
  });
  it('hits before all slots are landed do not count toward the chain', () => {
    const g = createGoal(spec);
    g.onEvent(hit(1));
    g.onEvent(hit(1));
    g.onEvent(hit(1));
    g.onEvent(hit(1));
    expect(g.done).toBe(false);
    g.onEvent(hit(2));
    expect(g.done).toBe(false);
  });
  it('a gap over the window restarts the chain at the current hit', () => {
    const g = createGoal(spec);
    g.onEvent(hit(1));
    g.onEvent(hit(2));
    g.onEvent(hit(1)); // chain 1
    t(g, 0.5);
    g.onEvent(hit(1)); // chain 2
    t(g, 1.5);
    g.onEvent(hit(1)); // restart: 1
    t(g, 0.5);
    g.onEvent(hit(1)); // 2
    expect(g.done).toBe(false);
    t(g, 0.5);
    g.onEvent(hit(1)); // 3
    expect(g.done).toBe(true);
  });
  it('slot 0 hits in the chain are ignored and do not break it', () => {
    const g = createGoal({ kind: 'attacks', slots: [1], chain: 2, window: 1 });
    g.onEvent(hit(1));
    g.onEvent(hit(1));
    g.onEvent(hit(0));
    g.onEvent(hit(1));
    expect(g.done).toBe(true);
  });
  it('restore of a bitmask without chain done is not done', () => {
    const r = createGoal(spec);
    r.restore(6);
    r.sync(Q);
    expect(r.done).toBe(false);
    expect(r.progress).toBe(6);
  });
});

describe('lockSwap', () => {
  const spec: GoalSpec = { kind: 'lockSwap', kills: 2 };
  const lock = (id: string | null): DirectorEvent => ({ type: 'lockon', targetId: id });
  it('lock, swap, then kills of the lock target', () => {
    const g = createGoal(spec);
    g.onEvent(lock('a'));
    expect(g.progress).toBe(1);
    g.onEvent(lock('b'));
    expect(g.progress).toBe(2);
    roundTrip(spec, g);
    g.onEvent(hit(1, 'b', true));
    expect(g.progress).toBe(3);
    roundTrip(spec, g);
    g.onEvent(lock('c'));
    g.onEvent(hit(1, 'c', true));
    expect(g.done).toBe(true);
    expect(g.progress).toBe(4);
    roundTrip(spec, g);
  });
  it('relocking the same id is not a swap', () => {
    const g = createGoal(spec);
    g.onEvent(lock('a'));
    g.onEvent(lock('a'));
    g.onEvent(lock(null));
    g.onEvent(lock('a'));
    expect(g.progress).toBe(1);
    g.onEvent(lock('b'));
    expect(g.progress).toBe(2);
  });
  it('kills before the swap do not count', () => {
    const g = createGoal(spec);
    g.onEvent(lock('a'));
    g.onEvent(hit(1, 'a', true));
    g.onEvent(lock('b'));
    expect(g.progress).toBe(2);
  });
  it('kill without a lock, of a non-target, or non-lethal gives no credit', () => {
    const g = createGoal(spec);
    g.onEvent(lock('a'));
    g.onEvent(lock('b'));
    g.onEvent(hit(1, 'b', false));
    g.onEvent(hit(1, 'z', true));
    g.onEvent(lock(null));
    g.onEvent(hit(1, 'b', true));
    expect(g.progress).toBe(2);
  });
  it('lock null alone does nothing', () => {
    const g = createGoal(spec);
    g.onEvent(lock(null));
    expect(g.progress).toBe(0);
  });
  it('a surge hit (slot 0) that kills the target counts', () => {
    const g = createGoal({ kind: 'lockSwap', kills: 1 });
    g.onEvent(lock('a'));
    g.onEvent(lock('b'));
    g.onEvent(hit(0, 'b', true));
    expect(g.done).toBe(true);
  });
});

describe('equipped', () => {
  const spec: GoalSpec = {
    kind: 'equipped',
    items: [{ slot: 'weapon', itemId: 'sword' }, { slot: 'body', itemId: 'mail' }],
  };
  const eq = (slot: string, itemId: string | null): DirectorEvent => ({ type: 'equipped', slot, itemId });
  it('done when all items are equipped via events', () => {
    const g = createGoal(spec);
    g.onEvent(eq('weapon', 'sword'));
    expect(g.progress).toBe(1);
    g.onEvent(eq('body', 'mail'));
    expect(g.done).toBe(true);
    expect(g.progress).toBe(2);
  });
  it('a different item or null un-does an item', () => {
    const g = createGoal(spec);
    g.onEvent(eq('weapon', 'sword'));
    g.onEvent(eq('weapon', 'axe'));
    expect(g.progress).toBe(0);
    g.onEvent(eq('weapon', 'sword'));
    g.onEvent(eq('weapon', null));
    expect(g.progress).toBe(0);
    g.onEvent(eq('head', 'helm'));
    expect(g.progress).toBe(0);
  });
  it('sync reads state and round trips', () => {
    const q = mkQ({ equipped: { weapon: 'sword', body: 'mail' } });
    const g = createGoal(spec);
    g.sync(mkQ({ equipped: { weapon: 'sword', body: 'rags' } }));
    expect(g.progress).toBe(1);
    expect(g.done).toBe(false);
    roundTrip(spec, g, mkQ({ equipped: { weapon: 'sword', body: 'rags' } }));
    g.sync(q);
    expect(g.done).toBe(true);
    roundTrip(spec, g, q);
  });
  it('stays done when later un-equipped', () => {
    const g = createGoal(spec);
    g.sync(mkQ({ equipped: { weapon: 'sword', body: 'mail' } }));
    g.onEvent(eq('weapon', null));
    expect(g.done).toBe(true);
  });
});

describe('skill', () => {
  const spec: GoalSpec = { kind: 'skill', actives: ['a1', 'a2'], passives: ['p1'] };
  it('active: learned then used', () => {
    const g = createGoal(spec);
    g.onEvent({ type: 'learned', skillId: 'a2' });
    expect(g.progress).toBe(3);
    expect(g.detail()).toBe('a2');
    g.onEvent({ type: 'abilityUsed', skillId: 'a1' });
    expect(g.done).toBe(false);
    roundTrip(spec, g);
    g.onEvent({ type: 'abilityUsed', skillId: 'a2' });
    expect(g.done).toBe(true);
    expect(g.progress).toBe(4);
    expect(g.detail()).toBe('a2');
    roundTrip(spec, g);
  });
  it('use before learn is ignored', () => {
    const g = createGoal(spec);
    g.onEvent({ type: 'abilityUsed', skillId: 'a1' });
    g.onEvent({ type: 'skillTriggered', skillId: 'p1' });
    expect(g.progress).toBe(0);
    g.onEvent({ type: 'learned', skillId: 'a1' });
    expect(g.done).toBe(false);
    expect(g.progress).toBe(1);
  });
  it('passive: triggered, not used', () => {
    const g = createGoal(spec);
    g.onEvent({ type: 'learned', skillId: 'p1' });
    expect(g.progress).toBe(5);
    g.onEvent({ type: 'abilityUsed', skillId: 'p1' });
    expect(g.done).toBe(false);
    roundTrip(spec, g);
    g.onEvent({ type: 'skillTriggered', skillId: 'p1' });
    expect(g.done).toBe(true);
    expect(g.progress).toBe(6);
    roundTrip(spec, g);
  });
  it('an active is not completed by a trigger event', () => {
    const g = createGoal(spec);
    g.onEvent({ type: 'learned', skillId: 'a1' });
    g.onEvent({ type: 'skillTriggered', skillId: 'a1' });
    expect(g.done).toBe(false);
  });
  it('unknown skill learned is ignored; first learned skill wins', () => {
    const g = createGoal(spec);
    g.onEvent({ type: 'learned', skillId: 'zzz' });
    expect(g.progress).toBe(0);
    g.onEvent({ type: 'learned', skillId: 'a1' });
    g.onEvent({ type: 'learned', skillId: 'a2' });
    expect(g.detail()).toBe('a1');
  });
  it('sync finds the first learned skill, actives first', () => {
    const g = createGoal(spec);
    g.sync(mkQ({ learned: ['p1', 'a2'] }));
    expect(g.detail()).toBe('a2');
    expect(g.progress).toBe(3);
    const h = createGoal(spec);
    h.sync(Q);
    expect(h.progress).toBe(0);
    expect(h.detail()).toBeNull();
  });
  it('restore of bad values clears', () => {
    const g = createGoal(spec);
    g.restore(99);
    expect(g.progress).toBe(0);
    g.restore(0);
    expect(g.detail()).toBeNull();
  });
});

describe('cleared', () => {
  const spec: GoalSpec = { kind: 'cleared', spawnerIds: ['s1', 's2', 's3'] };
  it('needs all groups, ignores unknown and repeated ids', () => {
    const g = createGoal(spec);
    g.onEvent({ type: 'groupCleared', spawnerId: 's2' });
    g.onEvent({ type: 'groupCleared', spawnerId: 's2' });
    g.onEvent({ type: 'groupCleared', spawnerId: 'nope' });
    expect(g.progress).toBe(2);
    roundTrip(spec, g);
    g.onEvent({ type: 'groupCleared', spawnerId: 's1' });
    expect(g.done).toBe(false);
    g.onEvent({ type: 'groupCleared', spawnerId: 's3' });
    expect(g.done).toBe(true);
    expect(g.progress).toBe(7);
    roundTrip(spec, g);
  });
});

describe('done stays done', () => {
  it('ignores further events and ticks', () => {
    const g = createGoal({ kind: 'kill', creature: 'wolf', spawnTag: 't', count: 1 });
    g.onEvent(kill('a'));
    g.onEvent(kill('b'));
    expect(g.progress).toBe(1);
    expect(g.done).toBe(true);
  });
  it('gaze past the end stays done', () => {
    const g = createGoal({ kind: 'gaze', anchors: [], degrees: 5, dwell: 1 });
    expect(g.done).toBe(true);
    g.tick(tk(), Q);
    expect(g.done).toBe(true);
  });
});
