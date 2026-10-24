// v0.7 item 22: `?act3=` plumbing (no fixtures; K16 owns them). Every id in ACT3_PREREQS is reachable in both orders.
import { describe, expect, it, vi } from 'vitest';
import { tutorialFromQuery } from '../tutorial/tutorial.plugin';
import { devJumpBoot } from '../save/devJump';
import { ACT1_PREREQS } from './act1Jump';
import { ACT2_PREREQS, getActJump } from './actJump';
import {
  ACT3_ARRIVAL, ACT3_DIRECT, ACT3_START_XP, ACT3_GREYFEN, ACT3_JUMP_IDS, ACT3_ORDERS, ACT3_PREREQS, ACT3_SPINE, ACT3_SUMMIT, Act3Jump,
  type Act3JumpPorts, type Act3Order, act3Prereqs, blockOf, needsDragonspine, parseAct3,
} from './act3Jump';

describe('parseAct3', () => {
  it('accepts every Act 3 quest in both orders, with &new; order defaults to greyfen', () => {
    for (const id of ACT3_JUMP_IDS) {
      for (const order of ACT3_ORDERS) expect(parseAct3(`?act3=${id}&new&order=${order}`)).toEqual({ id, order, classId: 'knight', fresh: true });
    }
    expect(parseAct3('?act3=m23&new')).toMatchObject({ order: 'greyfen' });
    expect(parseAct3('?act3=m28&new&class=warden')).toMatchObject({ classId: 'warden' });
  });
  it('null without the parameter; refuses an unknown id, order or class and a missing &new', () => {
    expect(parseAct3('?act2=m11&new')).toBeNull();
    expect(parseAct3('?act3=m99&new')).toMatchObject({ error: expect.stringContaining('unknown quest') });
    expect(parseAct3('?act3=m23')).toMatchObject({ error: expect.stringContaining('&new') });
    expect(parseAct3('?act3=m23&new&order=summit')).toMatchObject({ error: expect.stringContaining('unknown order') });
    expect(parseAct3('?act3=m23&new&class=bard')).toMatchObject({ error: expect.stringContaining('unknown class') });
  });
  it('a valid jump skips the start screen and holds saves; a refused one only holds saves', () => {
    expect(tutorialFromQuery('?act3=m23&new&order=greyfen')).toEqual({ mode: 'kettlewick' });
    expect(tutorialFromQuery('?act3=m99&new')).toBeNull();
    expect(devJumpBoot('?act3=m28&new&order=spine', true)).toBe('jump');
    expect(devJumpBoot('?act3=m99&new', true)).toBe('refused');
  });
});

describe('ACT3_PREREQS', () => {
  const plan25 = (id: string) => ACT3_DIRECT[id];

  it('covers all 21 Act 3 quests in both orders; the registry holds the greyfen table', () => {
    expect(ACT3_JUMP_IDS).toHaveLength(21);
    for (const o of ACT3_ORDERS) expect(Object.keys(ACT3_PREREQS[o]).sort()).toEqual([...ACT3_JUMP_IDS].sort());
    expect(getActJump(3)?.prereqs).toBe(ACT3_PREREQS.greyfen);
  });

  it.each(ACT3_ORDERS)('order %s: every quest comes after all of its direct prerequisites, with no repeats', (order) => {
    for (const id of ACT3_JUMP_IDS) {
      const list = ACT3_PREREQS[order][id];
      expect(new Set(list).size, id).toBe(list.length);
      expect(list, id).not.toContain(id);
      for (const d of plan25(id)) expect(list, `${id} needs ${d}`).toContain(d);
      list.forEach((q, i) => {
        for (const d of plan25(q)) expect(list.indexOf(d), `${id}: ${d} before ${q}`).toBeGreaterThanOrEqual(0), expect(list.indexOf(d)).toBeLessThan(i);
      });
    }
  });

  it('the block lock quests open on the gate alone when their block is first', () => {
    expect(act3Prereqs('m23', 'greyfen')).toEqual([]);
    expect(act3Prereqs('m28', 'spine')).toEqual([]);
  });

  it('a second-block target needs the whole first block first', () => {
    expect(act3Prereqs('m28', 'greyfen')).toEqual([...ACT3_GREYFEN]);
    expect(act3Prereqs('m23', 'spine')).toEqual([...ACT3_SPINE]);
    expect(act3Prereqs('m24', 'spine')).toEqual([...ACT3_SPINE, 'm23']);
  });

  it('M27 waits on M26 and R14 (Q12); M31 on R16; M34 on every M and R quest and D05; D06 on M34', () => {
    expect(act3Prereqs('m27', 'greyfen')).toEqual(['m23', 'm24', 'm25', 'r14', 'm26']);
    expect(act3Prereqs('m31', 'greyfen')).toEqual(['m23', 'm24', 'm25', 'r14', 'm26', 'm27', 'd05', 'm28', 'm29', 'r16', 'm30']);
    expect(act3Prereqs('m31', 'spine')).toEqual(['m28', 'm29', 'r16', 'm30', 'm23', 'm24', 'm25', 'r14', 'm26', 'm27', 'd05']);
    const m34 = act3Prereqs('m34', 'spine');
    for (const q of [...ACT3_GREYFEN, ...ACT3_SPINE, 'm31', 'm32', 'm33']) expect(m34).toContain(q);
    expect(m34).not.toContain('d06');
    expect(act3Prereqs('d06', 'greyfen').at(-1)).toBe('m34');
  });

  it('blocks, arrival points and the Dragonspine hold', () => {
    expect(ACT3_SUMMIT.every((q) => blockOf(q) === 'summit')).toBe(true);
    expect(blockOf('m22')).toBeUndefined();
    expect(ACT3_ARRIVAL.greyfen).toEqual({ x: 3200, z: 10200 });
    expect(ACT3_ARRIVAL.spine).toEqual({ x: 13600, z: 11850 });
    expect(needsDragonspine('m23', 'greyfen')).toBe(false);
    expect(needsDragonspine('d05', 'greyfen')).toBe(false);
    expect(needsDragonspine('m23', 'spine')).toBe(true);
    expect(needsDragonspine('m28', 'greyfen')).toBe(true);
  });
});

function harness(known: readonly string[] = []) {
  const flags = new Map<string, boolean>();
  const state = new Map<string, string>(known.map((id) => [id, 'inactive']));
  const log: string[] = [];
  const locks: string[] = [];
  const placed: { x: number; z: number }[] = [];
  const xp = { total: 9000, atLock: [] as number[] };
  const warn = vi.fn();
  const tutorial = { begun: true, complete: true, beat: null, restartInFlight: false, begin() {}, skipCurrent() {} };
  const ports: Act3JumpPorts = {
    tutorial: () => tutorial,
    quests: {
      state: (id) => state.get(id) ?? (log.includes(id) ? 'completed' : 'inactive'),
      start: (id) => (state.set(id, 'active'), true),
      complete: (id) => {
        log.push(id);
        state.set(id, 'completed');
        return true;
      },
    },
    runEffects: () => {},
    setFlag: (f) => void flags.set(f, true),
    rekindle: () => {},
    giveGold: () => {},
    chooseClass: () => true,
    teleportTo: () => true,
    standBy: () => true,
    ready: () => true,
    warn,
    hasQuest: (id) => state.has(id) || !/^(m2[3-9]|m3[0-4]|d0[56]|r1[2-8])$/.test(id),
    topUpXp: (t) => void (xp.total = Math.max(xp.total, t)),
    lockBlock: (b) => {
      xp.atLock.push(xp.total);
      locks.push(`${b}@${[...flags.keys()].filter((k) => k.startsWith('shrine.') && k.endsWith('.lit')).length}`);
    },
    placeAt: (at) => (placed.push(at), true),
  };
  return { ports, flags, log, locks, placed, warn, state, xp };
}

function run(id: string, order: Act3Order, known: readonly string[] = []) {
  const h = harness(known);
  const jump = new Act3Jump(id, order, h.ports);
  for (let i = 0; i < 50 && !jump.finished; i++) jump.tick();
  return { ...h, jump };
}

describe('Act3Jump', () => {
  it.each(ACT3_ORDERS.flatMap((o) => ACT3_JUMP_IDS.map((id) => [id, o] as const)))('%s (%s): reaches the arrival point', (id, order) => {
    const r = run(id, order);
    expect(r.jump.phase).toBe('done');
    expect(r.flags.get('story.gate.a3')).toBe(true);
    for (const q of ACT3_PREREQS[order][id]) expect(r.flags.get(`story.${q}.complete`), q).toBe(true);
    expect(r.flags.has(`story.${id}.complete`)).toBe(false);
    expect(r.placed).toEqual([ACT3_ARRIVAL[blockOf(id)!]]);
    expect(r.flags.has('story.phase.dragonspineOpen')).toBe(needsDragonspine(id, order));
    expect(r.warn).not.toHaveBeenCalled();
  });

  it('replays all of Act 1 and Act 2 through the quests service first, with both endings marked seen', () => {
    const r = run('m23', 'greyfen');
    expect(r.log).toEqual(expect.arrayContaining([...ACT1_PREREQS.d02, 'd02', ...ACT2_PREREQS.ending, 'm22']));
    expect(r.log.indexOf('m22')).toBeGreaterThan(r.log.indexOf('d02'));
    for (const f of ['codex.actEnding.a2.seen', 'story.a2.campSeen', 'story.gate.a2']) expect(r.flags.get(f), f).toBe(true);
  });

  it('Act 3 quests the service does not know are injected as flags only; known ones are completed through the service', () => {
    const r = run('m25', 'greyfen', ['m24']);
    expect(r.log).toContain('m24');
    expect(r.log).not.toContain('m23');
    expect(r.flags.get('story.m23.complete')).toBe(true);
    expect(r.state.get('m24')).toBe('completed');
  });

  it('locks each block when its lock quest is injected, after the earlier shrines; the target block is left to the accept', () => {
    expect(run('m23', 'greyfen').locks).toEqual([]);
    expect(run('m28', 'greyfen').locks).toEqual(['greyfen@0']);
    // The Greyfen locks after the Last Anvil (M30) is lit in the spine-first order.
    expect(run('m31', 'spine').locks).toEqual(['dragonspine-lower@0', 'greyfen@1']);
    expect(run('m34', 'greyfen').flags.get('shrine.hathrens-mere.lit')).toBe(true);
  });

  it('tops the XP up to the Act 3 start (level 17) before any block locks, and never lowers it', () => {
    const r = run('m31', 'greyfen');
    expect(r.xp.total).toBe(ACT3_START_XP);
    expect(r.xp.atLock).toEqual([ACT3_START_XP, ACT3_START_XP]);
    const h = harness();
    h.xp.total = 30_000;
    h.ports.topUpXp!(ACT3_START_XP);
    expect(h.xp.total).toBe(30_000);
  });

  it('waits for the saves and the tutorial before it starts', () => {
    const h = harness();
    let ready = false;
    h.ports.ready = () => ready;
    const jump = new Act3Jump('m23', 'greyfen', h.ports);
    jump.tick();
    expect(jump.phase).toBe('waiting');
    ready = true;
    for (let i = 0; i < 20 && !jump.finished; i++) jump.tick();
    expect(jump.phase).toBe('done');
  });
});
