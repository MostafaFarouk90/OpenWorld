// The M20 and D04 installers against stub services on the real event bus, the real flag store and a real QuestManager
// (so "the arena objective is current" is the quest's own answer): Orsk played once, the skip path, a load after `gone`,
// the chain posts, `story.d04.started` gating, the Slagmaw's outcome and the two pool puzzles end to end.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../../../core/EventBus';
import type { GameContext } from '../../../../../core/Game';
import type { GameEventMap } from '../../../../../core/events';
import { Services } from '../../../../../core/Services';
import { WorldState } from '../../../../../state/WorldState';
import { WyrmTethers } from '../../../../../enemies/wyrm/tethers';
import { ORSK_BEATS } from '../../../../../enemies/wyrm/orsk';
import { QuestManager } from '../../../../QuestManager';
import { installObjectiveFlags } from '../../../../objectiveFlags';
import { makeKit, type Off } from '../../director/kit';
import { M20D04, M20_CHAIN_FLAGS, M20_NOTES, M20_ORSK_GONE, D04_NOTES } from './m20d04.content';
import { M20_NURSERY_GROUP } from './m20d04.data';
import { M20_EXIT_ANCHOR, M20_ROOF_ANCHOR, M20_ROOF_HEIGHT, ORSK_CHECK_TICKS, installD04, installM20 } from './m20d04.director';
import { D04_POOLS, POOL_VENT_TICKS, poolDef, ringPoint } from './m20d04.pools';

const ANCHORS: Record<string, { x: number; y: number; z: number; yaw: number }> = {
  [M20_ROOF_ANCHOR]: { x: 4, y: 2, z: -112, yaw: 1.5 },
  'oldsmoke.deepdelve.pool.1': { x: -56, y: 0, z: -96, yaw: 0 },
  'oldsmoke.deepdelve.pool.2': { x: 56, y: 0, z: -96, yaw: 0 },
  ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`oldsmoke.m20.chain.${n}`, { x: n * 5, y: 0, z: -90, yaw: 0 }])),
};

interface Valve { id: string; kind: string; enabled(): boolean; onInteract(): void }

function rig(opts: { anchors?: boolean; dialogue?: boolean; presetFlags?: Record<string, boolean | string>; only?: 'm20' | 'd04' } = {}) {
  const events = new EventBus<GameEventMap>(() => {});
  const state = new WorldState(events, () => {});
  for (const [k, v] of Object.entries(opts.presetFlags ?? {})) state.setFlag(k, v);
  const services = new Services();
  const manager = new QuestManager({ bus: events as never, state: state as never, playerId: () => 'player', warn: () => {} });
  // only the quest under test is real; its prerequisite (M19 or M20) is a one-talk stand-in
  const pre = opts.only === 'm20' ? 'm19' : 'm20';
  manager.register({ id: pre, titleKey: 't', summaryKey: 's', objectives: [{ id: 'o', type: 'talk', target: `${pre}-npc`, textKey: 'o' }] });
  for (const q of M20D04.quests) if (q.id === (opts.only ?? 'd04')) manager.register(q);
  const flags = installObjectiveFlags(M20D04.flags, events as never, state as never, manager);
  services.provide('quests' as never, manager as never);

  const dialogue = { active: opts.dialogue ?? false };
  services.provide('dialogue' as never, dialogue as never);
  // a real tether table behind the stub, so the chain posts are tested for what they do
  const tethers = new WyrmTethers({ anchor: (id) => ANCHORS[id], flag: (k) => state.getBool(k), warn: () => {} });
  const orskRequests: unknown[] = [];
  const orsk = { busy: false, skipped: 0, resolve: [] as Array<() => void>, refuse: false };
  const wyrms = {
    tether: vi.fn((id: string, posts: never, o: never) => tethers.tether(id, posts, o)),
    unchain: () => false,
    flyAway: () => false,
    playOrsk: (req: unknown) => {
      if (orsk.refuse) return null;
      orskRequests.push(req as never);
      let resolve!: () => void;
      const done = new Promise<void>((r) => (resolve = r));
      orsk.resolve.push(resolve);
      return {
        done,
        skip: () => {
          orsk.skipped++;
          for (const b of ORSK_BEATS) events.emit('wyrm.orsk', { beat: b.beat });
          resolve();
        },
      };
    },
  };
  services.provide('wyrms' as never, wyrms as never);
  const puzzleRegs: string[] = [];
  const aborts = new Map<string, () => void>();
  services.provide('puzzles' as never, {
    register: (id: string, reg: { onAbort?: () => void }) => { puzzleRegs.push(id); if (reg.onAbort) aborts.set(id, reg.onAbort); return () => {}; },
    pressure: () => null,
  } as never);

  const valves: Valve[] = [];
  const triggers: string[] = [];
  const ctx = {
    events, state, services,
    anchors: { find: (id: string) => (opts.anchors === false ? undefined : ANCHORS[id] && { id, position: { x: ANCHORS[id].x, y: ANCHORS[id].y, z: ANCHORS[id].z }, yaw: ANCHORS[id].yaw }) },
    triggers: { add: (t: { id: string }) => { triggers.push(t.id); return () => {}; } },
    interaction: { register: (i: Valve) => { valves.push(i); return () => void valves.splice(valves.indexOf(i), 1); } },
    player: { feet: { x: 0, y: 0, z: 0 } },
  } as unknown as GameContext;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const offs: Off[] = [];
  const { kit, tick } = makeKit(ctx, (m) => console.warn(m), offs);
  return {
    events, state, manager, kit, tick, tethers, wyrms, orsk, orskRequests, dialogue, valves, puzzleRegs, aborts, warn, flags,
    install20: () => void offs.push(...installM20(kit)),
    install04: () => void offs.push(...installD04(kit)),
    step: (n = 1) => { for (let i = 0; i < n; i++) tick(); },
    dispose: () => { for (const o of offs.splice(0)) o(); flags.dispose(); },
    emit: (type: string, payload: unknown = {}) => events.emit(type as never, payload as never),
    talk: (npcId: string, reason = 'completed') => events.emit('dialogue.ended', { npcId, reason } as never),
    killOf: (kind: string, tag: string, id: string) => events.emit('actor.died', { actorId: id, killerId: 'player', kind, spawnTag: tag } as never),
    interact: (id: string) => events.emit('interact', { interactableId: id, kind: 'use', actorId: 'player', action: 'interact' } as never),
  };
}
type R = ReturnType<typeof rig>;

beforeEach(() => void vi.restoreAllMocks());

const startQuest = (r: R, id: 'm20' | 'd04') => {
  const pre = id === 'm20' ? 'm19' : 'm20';
  expect(r.manager.start(pre)).toBe(true);
  r.talk(`${pre}-npc`);
  expect(r.manager.start(id)).toBe(true);
};
const chainsDown = (r: R, order = [1, 2, 3, 4, 5]) => { for (const n of order) r.state.setFlag(`story.m20.chain.${n}`, true); };
const toChainsObjective = (r: R) => {
  r.talk('wenna');
  for (let i = 0; i < 8; i++) r.killOf('steward-guard', 'm20.stewards', `s${i}`);
  r.talk('steward-captain');
};

describe('M20: the nursery chains', () => {
  it('chains five wyrmlings at the chain anchors, each freed by its own flag in any order', () => {
    const r = rig({ only: 'm20' });
    r.install20();
    expect(r.wyrms.tether).toHaveBeenCalledTimes(1);
    const [group, posts, opts] = r.wyrms.tether.mock.calls[0] as unknown as [string, Array<{ anchor: string; until: { all: string[] } }>, { exitAnchor: string }];
    expect(group).toBe(M20_NURSERY_GROUP);
    expect(posts.map((p) => p.anchor)).toEqual([1, 2, 3, 4, 5].map((n) => `oldsmoke.m20.chain.${n}`));
    expect(posts.map((p) => p.until.all)).toEqual(M20_CHAIN_FLAGS.map((f) => [f]));
    expect(opts.exitAnchor).toBe(M20_EXIT_ANCHOR);
    for (let slot = 0; slot < 5; slot++) expect(r.tethers.chainFor(M20_NURSERY_GROUP, slot), `slot ${slot} chained`).not.toBeNull();
    for (const n of [4, 2, 5]) r.state.setFlag(`story.m20.chain.${n}`, true);
    expect([0, 1, 2, 3, 4].map((s) => r.tethers.chainFor(M20_NURSERY_GROUP, s) === null)).toEqual([false, true, false, true, true]);
    r.dispose();
  });

  it('warns, and does not throw, when there is no wyrms service', () => {
    const r2 = rig({ only: 'm20' });
    const ctx = r2.kit.ctx as unknown as { services: { get(k: string): unknown } };
    ctx.services.get = () => undefined;
    r2.install20();
    expect(r2.warn).toHaveBeenCalledWith(expect.stringContaining('no wyrms service'));
    r2.dispose();
  });
});

describe('M20: Orsk', () => {
  it('plays once when the fifth chain falls, at the roof anchor, and writes orskGone on the gone beat', () => {
    const r = rig({ only: 'm20' });
    startQuest(r, 'm20');
    r.install20();
    chainsDown(r, [1, 2, 3, 4]);
    r.step(ORSK_CHECK_TICKS * 2);
    expect(r.orskRequests).toHaveLength(0);
    r.state.setFlag('story.m20.chain.5', true);
    r.step(ORSK_CHECK_TICKS);
    expect(r.orskRequests).toEqual([{ position: { x: 4, y: 2, z: -112 }, yaw: 1.5, roofHeight: M20_ROOF_HEIGHT }]);
    r.step(ORSK_CHECK_TICKS * 10);
    expect(r.orskRequests).toHaveLength(1); // still playing: never a second scene
    r.emit('wyrm.orsk', { beat: 'chainsBroken' });
    r.emit('wyrm.orsk', { beat: 'roofBurst' });
    expect(r.state.getBool(M20_ORSK_GONE)).toBe(false);
    r.emit('wyrm.orsk', { beat: 'gone' });
    expect(r.state.getBool(M20_ORSK_GONE)).toBe(true);
    r.step(ORSK_CHECK_TICKS * 5);
    expect(r.orskRequests).toHaveLength(1);
    r.dispose();
  });

  it('the chains fall in any order and the fifth, whichever it is, starts the scene', () => {
    for (const order of [[5, 4, 3, 2, 1], [2, 5, 1, 4, 3]]) {
      const r = rig({ only: 'm20' });
      startQuest(r, 'm20');
      r.install20();
      chainsDown(r, order);
      r.step(ORSK_CHECK_TICKS);
      expect(r.orskRequests, order.join()).toHaveLength(1);
      r.dispose();
    }
  });

  it('waits while a dialogue holds the floor, then plays', () => {
    const r = rig({ only: 'm20', dialogue: true });
    startQuest(r, 'm20');
    r.install20();
    chainsDown(r);
    r.step(ORSK_CHECK_TICKS * 3);
    expect(r.orskRequests).toHaveLength(0);
    r.dialogue.active = false;
    r.step(ORSK_CHECK_TICKS);
    expect(r.orskRequests).toHaveLength(1);
    r.dispose();
  });

  it('the skip path emits every beat once and the flag is written once', () => {
    const r = rig({ only: 'm20' });
    startQuest(r, 'm20');
    r.install20();
    const beats: string[] = [];
    r.events.on('wyrm.orsk', (e) => void beats.push(e.beat));
    chainsDown(r);
    r.step(ORSK_CHECK_TICKS);
    // the player presses Esc: the scene's skip raises every beat in order
    const set = vi.spyOn(r.state, 'setFlag');
    for (const b of ORSK_BEATS) r.events.emit('wyrm.orsk', { beat: b.beat });
    expect(beats).toEqual(ORSK_BEATS.map((b) => b.beat));
    expect(set.mock.calls.filter((c) => c[0] === M20_ORSK_GONE)).toHaveLength(1);
    expect(r.state.getBool(M20_ORSK_GONE)).toBe(true);
    r.dispose();
  });

  it('a load after gone does not replay, however many checks pass', () => {
    const r = rig({ only: 'm20', presetFlags: { ...Object.fromEntries(M20_CHAIN_FLAGS.map((f) => [f, true])), [M20_ORSK_GONE]: true } });
    startQuest(r, 'm20');
    r.install20();
    r.emit('save.loaded', { slot: 'a' });
    r.step(ORSK_CHECK_TICKS * 5);
    expect(r.orskRequests).toHaveLength(0);
    r.dispose();
  });

  it('a load with all five chains broken and Orsk not yet gone plays the scene again, once', () => {
    const r = rig({ only: 'm20', presetFlags: Object.fromEntries(M20_CHAIN_FLAGS.map((f) => [f, true])) });
    startQuest(r, 'm20');
    r.install20();
    r.emit('save.loaded', { slot: 'a' });
    r.step(ORSK_CHECK_TICKS * 5);
    expect(r.orskRequests).toHaveLength(1);
    r.dispose();
  });

  it('does not play outside the quest: before it starts, or after it is done', () => {
    const r = rig({ only: 'm20', presetFlags: Object.fromEntries(M20_CHAIN_FLAGS.map((f) => [f, true])) });
    r.install20();
    r.step(ORSK_CHECK_TICKS * 3);
    expect(r.orskRequests).toHaveLength(0);
    r.dispose();
  });

  it('retries when the service refuses (a scene already playing) and never sets the flag then', () => {
    const r = rig({ only: 'm20' });
    startQuest(r, 'm20');
    r.install20();
    chainsDown(r);
    r.orsk.refuse = true;
    r.step(ORSK_CHECK_TICKS * 3);
    expect(r.orskRequests).toHaveLength(0);
    expect(r.state.getBool(M20_ORSK_GONE)).toBe(false);
    r.orsk.refuse = false;
    r.step(ORSK_CHECK_TICKS);
    expect(r.orskRequests).toHaveLength(1);
    r.dispose();
  });

  it('a missing roof anchor warns and marks Orsk gone, so the quest is not stranded', () => {
    const r = rig({ only: 'm20', anchors: false });
    startQuest(r, 'm20');
    r.install20();
    chainsDown(r);
    r.step(ORSK_CHECK_TICKS);
    expect(r.warn).toHaveBeenCalledWith(expect.stringContaining(M20_ROOF_ANCHOR));
    expect(r.state.getBool(M20_ORSK_GONE)).toBe(true);
    r.dispose();
  });

  it('a scene torn down without its gone beat may play again; one that ended on gone never does', () => {
    const r = rig({ only: 'm20' });
    startQuest(r, 'm20');
    r.install20();
    chainsDown(r);
    r.step(ORSK_CHECK_TICKS);
    r.orsk.resolve[0](); // scope teardown: done resolves, no gone beat
    return Promise.resolve().then(() => {
      r.step(ORSK_CHECK_TICKS);
      expect(r.orskRequests).toHaveLength(2);
      r.emit('wyrm.orsk', { beat: 'gone' });
      r.orsk.resolve[1]();
      return Promise.resolve().then(() => {
        r.step(ORSK_CHECK_TICKS * 3);
        expect(r.orskRequests).toHaveLength(2);
        r.dispose();
      });
    });
  });

  it('end to end: the quest reaches the aftermath after the scene, even with the keeper still unheard', () => {
    const r = rig({ only: 'm20' });
    startQuest(r, 'm20');
    r.install20();
    toChainsObjective(r);
    for (const n of [3, 1, 5, 2, 4]) { r.interact(`use:m20-chain-${n}`); r.state.setFlag(`story.m20.chain.${n}`, true); }
    r.step(ORSK_CHECK_TICKS);
    expect(r.orskRequests).toHaveLength(1);
    for (const b of ORSK_BEATS) r.events.emit('wyrm.orsk', { beat: b.beat });
    expect(r.manager.isObjectiveCurrent('m20', 'search')).toBe(true);
    for (const id of M20_NOTES) r.talk(id);
    r.talk('wyrmling-keeper');
    expect(r.manager.isObjectiveCurrent('m20', 'aftermath')).toBe(true);
    r.dispose();
  });
});

describe('D04: the arena and the Slagmaw', () => {
  const toPools = (r: R) => {
    r.talk('slagg');
    r.emit('trigger.enter', { triggerId: 'trg.q13.d04.stage1', actorId: 'player' });
    r.emit('trigger.enter', { triggerId: 'trg.q13.d04.stage2', actorId: 'player' });
    for (let i = 0; i < 10; i++) r.killOf('slag-crawler', 'd04.crawlers-a', `a${i}`);
    r.killOf('cinder-golem', 'd04.golem', 'g1');
    for (let i = 0; i < 3; i++) r.killOf('slag-crawler', 'd04.crawlers-b', `b${i}`);
    for (const id of D04_NOTES) r.talk(id);
  };

  it('does not write story.d04.started on accept, nor while the pools are still open', () => {
    const r = rig({ only: 'd04' });
    r.install04();
    startQuest(r, 'd04');
    r.step(5);
    expect(r.state.getBool('story.d04.started')).toBe(false);
    toPools(r);
    r.step(5);
    expect(r.manager.isObjectiveCurrent('d04', 'pool1')).toBe(true);
    expect(r.state.getBool('story.d04.started')).toBe(false);
    r.emit('puzzle.solved', { id: 'd04.pool-1' });
    r.step(5);
    expect(r.state.getBool('story.d04.started')).toBe(false);
    r.dispose();
  });

  it('writes it, once, when the arena objective becomes current', () => {
    const r = rig({ only: 'd04' });
    r.install04();
    startQuest(r, 'd04');
    toPools(r);
    r.emit('puzzle.solved', { id: 'd04.pool-1' });
    r.emit('puzzle.solved', { id: 'd04.pool-2' });
    expect(r.manager.isObjectiveCurrent('d04', 'slagmaw')).toBe(true);
    r.step(2);
    expect(r.state.getBool('story.d04.started')).toBe(true);
    const set = vi.spyOn(r.state, 'setFlag');
    r.step(60);
    r.emit('save.loaded', { slot: 'a' });
    r.step(2);
    expect(set.mock.calls.filter((c) => c[0] === 'story.d04.started')).toHaveLength(0);
    r.dispose();
  });

  it('a load into the arena objective (a flag lost, a save from before) arms it', () => {
    const r = rig({ only: 'd04' });
    startQuest(r, 'd04');
    toPools(r);
    r.emit('puzzle.solved', { id: 'd04.pool-1' });
    r.emit('puzzle.solved', { id: 'd04.pool-2' });
    r.install04(); // the director comes up after the quest state loaded
    r.step(2);
    expect(r.state.getBool('story.d04.started')).toBe(true);
    r.dispose();
  });

  it('does not arm for a quest that is not active', () => {
    const r = rig({ only: 'd04' });
    r.install04();
    r.step(5);
    r.emit('save.loaded', { slot: 'a' });
    r.step(5);
    expect(r.state.getBool('story.d04.started')).toBe(false);
    r.dispose();
  });

  it('boss.defeated of the Slagmaw credits the objective and records the outcome; another boss does not', () => {
    const r = rig({ only: 'd04' });
    r.install04();
    startQuest(r, 'd04');
    toPools(r);
    r.emit('puzzle.solved', { id: 'd04.pool-1' });
    r.emit('puzzle.solved', { id: 'd04.pool-2' });
    r.emit('boss.defeated', { bossId: 'thrandil-redmane', actorId: 'b' });
    expect(r.manager.objectiveDone('d04', 'slagmaw')).toBe(false);
    expect(r.state.getString('story.d04.outcome')).toBe('');
    r.emit('boss.defeated', { bossId: 'the-slagmaw', actorId: 'b' });
    expect(r.manager.objectiveDone('d04', 'slagmaw')).toBe(true);
    expect(r.state.getString('story.d04.outcome')).toBe('defeated');
    r.talk('slagg');
    expect(r.manager.state('d04')).toBe('completed');
    r.dispose();
  });

  it('the quest ends with no spare: boss.spared writes nothing', () => {
    const r = rig({ only: 'd04' });
    r.install04();
    r.emit('boss.spared', { bossId: 'the-slagmaw', actorId: 'b' });
    expect(r.state.getString('story.d04.outcome')).toBe('');
    r.dispose();
  });

  it('an outcome already in the world (A8\'s flag) is copied on install and on a load; "spared" is not', () => {
    const r = rig({ only: 'd04', presetFlags: { 'boss.the-slagmaw.outcome': 'defeated' } });
    r.install04();
    expect(r.state.getString('story.d04.outcome')).toBe('defeated');
    r.dispose();
    const r2 = rig({ only: 'd04', presetFlags: { 'boss.the-slagmaw.outcome': 'spared' } });
    r2.install04();
    r2.emit('save.loaded', { slot: 'a' });
    expect(r2.state.getString('story.d04.outcome')).toBe('');
    r2.dispose();
    const r3 = rig({ only: 'd04' });
    r3.install04();
    r3.state.setFlag('boss.the-slagmaw.outcome', 'defeated');
    r3.emit('save.loaded', { slot: 'a' });
    expect(r3.state.getString('story.d04.outcome')).toBe('defeated');
    r3.dispose();
  });

  it('a load with the outcome flag credits the arena objective and the quest can be handed in', () => {
    const r = rig({ only: 'd04', presetFlags: { 'boss.the-slagmaw.outcome': 'defeated' } });
    r.install04();
    startQuest(r, 'd04');
    toPools(r);
    r.emit('puzzle.solved', { id: 'd04.pool-1' });
    r.emit('puzzle.solved', { id: 'd04.pool-2' });
    r.manager.recheck();
    expect(r.manager.isObjectiveCurrent('d04', 'report')).toBe(true);
    r.dispose();
  });
});

describe('D04: the pool puzzles', () => {
  const turns = (p: (typeof D04_POOLS)[number]) => p.startShort;
  const valvesOf = (r: R, prefix: string) => r.valves.filter((v) => v.id.startsWith(`valve:${prefix}-`)).sort((a, b) => a.id.localeCompare(b.id));
  const reachPools = (r: R) => {
    r.talk('slagg');
    r.emit('trigger.enter', { triggerId: 'trg.q13.d04.stage1', actorId: 'player' });
    r.emit('trigger.enter', { triggerId: 'trg.q13.d04.stage2', actorId: 'player' });
    for (let i = 0; i < 10; i++) r.killOf('slag-crawler', 'd04.crawlers-a', `a${i}`);
    r.killOf('cinder-golem', 'd04.golem', 'g1');
    for (let i = 0; i < 3; i++) r.killOf('slag-crawler', 'd04.crawlers-b', `b${i}`);
    for (const id of D04_NOTES) r.talk(id);
  };
  const solve = (r: R, p: (typeof D04_POOLS)[number]) => {
    const vs = valvesOf(r, p.valvePrefix);
    vs.forEach((v, i) => { for (let t = 0; t < turns(p)[i]; t++) v.onInteract(); });
  };

  it('definitions: each pool starts off its marks, needs the turns listed, and orders every valve', () => {
    for (const p of D04_POOLS) {
      const def = poolDef(p);
      expect(def.initial).not.toEqual(def.plaque);
      expect(def.initial.every((v, i) => (v + p.startShort[i]) % p.positions === p.plaque[i])).toBe(true);
      expect([...p.order].sort()).toEqual(p.plaque.map((_, i) => i));
    }
    expect(D04_POOLS.map((p) => p.puzzleId)).toEqual(['d04.pool-1', 'd04.pool-2']);
    expect(new Set(D04_POOLS.map((p) => p.valvePrefix)).size).toBe(2);
    // not A8's `valve:slagmaw-N` ids
    expect(D04_POOLS.every((p) => !p.valvePrefix.includes('slagmaw'))).toBe(true);
  });

  it('registers each pool with the puzzles service and stands its valves on a ring about the anchor', () => {
    const r = rig({ only: 'd04' });
    r.install04();
    r.step(30);
    expect(r.puzzleRegs.sort()).toEqual(['d04.pool-1', 'd04.pool-2']);
    expect(valvesOf(r, 'd04pool1')).toHaveLength(3);
    expect(valvesOf(r, 'd04pool2')).toHaveLength(4);
    const p = ringPoint({ x: 0, y: 0, z: 0 }, 1, 4);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(3.2, 5);
    r.step(300);
    expect(r.valves).toHaveLength(7); // placed once
    r.dispose();
  });

  it('waits for the anchor: no valves, no error, until it exists', () => {
    const r = rig({ only: 'd04', anchors: false });
    r.install04();
    r.step(120);
    expect(r.valves).toHaveLength(0);
    r.dispose();
  });

  it('only the current pool turns: pool 2 is dead while pool 1 is the objective, and both while the quest is not on them', () => {
    const r = rig({ only: 'd04' });
    r.install04();
    startQuest(r, 'd04');
    r.step(30);
    expect(r.valves.every((v) => !v.enabled())).toBe(true);
    reachPools(r);
    expect(valvesOf(r, 'd04pool1').every((v) => v.enabled())).toBe(true);
    expect(valvesOf(r, 'd04pool2').every((v) => !v.enabled())).toBe(true);
    r.dispose();
  });

  it('routing within the clock opens the vents, solves the pool, raises puzzle.solved and credits D04', () => {
    const r = rig({ only: 'd04' });
    r.install04();
    startQuest(r, 'd04');
    reachPools(r);
    r.step(30);
    const states: string[] = [];
    r.events.on('puzzle.state', (e) => void states.push(`${e.id}:${e.phase}`));
    const solved: string[] = [];
    r.events.on('puzzle.solved', (e) => void solved.push(e.id));
    solve(r, D04_POOLS[0]);
    expect(states).toEqual(['d04.pool-1:pressure', 'd04.pool-1:lighting']);
    expect(solved).toEqual([]);
    r.step(POOL_VENT_TICKS);
    expect(solved).toEqual(['d04.pool-1']);
    expect(r.state.getBool('story.d04.pool1')).toBe(true);
    expect(r.manager.objectiveDone('d04', 'pool1')).toBe(true);
    expect(valvesOf(r, 'd04pool2').every((v) => v.enabled())).toBe(true);
    solve(r, D04_POOLS[1]);
    r.step(POOL_VENT_TICKS);
    expect(solved).toEqual(['d04.pool-1', 'd04.pool-2']);
    expect(r.manager.isObjectiveCurrent('d04', 'slagmaw')).toBe(true);
    expect(valvesOf(r, 'd04pool1').every((v) => !v.enabled())).toBe(true);
    r.dispose();
  });

  it('a clock that runs out fails the pool, springs the valves back and solves nothing', () => {
    const r = rig({ only: 'd04' });
    r.install04();
    startQuest(r, 'd04');
    reachPools(r);
    r.step(30);
    const failed: string[] = [];
    r.events.on('puzzle.failed', (e) => void failed.push(e.id));
    const vs = valvesOf(r, 'd04pool1');
    vs[0].onInteract(); // starts the clock
    r.step(D04_POOLS[0].seconds * 60 + 5);
    expect(failed).toEqual(['d04.pool-1']);
    expect(r.state.getBool('story.d04.pool1')).toBe(false);
    // the room is as new: routing it still works
    solve(r, D04_POOLS[0]);
    r.step(POOL_VENT_TICKS);
    expect(r.state.getBool('story.d04.pool1')).toBe(true);
    r.dispose();
  });

  it('an abort (death, travel, a load) resets a half-turned pool with no penalty', () => {
    const r = rig({ only: 'd04' });
    r.install04();
    startQuest(r, 'd04');
    reachPools(r);
    r.step(30);
    const failed: string[] = [];
    r.events.on('puzzle.failed', (e) => void failed.push(e.id));
    valvesOf(r, 'd04pool1')[0].onInteract();
    r.aborts.get('d04.pool-1')!();
    r.step(D04_POOLS[0].seconds * 60 + 5);
    expect(failed).toEqual([]);
    r.dispose();
  });

  it('a load restores a solved pool locked (flag), and a pool whose flag is gone back to unsolved', () => {
    const r = rig({ only: 'd04', presetFlags: { 'story.d04.pool1': true } });
    r.install04();
    startQuest(r, 'd04');
    reachPools(r);
    r.step(30);
    expect(valvesOf(r, 'd04pool1').every((v) => !v.enabled())).toBe(true);
    const solved: string[] = [];
    r.events.on('puzzle.solved', (e) => void solved.push(e.id));
    r.emit('save.loaded', { slot: 'a' });
    r.step(POOL_VENT_TICKS);
    expect(solved).toEqual([]); // restored, never re-solved
    // the flag gone (a new game): the wheels are free again and turning one starts the clock
    r.state.clearFlag('story.d04.pool1');
    r.emit('save.loaded', { slot: 'a' });
    const phases: string[] = [];
    r.events.on('puzzle.state', (e) => void phases.push(e.phase));
    valvesOf(r, 'd04pool1')[0].onInteract();
    expect(phases).toEqual(['pressure']);
    r.dispose();
  });

  it('dispose removes the listeners and the interactables', () => {
    const r = rig({ only: 'd04' });
    r.install04();
    r.step(30);
    r.dispose();
    expect(r.valves).toHaveLength(0);
    r.emit('boss.defeated', { bossId: 'the-slagmaw', actorId: 'b' });
    expect(r.state.getString('story.d04.outcome')).toBe('');
  });
});
