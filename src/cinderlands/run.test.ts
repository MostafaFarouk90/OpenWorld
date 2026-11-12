import { describe, expect, it, vi } from 'vitest';
import { CinderMeta, masteryRank, masteryXpFor, runScore, BEST_TABLE_SIZE } from './meta';
import { RiftRun, RUN_FLAG, EARLY_SHARE, type RunPorts } from './run';
import type { RunSeed } from './seed';
import { WARDEN_SPAWNER } from './spawners';

function makePorts(over: Partial<RunPorts> = {}) {
  let next = 1;
  const flags = new Map<string, boolean>();
  const live = new Map<string, string>(); // actor -> group
  const calls = { saves: 0, suspended: 0, released: 0, terrain: [] as unknown[], home: [] as boolean[], xpPaused: 0, mods: [] as string[][], spawned: [] as string[] };
  let feet = { x: 0, y: 0, z: 0 };
  let t = 0;
  const ports: RunPorts = {
    playerLevel: () => 12,
    classId: () => 'knight',
    playerFeet: () => feet,
    groundAt: () => 5,
    setFlag: (k, on) => void flags.set(k, on),
    teleport: async (f) => {
      feet = { ...f };
      return { ok: true };
    },
    saveNow: async () => {
      calls.saves++;
    },
    suspendSaves: () => {
      calls.suspended++;
      return () => void calls.released++;
    },
    setRespawnHome: (on) => void calls.home.push(on),
    pauseKillXp: () => {
      calls.xpPaused++;
      return () => void calls.xpPaused--;
    },
    setTerrain: (p) => void calls.terrain.push(p),
    openSite: () => () => undefined,
    spawnGroup: (g, o) => {
      const out: string[] = [];
      for (let i = 0; i < o.count; i++) {
        const id = `a${next++}`;
        live.set(id, g);
        out.push(id);
      }
      calls.spawned.push(g);
      return out;
    },
    resetGroup: (g) => {
      for (const [a, gg] of live) if (gg === g) live.delete(a);
    },
    home: () => ({ feet: { x: 965, y: 0, z: -160 }, yaw: 0 }),
    applyModifiers: (m) => {
      calls.mods.push([...m]);
      return () => undefined;
    },
    healthBonus: () => () => undefined,
    damageBonus: () => () => undefined,
    toast: () => undefined,
    now: () => t,
    warn: () => undefined,
    ...over,
  };
  return {
    ports,
    flags,
    live,
    calls,
    moveTo: (x: number, z: number) => (feet = { x, y: 0, z }),
    advance: (ms: number) => (t += ms),
  };
}

const SEED: RunSeed = { classId: 'knight', biome: 'ashfield', hex: 0x1234, heat: 3 };

async function started(over: Partial<RunPorts> = {}, seed = SEED, fullMode = false) {
  const h = makePorts(over);
  const meta = new CinderMeta();
  const run = new RiftRun(h.ports, meta);
  expect(await run.start({ seed, fullMode })).toBe(true);
  return { ...h, meta, run };
}

function killAll(run: RiftRun, live: Map<string, string>, kind = 'ash-wraith') {
  for (const a of [...live.keys()]) if (run.isRunActor(a)) run.onActorDied(a, kind);
}

describe('rift run', () => {
  it('starts: saves at home, holds saves, raises the rift, pauses kill XP, lands on the entry', async () => {
    const { run, flags, calls, ports } = await started();
    expect(calls.saves).toBe(1);
    expect(calls.suspended).toBe(1);
    expect(calls.terrain[0]).toMatchObject({ biome: 'ashfield', radius: 1200 });
    expect(flags.get(RUN_FLAG)).toBe(true);
    expect(calls.home).toEqual([true]);
    expect(calls.xpPaused).toBe(1);
    expect(ports.playerFeet()).toMatchObject({ x: run.manifest!.entry.x, z: run.manifest!.entry.z });
    expect(run.active).toBe(true);
    expect(await run.start({ seed: SEED, fullMode: false })).toBe(false);
  });

  it('wakes a POI near the player, pays on clear, and sleeps POIs left behind', async () => {
    const { run, live, moveTo } = await started();
    const poi = run.manifest!.pois.find((p) => p.type === 'ruined-hamlet' || p.type === 'ember-camp')!;
    moveTo(poi.x, poi.z);
    run.tick(1 / 60);
    const lp = run.pois.get(poi.id)!;
    expect(lp.state).toBe('awake');
    expect(lp.actors.size).toBeGreaterThan(0);
    killAll(run, live);
    expect(lp.state).toBe('cleared');
    expect(run.embers).toBeGreaterThan(0);
    // Another POI: wake then walk away, it sleeps with its actors gone from the run.
    const other = run.manifest!.pois.find((p) => p !== poi && p.type !== 'warden' && p.type !== 'mystery-rift')!;
    moveTo(other.x, other.z);
    run.tick(1 / 60);
    expect(run.pois.get(other.id)!.state).toBe('awake');
    moveTo(other.x + 500, other.z);
    run.tick(1 / 60);
    expect(run.pois.get(other.id)!.state).toBe('asleep');
    expect(run.pois.get(other.id)!.actors.size).toBe(0);
  });

  it('quelling the Warden opens the exit and pays in full, raising the unlocked Heat', async () => {
    const { run, live, moveTo, calls, flags, meta } = await started({}, { ...SEED, heat: 1 });
    expect(run.exitOpen).toBe(false);
    const w = run.manifest!.pois.find((p) => p.type === 'warden')!;
    moveTo(w.x, w.z);
    run.tick(1 / 60);
    expect(calls.spawned).toContain(WARDEN_SPAWNER);
    killAll(run, live, 'blighted-soldier');
    expect(run.exitOpen).toBe(true);
    const total = run.embers;
    const s = await run.leave();
    expect(s?.outcome).toBe('quelled');
    expect(s!.kept).toBeGreaterThan(total); // the objective share is added
    expect(meta.data.embers).toBe(s!.kept);
    expect(s!.heatUnlocked).toBe(true);
    expect(meta.data.maxHeat).toBe(2);
    expect(flags.get(RUN_FLAG)).toBe(false);
    expect(calls.released).toBe(1);
    expect(calls.xpPaused).toBe(0);
    expect(calls.terrain.at(-1)).toBeNull();
    expect(meta.data.bests[0].code).toBe(s!.code);
  });

  it('leaving early keeps half and unlocks nothing', async () => {
    const { run, live, moveTo, meta } = await started();
    const poi = run.manifest!.pois.find((p) => p.type === 'ember-camp' || p.type === 'ruined-hamlet')!;
    moveTo(poi.x, poi.z);
    run.tick(1 / 60);
    killAll(run, live);
    const earned = run.embers;
    const s = await run.leave();
    expect(s?.outcome).toBe('left');
    expect(s!.kept).toBe(Math.floor(earned * EARLY_SHARE));
    expect(meta.data.maxHeat).toBe(1);
  });

  it('a death ends the run with half kept, but only once the respawn has landed', async () => {
    const { run, flags, calls } = await started();
    run.onActorDied('nobody', 'ash-wraith'); // not a run actor: nothing
    run.embers = 41;
    expect(run.onPlayerDied()).toBeNull();
    expect(flags.get(RUN_FLAG)).toBe(false); // the site lets go so the respawn can go home
    expect(calls.terrain.at(-1)).not.toBeNull(); // but the ground stays until it lands
    const s = run.onPlayerRespawned();
    expect(s?.outcome).toBe('died');
    expect(s!.kept).toBe(20);
    expect(flags.get(RUN_FLAG)).toBe(false);
    expect(calls.home).toEqual([true, false]);
    expect(run.onPlayerRespawned()).toBeNull();
  });

  it('a load abandons the run with nothing paid', async () => {
    const { run, meta, flags } = await started();
    run.embers = 99;
    run.abandon();
    expect(meta.data.embers).toBe(0);
    expect(flags.get(RUN_FLAG)).toBe(false);
    expect(run.phase).toBe('idle');
  });

  it('calls the run off when the entry never becomes solid', async () => {
    const h = makePorts({ teleport: async () => ({ ok: false }) });
    const run = new RiftRun(h.ports, new CinderMeta());
    expect(await run.start({ seed: SEED, fullMode: false })).toBe(false);
    expect(h.flags.get(RUN_FLAG)).toBe(false);
    expect(h.calls.released).toBe(1);
    expect(run.phase).toBe('idle');
  });

  it('mercy pays half a kill and counts toward the score', async () => {
    const { run, live, moveTo } = await started();
    const poi = run.manifest!.pois.find((p) => p.type === 'ruined-hamlet' || p.type === 'ember-camp')!;
    moveTo(poi.x, poi.z);
    run.tick(1 / 60);
    const [a, b] = [...live.keys()].filter(run.isRunActor);
    run.onActorDied(a, 'ash-wraith');
    const afterKill = run.embers;
    run.onMercy(b, 'ash-wraith');
    expect(run.mercies).toBe(1);
    expect(run.embers - afterKill).toBeLessThan(afterKill);
    run.onActorDied(b, 'ash-wraith'); // the mercied one leaving later pays nothing more
    expect(run.kills).toBe(1);
  });

  it('switches the Heat modifiers on and spawns stronger, bigger groups at high Heat', async () => {
    const spawnOpts: Array<{ count: number; healthScale: number; speedScale?: number }> = [];
    const h = makePorts();
    const orig = h.ports.spawnGroup;
    h.ports.spawnGroup = (g, o) => {
      spawnOpts.push(o);
      return orig(g, o);
    };
    const run = new RiftRun(h.ports, new CinderMeta());
    await run.start({ seed: { ...SEED, heat: 16 }, fullMode: true });
    expect(h.calls.mods[0]).toEqual(['burning', 'armoured', 'swift']);
    expect(h.calls.terrain[0]).toMatchObject({ radius: 2400 });
    const poi = run.manifest!.pois.find((p) => p.type === 'ember-camp')!;
    h.moveTo(poi.x, poi.z);
    run.tick(1 / 60);
    expect(spawnOpts[0].healthScale).toBeCloseTo(2.2);
    expect(spawnOpts[0].speedScale).toBe(1.2);
    // Two soldiers + three for Heat 16, split into groups of four.
    expect(spawnOpts[0].count + spawnOpts[1].count).toBe(2 + 3);
  });
});

describe('meta', () => {
  it('buys Hearth ranks with Embers and stops at the top rank', () => {
    const m = new CinderMeta();
    expect(m.buy('vigour')).toBe('poor');
    m.data.embers = 10_000;
    expect([m.buy('vigour'), m.buy('vigour'), m.buy('vigour'), m.buy('vigour')]).toEqual(['ok', 'ok', 'ok', 'max']);
    expect(m.data.embers).toBe(10_000 - 120 - 260 - 450);
  });
  it('earns Mastery only in the full mode', () => {
    const m = new CinderMeta();
    expect(m.bank(500, 'warden', false)).toBe(0);
    expect(m.data.mastery.warden).toBeUndefined();
    expect(m.bank(500, 'warden', true)).toBe(masteryRank(500));
    expect(masteryRank(masteryXpFor(20) + 1)).toBe(20);
    expect(masteryRank(NaN)).toBe(0);
  });
  it('keeps the top ten by score and survives a round trip and junk', () => {
    const m = new CinderMeta();
    for (let i = 0; i < 12; i++) m.record({ code: `C${i}`, classId: 'knight', heat: 1, score: i * 10, seconds: 1, at: i, outcome: 'left' });
    expect(m.data.bests.length).toBe(BEST_TABLE_SIZE);
    expect(m.data.bests[0].score).toBe(110);
    expect(m.record({ code: 'low', classId: 'knight', heat: 1, score: 0, seconds: 1, at: 99, outcome: 'left' })).toBe(0);
    const copy = new CinderMeta();
    copy.load(m.serialize());
    expect(copy.data).toEqual(m.data);
    copy.load({ embers: 'x', maxHeat: -4, bests: [{ code: 3 }, null], hearth: { vigour: 99 } });
    expect(copy.data).toMatchObject({ embers: 0, maxHeat: 1, bests: [], hearth: { vigour: 3 } });
    copy.load(null);
    expect(copy.data).toEqual(CinderMeta.empty());
  });
  it('scores by design 12.6, never below zero', () => {
    expect(runScore({ objective: true, embers: 200, secondsTaken: 600, parSeconds: 900, mercies: 12, deaths: 0, damageTaken: 500 })).toBe(1000 + 200 + 600 + 1000 - 50);
    expect(runScore({ objective: false, embers: 0, secondsTaken: 5000, parSeconds: 900, mercies: 0, deaths: 1, damageTaken: 9000 })).toBe(0);
  });
});

void vi;

import { BoardModel } from './board';
import { Containment } from '../region/containment';
import { SITE } from './domain';

describe('board', () => {
  it('caps Heat at 3 + W before the ending and re-signs the code when the Heat moves', () => {
    const m = new CinderMeta();
    m.data.maxHeat = 9;
    const b = new BoardModel(m, 'warden', 1, false, () => 0.5);
    expect(b.maxHeat).toBe(4);
    expect(b.heat).toBe(4);
    expect(b.check(b.code).ok).toBe(true);
    b.setHeat(2);
    expect(b.heat).toBe(2);
    expect(b.check(b.code).ok).toBe(true);
    b.setHeat(99);
    expect(b.heat).toBe(4);
    expect(new BoardModel(m, 'warden', 1, true, () => 0.5).maxHeat).toBe(9);
  });
  it("takes a shared code from another class as the player's own class", () => {
    const m = new CinderMeta();
    const b = new BoardModel(m, 'warden', 3, false, () => 0.1);
    const other = new BoardModel(m, 'pathfinder', 3, false, () => 0.9);
    const r = b.check(other.code);
    expect(r.ok && r.seed.classId).toBe('warden');
    expect(b.check('nonsense').ok).toBe(false);
  });
});

describe('containment open area', () => {
  it('opens a circle outside the world only while its flag holds, keep-ins still applying', () => {
    const flags: Record<string, boolean> = {};
    const c = new Containment({ getFlag: (k) => flags[k] });
    const undo = c.addOpenArea({ id: 'cinder.site', circle: { x: SITE.x, z: SITE.z, r: 1200 }, openWhen: { all: ['f'] } });
    expect(c.isOpen(SITE.x, SITE.z)).toBe(false);
    flags.f = true;
    expect(c.isOpen(SITE.x, SITE.z)).toBe(true);
    expect(c.isOpen(SITE.x + 1300, SITE.z)).toBe(false);
    c.addKeepIn({ id: 'k', circle: { x: SITE.x, z: SITE.z, r: 500 }, liveWhen: { all: ['f'] }, toastKey: 'x' });
    expect(c.isOpen(SITE.x + 800, SITE.z)).toBe(false);
    expect(() => c.addOpenArea({ id: 'cinder.site', circle: { x: 0, z: 0, r: 1 }, openWhen: {} })).toThrow();
    undo();
    expect(c.isOpen(SITE.x, SITE.z)).toBe(false);
  });
});

describe('rift run, review fixes', () => {
  it('a POI left and woken again brings back only the members not yet paid for', async () => {
    const { run, live, moveTo } = await started();
    const poi = run.manifest!.pois.find((p) => p.type === 'ember-camp')!;
    moveTo(poi.x, poi.z);
    run.tick(1 / 60);
    const lp = run.pois.get(poi.id)!;
    const first = lp.actors.size;
    const [a, b] = [...lp.actors];
    run.onActorDied(a, 'blighted-soldier');
    run.onActorDied(b, 'blighted-soldier');
    moveTo(poi.x + 600, poi.z);
    run.tick(1 / 60);
    moveTo(poi.x, poi.z);
    run.tick(1 / 60);
    expect(lp.actors.size).toBe(first - 2);
    const paid = run.embers;
    for (const x of [...live.keys()]) if (run.isRunActor(x)) run.onActorDied(x, 'ember-hound');
    expect(lp.state).toBe('cleared');
    // Leave and come back: a cleared POI never wakes again.
    moveTo(poi.x + 600, poi.z);
    run.tick(1 / 60);
    moveTo(poi.x, poi.z);
    run.tick(1 / 60);
    expect(lp.actors.size).toBe(0);
    expect(run.embers).toBeGreaterThan(paid);
  });

  it('a death on the way home ends the run as a death, not a full payout', async () => {
    let release: (v: { ok: boolean }) => void = () => undefined;
    const { run, flags, ports } = await started();
    ports.teleport = () => new Promise((r) => (release = r));
    run.wardenDown = true;
    run.embers = 40;
    const leaving = run.leave();
    expect(flags.get(RUN_FLAG)).toBe(false);
    expect(flags.get('cinder.run.inside')).toBe(true); // no pouch while still in the rift
    run.onPlayerDied();
    release({ ok: true });
    expect(await leaving).toBeNull();
    const s = run.onPlayerRespawned();
    expect(s?.outcome).toBe('died');
    expect(s!.kept).toBe(20);
    expect(flags.get('cinder.run.inside')).toBe(false);
  });

  it('a way home that is not ready keeps the run going', async () => {
    const { run, flags, ports } = await started();
    ports.teleport = async () => ({ ok: false });
    expect(await run.leave()).toBeNull();
    expect(run.active).toBe(true);
    expect(flags.get(RUN_FLAG)).toBe(true);
  });

  it('a load during the start stops it cold: no hold, no ground, no flag', async () => {
    let release: () => void = () => undefined;
    const h = makePorts({ saveNow: () => new Promise<void>((r) => (release = r)) });
    const run = new RiftRun(h.ports, new CinderMeta());
    const p = run.start({ seed: SEED, fullMode: false });
    run.abandon();
    release();
    expect(await p).toBe(false);
    expect(h.calls.suspended).toBe(0);
    expect(h.calls.terrain.every((t) => t === null)).toBe(true);
    expect(run.phase).toBe('idle');
    h.ports.saveNow = async () => undefined;
    expect(await run.start({ seed: SEED, fullMode: false })).toBe(true);
  });

  it('a port that throws while starting tears everything down', async () => {
    const h = makePorts({
      openSite: () => {
        throw new Error('duplicate');
      },
    });
    const run = new RiftRun(h.ports, new CinderMeta());
    expect(await run.start({ seed: SEED, fullMode: false })).toBe(false);
    expect(run.phase).toBe('idle');
    expect(h.calls.released).toBe(1);
    expect(h.calls.terrain.at(-1)).toBeNull();
  });

  it('a failed entry brings the player home before the ground goes', async () => {
    const trips: Array<{ x: number }> = [];
    const h = makePorts({
      teleport: async (f) => {
        trips.push(f);
        return { ok: trips.length > 1 };
      },
    });
    const run = new RiftRun(h.ports, new CinderMeta());
    expect(await run.start({ seed: SEED, fullMode: false })).toBe(false);
    expect(trips.length).toBe(2);
    expect(trips[1].x).toBe(965);
  });

  it('saves once more after a run is banked', async () => {
    const { run, calls } = await started();
    const before = calls.saves;
    await run.leave();
    expect(calls.saves).toBe(before + 1);
  });
});
