// N4 (Act 5): the director's opt-in siege knobs (maxAlive, breach, cartImpact, the repeating ram) on the rim set, and
// the shipped sets untouched by them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { RIM_SIEGE, RIM_SIEGE_ANCHORS } from './defs/act5';
import { CINDERFORD_RAID } from './defs/cinderford';
import { WAVE_SETS } from './defs';
import { spawnerId, spawnersFor, WAVE_SPAWNERS } from './spawners';
import { CART, RAM } from './tuning';
import { makeKit, secs, type Kit } from './testKit';

let physics: PhysicsWorld;
let kit: Kit;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  kit = await makeKit(physics);
  const put = (id: string, x: number, z: number) => kit.ctx.anchors.define({ id, position: { x: kit.at.x + x, y: kit.y, z: kit.at.z + z }, yaw: 0 });
  RIM_SIEGE_ANCHORS.gate.forEach((id, i) => put(id, (i - 1.5) * 5, -14));
  Object.values(RIM_SIEGE_ANCHORS.lanes).forEach((id, i) => put(id, -24 + i * 12, -62));
});
afterEach(() => {
  kit.teardown();
  vi.restoreAllMocks();
});

const ID = RIM_SIEGE.id;
const killFoes = () => {
  for (const id of kit.director().members) if (!kit.ctx.actors.get(id)?.dead) kit.ctx.damage.kill(id, 'player');
};
const toWave = (index: number) => {
  for (let i = 0; i < secs(900); i++) {
    const d = kit.director();
    if (d.current?.index === index && d.phase === 'running') return;
    if (d.phase === 'intermission') d.advance();
    if (i % 30 === 0) {
      killFoes();
      for (const c of d.parts?.carts.all ?? []) if (c.active) kit.ctx.damage.kill(c.actor.id, 'player');
    }
    kit.ctx.player.actor.health = kit.ctx.player.actor.maxHealth;
    kit.run(1);
  }
  throw new Error('timeout');
};

describe('the shipped sets are untouched', () => {
  it('Cinderford has no cap, no breach and the shipped cart impact; its spawner ids keep their shape', () => {
    expect(CINDERFORD_RAID.maxAlive).toBeUndefined();
    expect(CINDERFORD_RAID.breach).toBeUndefined();
    expect(CINDERFORD_RAID.cartImpact).toBeUndefined();
    for (const sp of spawnersFor(CINDERFORD_RAID)) expect(sp.id).toMatch(/^waves\.cinderford-raid\.w\d\.l\w+\.[a-z-]+$/);
  });
  it('the role and the line ride in the spawner id and on the spawner (N5 reads line ?? tag)', () => {
    const w0 = spawnersFor(RIM_SIEGE).filter((s) => s.id.startsWith('waves.rim-siege.w0.'));
    const id = spawnerId(ID, 0, '2', 'warhost-soldier', 'shield', 'm52.w1.a');
    expect(id).toBe('waves.rim-siege.w0.l2.warhost-soldier.rshield.nm52.w1.a');
    const sp = w0.find((s) => s.id === id)! as { line?: string; role?: string; count: number; tag: string };
    expect(sp).toMatchObject({ line: 'm52.w1.a', role: 'shield', count: 3, tag: 'm52.siege' });
    expect(WAVE_SPAWNERS.map((s) => s.id)).toContain(id);
  });
  it('the rim set: four waves, 36 foes, two brazier carts and two rams', () => {
    const def = WAVE_SETS[ID];
    expect(def.waves).toHaveLength(4);
    expect(def.waves.reduce((n, w) => n + w.spawns.reduce((m, s) => m + s.count, 0), 0)).toBe(36);
    expect(def.waves.flatMap((w) => w.carts.map((c) => c.role ?? 'brazier'))).toEqual(['brazier', 'brazier', 'ram', 'ram']);
  });
});

describe('maxAlive', () => {
  it('a due spawn waits for a slot: never more than the cap stand, and the rest step in as members fall', () => {
    const was = RIM_SIEGE.maxAlive;
    (RIM_SIEGE as { maxAlive?: number }).maxAlive = 3;
    try {
      kit.waves().start(ID);
      let peak = 0;
      let seen = new Set<string>();
      for (let i = 0; i < secs(120) && kit.director().current?.index === 0; i++) {
        peak = Math.max(peak, kit.director().alive);
        for (const id of kit.director().members) seen.add(id);
        if (i % 120 === 60) {
          const id = kit.director().members[0];
          if (id) kit.ctx.damage.kill(id, 'player');
        }
        kit.run(1);
      }
      expect(peak).toBe(3);
      expect(seen.size).toBe(10);
      seen = new Set();
    } finally {
      (RIM_SIEGE as { maxAlive?: number }).maxAlive = was;
    }
  });
});

describe('breach and the repeating ram', () => {
  it('the ram strikes for cartImpact.ram every cycle while the gate stands; at 0 the set breaches (no fail), the ram goes inert, the clear patches to 30%', () => {
    kit.waves().start(ID);
    toWave(2);
    const struck: number[] = [];
    kit.ctx.events.on('waves.cart.struck', (p) => void struck.push(p.damage));
    const ram = () => kit.director().parts!.carts.all.find((c) => c.role === 'ram')!;
    for (let i = 0; i < secs(120) && struck.length < 2; i++) {
      if (i % 30 === 0) killFoes();
      kit.run(1);
    }
    expect(struck).toEqual([RIM_SIEGE.cartImpact!.ram, RIM_SIEGE.cartImpact!.ram]);
    const r = ram();
    expect(r.strikes).toBe(2);
    expect(r.active).toBe(true);
    // The cycle: a strike every RAM.cycleSeconds.
    const t0 = struck.length;
    kit.runSecs(RAM.cycleSeconds + 0.05);
    expect(struck.length).toBe(t0 + 1);
    // A stall holds a ram in recoil too.
    r.stall(10);
    kit.runSecs(5);
    expect(struck.length).toBe(t0 + 1);
    kit.director().damageBarricade(5000);
    kit.run(2);
    expect(kit.of('waves.breached')).toEqual([{ defId: ID, index: 2 }]);
    expect(kit.of('waves.failed')).toEqual([]);
    expect(kit.director().breached).toBe(true);
    kit.runSecs(12);
    expect(r.active).toBe(false);
    for (let i = 0; i < secs(60) && kit.director().phase === 'running'; i++) {
      if (i % 30 === 0) killFoes();
      kit.run(1);
    }
    expect(kit.director().phase).toBe('intermission');
    expect(kit.director().barricade!.health).toBe(RIM_SIEGE.barricadeHealth * RIM_SIEGE.breach!.patchToPct);
    expect(CART.windupSeconds).toBe(1);
  });

  it('impactScale scales every strike and reads a bad value as 1', () => {
    const d = kit.director();
    d.impactScale = 0.5;
    expect(d.impactScale).toBe(0.5);
    d.impactScale = Number.NaN;
    expect(d.impactScale).toBe(1);
    d.impactScale = -1;
    expect(d.impactScale).toBe(1);
  });

  it('advance ends an intermission only; mend and damage need a standing barricade', () => {
    const d = kit.director();
    expect(d.advance()).toBe(false);
    expect(d.mendBarricade(10)).toBe(false);
    kit.waves().start(ID);
    expect(d.advance()).toBe(false);
    expect(d.damageBarricade(100)).toBe(true);
    expect(d.barricade!.health).toBe(900);
    expect(d.mendBarricade(5000)).toBe(true);
    expect(d.barricade!.health).toBe(1000);
  });
});
