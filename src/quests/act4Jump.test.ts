// v0.8 item 18: `?act4=` plumbing (no fixtures; L13 PR 1 owns them).
import { describe, expect, it, vi } from 'vitest';
import { devJumpBoot } from '../save/devJump';
import { tutorialFromQuery } from '../tutorial/tutorial.plugin';
import { act4Level, bandForRegion } from '../enemies/level';
import { levelForXp } from '../progression/tuning';
import { insideRingWall } from '../harrowmark/noStrand';
import { regionAt } from '../region/regionMask';
import { NPC_TUNING } from '../npcs/tuning';
import { getActJump } from './actJump';
import { act3Prereqs } from './act3Jump';
import {
  ACT4_DIRECT, ACT4_GIVER_STAND_OFF, ACT4_GIVERS, ACT4_JUMP_IDS, ACT4_PHASE_G, ACT4_PHASE_H, ACT4_PLACEHOLDER, ACT4_PREREQS, ACT4_START_XP,
  Act4Jump, act4Landing, type Act4JumpPorts, parseAct4, phaseOf, WASTE_OPEN_FLAG,
} from './act4Jump';
import { EXPECTED_REPLAY_WARNING, replayQuieter } from './act4Jump.plugin';

describe('parseAct4', () => {
  it('accepts every Act 4 quest with &new; refuses an unknown id or class and a missing &new', () => {
    for (const id of ACT4_JUMP_IDS) expect(parseAct4(`?act4=${id}&new`)).toEqual({ id, classId: 'knight', fresh: true });
    expect(parseAct4('?act4=m35&new&class=warden')).toMatchObject({ classId: 'warden' });
    expect(parseAct4('?act3=m23&new')).toBeNull();
    expect(parseAct4('?act4=m99&new')).toMatchObject({ error: expect.stringContaining('unknown quest') });
    expect(parseAct4('?act4=m35')).toMatchObject({ error: expect.stringContaining('&new') });
    expect(parseAct4('?act4=m35&new&class=bard')).toMatchObject({ error: expect.stringContaining('unknown class') });
  });
  it('a valid jump skips the start screen and holds saves; a refused one only holds saves', () => {
    expect(tutorialFromQuery('?act4=m35&new')).toEqual({ mode: 'kettlewick' });
    expect(tutorialFromQuery('?act4=m99&new')).toBeNull();
    expect(devJumpBoot('?act4=m42&new', true)).toBe('jump');
    expect(devJumpBoot('?act4=m99&new', true)).toBe('refused');
  });
});

describe('ACT4_PREREQS (plan 2.5)', () => {
  it('covers all 21 Act 4 quests; the registry holds the table', () => {
    expect(ACT4_JUMP_IDS).toHaveLength(21);
    expect(Object.keys(ACT4_PREREQS).sort()).toEqual([...ACT4_JUMP_IDS].sort());
    expect(getActJump(4)?.prereqs).toBe(ACT4_PREREQS);
    for (const id of ACT4_JUMP_IDS) expect(ACT4_GIVERS[id], id).toBeTruthy();
  });
  it('every quest comes after its direct prerequisites, with no repeats', () => {
    for (const id of ACT4_JUMP_IDS) {
      const list = ACT4_PREREQS[id];
      expect(new Set(list).size, id).toBe(list.length);
      expect(list).not.toContain(id);
      for (const d of ACT4_DIRECT[id]) expect(list, `${id} needs ${d}`).toContain(d);
      list.forEach((q, i) => {
        for (const d of ACT4_DIRECT[q]) expect(list.indexOf(d), `${id}: ${d} before ${q}`).toBeLessThan(i);
      });
    }
  });
  it('Q12: M37 waits on every Phase G quest before it; M46 on every Phase H quest and D08', () => {
    expect(ACT4_PREREQS.m35).toEqual([]);
    expect(ACT4_PREREQS.m37).toEqual(['m35', 'm36', 'r19', 'r20', 'r21', 'r22', 'r23', 'd07']);
    expect(ACT4_PREREQS.m42).toEqual([...ACT4_PHASE_G]);
    expect(ACT4_PREREQS.m46).toEqual([...ACT4_PHASE_G, ...ACT4_PHASE_H.filter((q) => q !== 'm46')]);
  });
});

describe('landing', () => {
  it('stands 1.8 m in front of a placed giver, facing them', () => {
    expect(ACT4_GIVER_STAND_OFF).toBeCloseTo(1.8, 6);
    const l = act4Landing('m35', { x: 100, y: 5, z: 200, yaw: 0 });
    expect(l.giver).toBe(true);
    expect(Math.hypot(l.at.x - 100, l.at.z - 200)).toBeCloseTo(1.8, 6);
    expect(Math.hypot(l.at.x - 100, l.at.z - 200)).toBeLessThanOrEqual(NPC_TUNING.talkRadius);
    expect(l.at.z).toBeLessThan(200); // yaw 0 faces -Z
    expect(l.yaw).toBeCloseTo(Math.PI, 6);
  });
  it('without a giver: Phase G on the South Gate road outside the ring wall, Phase H at Ashgate', () => {
    const g = act4Landing('m38', undefined);
    expect(g.giver).toBe(false);
    expect(regionAt(g.at.x, g.at.z)?.id).toBe('harrowmark');
    expect(insideRingWall(g.at.x, g.at.z)).toBe(false);
    expect(act4Landing('m46', undefined).at).toEqual(ACT4_PLACEHOLDER.H);
    expect(phaseOf('d07')).toBe('G');
    expect(phaseOf('d08')).toBe('H');
    expect(phaseOf('m34')).toBeUndefined();
  });
});

function harness() {
  const flags = new Map<string, unknown>();
  const done = new Set<string>();
  const order: string[] = [];
  const xp = { total: 5000 };
  const placed: { x: number; z: number }[] = [];
  const quiet: boolean[] = [];
  const tutorial = { begun: true, complete: true, beat: null, restartInFlight: false, begin() {}, skipCurrent() {} };
  let pose: { x: number; y: number; z: number; yaw: number } | undefined;
  const ports: Act4JumpPorts = {
    tutorial: () => tutorial,
    quests: {
      state: (id) => (done.has(id) ? 'completed' : 'inactive'),
      start: () => true,
      complete: (id) => (done.add(id), order.push(id), true),
    },
    runEffects: () => {},
    setFlag: (f, v) => {
      flags.set(f, v ?? true);
      order.push(`flag:${f}`);
    },
    rekindle: () => {},
    giveGold: () => {},
    chooseClass: () => true,
    teleportTo: () => true,
    standBy: () => true,
    ready: () => true,
    warn: vi.fn(),
    hasQuest: (id) => !/^(m3[5-9]|m4[0-6]|d0[78]|r19|r2[0-5])$/.test(id),
    topUpXp: (t) => void (xp.total = Math.max(xp.total, t)),
    placeAt: () => {
      throw new Error('the inner Act 3 placement must be skipped');
    },
    placePose: (at) => (placed.push({ x: at.x, z: at.z }), true),
    giverPose: () => pose,
    quiet: (on) => void quiet.push(on),
  };
  return { ports, flags, done, order, xp, placed, quiet, setPose: (p: typeof pose) => (pose = p) };
}

function run(id: string, h = harness()) {
  const jump = new Act4Jump(id, h.ports);
  for (let i = 0; i < 80 && !jump.finished; i++) jump.tick();
  return { ...h, jump };
}

describe('Act4Jump', () => {
  it.each(ACT4_JUMP_IDS)('%s: replays Acts 1 to 3, sets the gate, injects its prerequisites, tops XP up, lands', (id) => {
    const r = run(id);
    expect(r.jump.finished).toBe(true);
    // Act 3 entire, D06 last, with both Act 3 seen flags before D06.
    for (const q of [...act3Prereqs('d06', 'greyfen'), 'd06']) expect(r.flags.get(`story.${q}.complete`), q).toBe(true);
    expect(r.order.indexOf('flag:codex.actEnding.a3.seen')).toBeLessThan(r.order.indexOf('flag:story.d06.complete'));
    expect(r.order.indexOf('flag:story.a3.campSeen')).toBeLessThan(r.order.indexOf('flag:story.d06.complete'));
    expect(r.flags.get('story.gate.a4')).toBe(true);
    for (const q of ACT4_PREREQS[id]) expect(r.flags.get(`story.${q}.complete`), q).toBe(true);
    expect(r.flags.get(`story.${id}.complete`)).toBeUndefined();
    expect(r.flags.get(WASTE_OPEN_FLAG)).toBe(phaseOf(id) === 'H' ? true : undefined);
    expect(r.xp.total).toBeGreaterThanOrEqual(ACT4_START_XP);
    expect(r.placed).toEqual([ACT4_PLACEHOLDER[phaseOf(id)!]]);
    expect(r.quiet).toEqual([true, false]);
  });

  it('XP 64,000 is level 26 to 27 on the curve, and Harrowmark enemies then roll 28 to 33 capped at P+3', () => {
    const level = levelForXp(ACT4_START_XP);
    expect(level).toBeGreaterThanOrEqual(26);
    expect(level).toBeLessThanOrEqual(27);
    const band = bandForRegion('harrowmark', { getFlag: (k) => k === 'story.gate.a4' })!;
    expect(band).toEqual({ min: 28, max: 33 });
    for (const roll of [0, 0.5, 0.999]) {
      const l = act4Level(band, roll, level);
      expect(l).toBeLessThanOrEqual(level + 3);
      expect(l).toBeGreaterThanOrEqual(Math.min(band.min, level + 3));
    }
  });

  it('lands at a placed giver when its Act 4 post exists', () => {
    const h = harness();
    h.setPose({ x: 10000, y: 0, z: 4450, yaw: 0 });
    const r = run('m42', h);
    expect(Math.hypot(r.placed[0].x - 10000, r.placed[0].z - 4450)).toBeCloseTo(ACT4_GIVER_STAND_OFF, 6);
  });
});

describe('replay quieter (B9)', () => {
  it('counts the expected replay warnings and passes every other one through; restores console.warn', () => {
    const seen: unknown[] = [];
    const target = { warn: (...a: unknown[]) => void seen.push(a[0]) };
    const original = target.warn;
    const q = replayQuieter(target);
    q.set(true);
    target.warn('[act2] could not complete m11');
    target.warn('save: "autosave" request dropped, a load is in progress');
    target.warn('Music: something real');
    expect(q.set(false)).toBe(2);
    expect(seen).toEqual(['Music: something real']);
    expect(target.warn).toBe(original);
    expect(EXPECTED_REPLAY_WARNING.test('[act4] could not complete m35')).toBe(false);
  });
});
