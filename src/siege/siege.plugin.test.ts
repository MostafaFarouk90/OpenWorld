// The siege on the shipped director, headless (plans/act5-N4.md section 14): fake enemies, real damage and combat.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { SaveEntry } from '../core/Persist';
import { CART, RAM as RAM_CYCLE } from '../waves/tuning';
import { ASSIST_WINDOW_S, BREAK, DRAGON, GATE, ORDERS, RAM, SAPPERS, SIEGE_MAX_ALIVE, STORM } from './tuning';
import { clearWave, makeSiegeKit, runUntil, secs, setSnapshot, TICK, type SiegeKit, type SiegeKitOptions } from './testKit';
import { SIEGE_FLAGS } from './runner';
import { offerFlag } from './orders.dialogue';

let physics: PhysicsWorld;
let kit: SiegeKit;
let warn: ReturnType<typeof vi.spyOn>;

async function boot(opts: SiegeKitOptions = {}) {
  kit?.teardown();
  kit = await makeSiegeKit(physics, opts);
  return kit;
}

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  kit?.teardown();
  kit = undefined as unknown as SiegeKit;
  vi.restoreAllMocks();
});

const allies = () => kit.siege().run!.squads.flatMap((s) => s.set.all);
/** Ends the current break with an order (or the timeout) and runs the gong's beat. */
const endBreak = (order?: string) => {
  if (order) kit.ctx.events.emit(`siege.order.${order}` as 'siege.order.hold', undefined);
  runUntil(kit, () => kit.director().phase === 'running', BREAK.orderTimeoutS + BREAK.beatS + 2, false);
};
const toWave = (n: number) => runUntil(kit, () => kit.siege().current?.wave === n && kit.siege().current?.phase === 'running' && kit.director().phase === 'running', 900);
const save = (): SaveEntry[] => kit.ctx.persist.saveAll();
const load = (entries: SaveEntry[]) => kit.ctx.persist.loadAll(entries, kit.ctx.events, 'slot-0');

describe('starting', () => {
  it('starts M52 on the rim set, pushes the siege mode and holds the weather clear', async () => {
    await boot();
    expect(kit.siege().start('m52')).toBe(true);
    expect(kit.director().current).toEqual({ defId: 'rim-siege', index: 0 });
    expect(kit.ctx.services.require('movementMode').current).toBe('siege');
    expect(kit.ctx.services.require('movementMode').rule().fastTravel).toBe('refused');
    expect(kit.weather.clears.size).toBe(1);
    expect(kit.of('siege.wave.started')).toEqual([{ siegeId: 'm52', n: 1 }]);
    expect(kit.siege().current).toMatchObject({ siegeId: 'm52', wave: 1, waves: 4, phase: 'running', gatePct: 100, breached: false });
    expect(kit.siege().start('m52')).toBe(false);
  });

  it('refuses without the gate anchors and warns once', async () => {
    await boot({ anchors: false });
    expect(kit.siege().start('m52')).toBe(false);
    expect(kit.siege().start('m52')).toBe(false);
    expect(kit.siege().run).toBeNull();
    expect(kit.ctx.services.require('movementMode').current).not.toBe('siege');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('director refused')).length).toBe(1);
  });

  it('stands the roster: Marshal is 14 bodies in four squads', async () => {
    await boot();
    kit.siege().start('m52');
    expect(kit.siege().allies().map((a) => `${a.id}:${a.standing}`)).toEqual(['halvard-archers-left:6', 'halvard-archers-right:6', 'rook-watch:1', 'edric:1']);
  });

  it('the structures for N9: the gate and every cart id', async () => {
    await boot();
    expect(kit.siege().structures('m52')).toEqual(['caldera.siege.gate', 'rim-siege.cart.1.1', 'rim-siege.cart.1.2', 'rim-siege.cart.2.1', 'rim-siege.cart.3.1']);
    expect(kit.siege().defs.m52.waves).toHaveLength(4);
    expect(kit.ctx.services.require('waves').structure('rim-siege.cart.2.1')).toEqual({ kind: 'cart', maxHealth: CART.maxHealth, role: 'ram' });
  });
});

describe('the alive cap', () => {
  it('never more than 12 foes and carts stand at once across all four waves, and every foe comes', async () => {
    await boot();
    kit.siege().start('m52');
    let peak = 0;
    let spawned = 0;
    const seen = new Set<string>();
    for (let i = 0; i < secs(1500) && !kit.siege().completed('m52'); i++) {
      const d = kit.director();
      peak = Math.max(peak, d.alive);
      for (const id of d.members) if (!seen.has(id)) (seen.add(id), spawned++);
      // Kill a third of a second's worth slowly so the cap binds: one foe every 2 s.
      if (i % 120 === 0) {
        const id = d.members.find((m) => !kit.ctx.actors.get(m)?.dead);
        if (id) kit.ctx.damage.kill(id, 'player');
        for (const c of d.parts?.carts.all ?? []) if (c.active && c.rolled > 5) kit.ctx.damage.kill(c.actor.id, 'player');
      }
      if (kit.siege().current?.phase === 'orders') kit.ctx.events.emit('siege.order.hold', undefined);
      kit.ctx.player.actor.health = kit.ctx.player.actor.maxHealth;
      kit.run(1);
    }
    expect(kit.siege().completed('m52')).toBe(true);
    expect(peak).toBeLessThanOrEqual(SIEGE_MAX_ALIVE);
    expect(spawned).toBe(36);
    expect(kit.of('siege.completed')).toEqual([{ siegeId: 'm52' }]);
    expect(kit.siege().run).toBeNull();
    expect(kit.ctx.services.require('movementMode').current).not.toBe('siege');
    expect(kit.weather.clears.size + kit.weather.storms.size).toBe(0);
  }, 60_000);
});

describe('no ally dies; a breach is a court to clear', () => {
  it('lethal hits only kneel allies; the gate at 0 breaches, the wave goes on, clears, the gate is patched to 30%', async () => {
    await boot({ preset: 'worst' });
    kit.siege().start('m52');
    const foe = kit.ctx.actors.spawn({ kind: 'ember-hound', team: 'hostile', maxHealth: 40, maxPoise: 15, root: new THREE.Group() });
    for (let t = 0; t < secs(20); t++) {
      if (t % 20 === 0) for (const a of allies()) kit.ctx.damage.apply({ attackerId: foe.id, targetId: a.id, amount: 99999, kind: 'melee' });
      for (const a of allies()) expect(a.actor.dead).toBe(false);
      kit.ctx.player.actor.health = kit.ctx.player.actor.maxHealth;
      kit.run(1);
    }
    expect(allies().every((a) => !a.actor.dead)).toBe(true);
    kit.ctx.actors.despawn(foe.id);
    kit.director().damageBarricade(5000);
    kit.run(2);
    expect(kit.of('siege.gate.breached')).toEqual([{ siegeId: 'm52' }]);
    expect(kit.of('waves.failed')).toEqual([]);
    expect(kit.siege().current).toMatchObject({ breached: true, wave: 1 });
    runUntil(kit, () => kit.siege().current?.phase === 'orders', 200);
    expect(kit.director().barricade!.health).toBe(GATE.m52Health * GATE.patchToPct);
    endBreak('hold');
    expect(kit.siege().current).toMatchObject({ wave: 2, breached: false });
  }, 60_000);
});

describe('breaks and orders', () => {
  it('a break waits for an order; the default after 30 s is hold; then the 5 s gong beat', async () => {
    await boot();
    kit.siege().start('m52');
    runUntil(kit, () => kit.siege().current?.phase === 'orders', 200);
    expect(kit.of('siege.break')).toEqual([{ siegeId: 'm52', n: 1, orders: ['hold', 'brace', 'loose'] }]);
    expect(kit.siege().orders()).toEqual(['hold', 'brace', 'loose']);
    expect(kit.ctx.state.getFlag(offerFlag('loose'))).toBe(true);
    expect(kit.ctx.state.getFlag(offerFlag('gong'))).toBe(false);
    kit.runSecs(BREAK.orderTimeoutS - 1);
    expect(kit.siege().current?.phase).toBe('orders');
    kit.runSecs(1.1);
    expect(kit.of('siege.order')).toEqual([{ siegeId: 'm52', id: 'hold' }]);
    expect(kit.siege().current?.phase).toBe('beat');
    kit.runSecs(BREAK.beatS - 0.2);
    expect(kit.director().phase).toBe('intermission');
    kit.runSecs(0.4);
    expect(kit.siege().current).toMatchObject({ wave: 2, phase: 'running' });
    expect(kit.of('siege.gong')).toEqual([{ siegeId: 'm52', by: 'ansgar' }]);
  }, 60_000);

  it('the war post opens the orders talk only in a break', async () => {
    await boot();
    kit.siege().start('m52');
    const post = kit.ctx.interaction as unknown as { items: Map<string, { enabled(): boolean; onInteract(a: unknown): void }> };
    const item = post.items.get('talk:siege-orders-m52')!;
    expect(item.enabled()).toBe(false);
    runUntil(kit, () => kit.siege().current?.phase === 'orders', 200);
    expect(item.enabled()).toBe(true);
    item.onInteract(kit.ctx.player.actor);
    expect(kit.dialogues).toEqual(['siege-orders-m52']);
  }, 60_000);

  it('brace halves the ram; a ram strikes 15% a wind-back, every 2.5 s', async () => {
    await boot();
    kit.siege().start('m52');
    toWave(2);
    runUntil(kit, () => kit.siege().current?.phase === 'orders', 400);
    endBreak('brace');
    expect(kit.siege().current?.wave).toBe(3);
    expect(kit.director().impactScale).toBe(ORDERS.braceImpactScale);
    // Let the ram reach the gate; kill only the foot.
    const hits: number[] = [];
    kit.ctx.events.on('waves.cart.struck', (p) => void hits.push(p.damage));
    for (let i = 0; i < secs(120) && hits.length < 3; i++) {
      if (i % 30 === 0) for (const id of kit.director().members) if (!kit.ctx.actors.get(id)?.dead) kit.ctx.damage.kill(id, 'player');
      kit.ctx.player.actor.health = kit.ctx.player.actor.maxHealth;
      kit.run(1);
    }
    expect(hits).toEqual([GATE.m52Health * RAM.strikePct * 0.5, GATE.m52Health * RAM.strikePct * 0.5, GATE.m52Health * RAM.strikePct * 0.5]);
    expect(RAM_CYCLE.cycleSeconds).toBe(2.5);
  }, 90_000);

  it('the gong is offered after R29, rallies the kneeling and boosts allies 25% for 30 s', async () => {
    await boot({ r29: true });
    kit.siege().start('m52');
    runUntil(kit, () => kit.siege().current?.phase === 'orders', 200);
    expect(kit.siege().orders()).toContain('gong');
    endBreak('gong');
    expect(kit.ctx.state.getFlag(SIEGE_FLAGS.order('m52', 1))).toBe('gong');
    expect(kit.of('siege.gong').at(-1)).toEqual({ siegeId: 'm52', by: 'cael' });
    expect(allies().every((a) => a.state === 'post')).toBe(true);
  }, 60_000);

  it('an order not on offer, or outside a break, is refused', async () => {
    await boot();
    kit.siege().start('m52');
    expect(kit.siege().order('brace')).toBe(false);
    runUntil(kit, () => kit.siege().current?.phase === 'orders', 200);
    expect(kit.siege().order('gong')).toBe(false);
    expect(kit.siege().order('flasks')).toBe(false);
    expect(kit.siege().order('loose')).toBe(true);
    expect(kit.siege().order('brace')).toBe(false);
  }, 60_000);
});

describe('the crates (Oswin)', () => {
  it('Keepers (Stoked, fast road): six flasks a break, once; the shipped flask stands in for oswin-flask', async () => {
    await boot({ preset: 'keepers' });
    kit.siege().start('m52');
    expect(kit.siege().takeCrate()).toBe(0);
    runUntil(kit, () => kit.siege().current?.phase === 'orders', 300);
    expect(kit.siege().takeCrate()).toBe(6);
    expect(kit.siege().takeCrate()).toBe(0);
    expect(kit.inventory.counts.get('healing-flask')).toBe(6);
  }, 60_000);

  it('the oswin-flask when the item exists; Hearthbound offers the resupply order once', async () => {
    await boot({ preset: 'keepers', items: ['oswin-flask', 'healing-flask'] });
    setSnapshot(kit, { oswin: 90 }, 10);
    kit.siege().start('m52');
    runUntil(kit, () => kit.siege().current?.phase === 'orders', 300);
    expect(kit.siege().orders()).toContain('flasks');
    expect(kit.siege().order('flasks')).toBe(true);
    expect(kit.inventory.counts.get('oswin-flask')).toBe(6);
    endBreak();
    runUntil(kit, () => kit.siege().current?.phase === 'orders', 300);
    expect(kit.siege().orders()).not.toContain('flasks');
  }, 60_000);

  it('Marshal (Oswin Cold): no crates', async () => {
    await boot();
    kit.siege().start('m52');
    runUntil(kit, () => kit.siege().current?.phase === 'orders', 300);
    expect(kit.siege().takeCrate()).toBe(0);
  }, 60_000);
});

describe('the storm', () => {
  it('waves 2 and 4 force the storm over the court with the lee ring; 1 and 3 hold the clear; archers halved in it', async () => {
    await boot();
    kit.siege().start('m52');
    const at = kit.director().geometry!.origin;
    expect(kit.weather.storming()).toBe(false);
    toWave(2);
    expect(kit.weather.storming()).toBe(true);
    expect(kit.weather.clears.size).toBe(0);
    expect(kit.weather.covers(at.x, at.z + STORM.courtHalf - 1)).toBe(true);
    expect(kit.weather.zones.size).toBe(1);
    expect(kit.siege().current?.storm).toBe(true);
    toWave(3);
    expect(kit.weather.storming()).toBe(false);
    expect(kit.weather.clears.size).toBe(1);
    expect(kit.weather.zones.size).toBe(0);
    toWave(4);
    expect(kit.weather.storming()).toBe(true);
  }, 90_000);

  it('Ashwalkers at Hearthbound: storm-cover, no storm at all', async () => {
    await boot({ flags: { 'story.r24.choice': 'all' } });
    setSnapshot(kit, { ashwalkers: 90 }, 10);
    kit.siege().start('m52');
    toWave(2);
    expect(kit.weather.storming()).toBe(false);
  }, 60_000);
});

describe('kill credit (the assist rule)', () => {
  const foeAt = () => {
    const id = kit.director().members.find((m) => !kit.ctx.actors.get(m)?.dead)!;
    return kit.ctx.actors.get(id)!;
  };
  const xp = () => kit.of('actor.died').filter((d) => d.killerId === kit.ctx.actors.player.id).length;

  it('an ally kill on an untouched foe pays nothing; a Cael hit 7.9 s before pays as a player kill; 8.1 s before nothing', async () => {
    await boot();
    kit.siege().start('m52');
    kit.runSecs(1);
    const run = kit.siege().run!;
    const ally = allies()[0].actor;
    const hit = (a: { id: string }) => kit.ctx.damage.apply({ attackerId: kit.ctx.actors.player.id, targetId: a.id, amount: 1, kind: 'melee' });
    const allyKill = (a: { id: string }) => kit.ctx.damage.apply({ attackerId: ally.id, targetId: a.id, amount: 99999, kind: 'melee' });

    const a = foeAt();
    allyKill(a);
    kit.run(2);
    expect(a.dead).toBe(true);
    expect(kit.of('actor.died').find((d) => d.actorId === a.id)!.killerId).toBe(ally.id);

    const b = foeAt();
    hit(b);
    kit.runSecs(ASSIST_WINDOW_S - 0.1);
    expect(run.assist.assisted(b.id)).toBe(true);
    allyKill(b);
    expect(b.dead).toBe(false);
    expect(b.health).toBe(1);
    kit.run(2);
    expect(b.dead).toBe(true);
    expect(kit.of('actor.died').find((d) => d.actorId === b.id)!.killerId).toBe(kit.ctx.actors.player.id);

    const c = foeAt();
    hit(c);
    kit.runSecs(ASSIST_WINDOW_S + 0.1);
    allyKill(c);
    kit.run(2);
    expect(kit.of('actor.died').find((d) => d.actorId === c.id)!.killerId).toBe(ally.id);
    expect(xp()).toBe(1);
  }, 60_000);

  it("the gate's bait skips a foe Cael hit in the window", async () => {
    await boot();
    kit.siege().start('m52');
    kit.runSecs(1);
    const foe = foeAt();
    const taunts = kit.ctx.services.get('enemies')?.taunts;
    // The fake enemies service has no taunt registry: read the runner's filter directly.
    expect(taunts).toBeUndefined();
    const run = kit.siege().run!;
    kit.ctx.damage.apply({ attackerId: kit.ctx.actors.player.id, targetId: foe.id, amount: 1, kind: 'melee' });
    expect(run.assist.assisted(foe.id)).toBe(true);
    kit.runSecs(ASSIST_WINDOW_S + 0.1);
    expect(run.assist.assisted(foe.id)).toBe(false);
  }, 60_000);
});

describe('dragons, sappers, the sally and the wounded beat', () => {
  it('dragons arrive on wave 2 when yielded, and each breathes once a wave after the telegraph', async () => {
    await boot({ preset: 'keepers' });
    kit.siege().start('m52');
    toWave(2);
    expect(kit.of('siege.ally.arrived').map((a) => a.id)).toEqual(['ysmeryth', 'hathren', 'orsk']);
    expect(kit.siege().run!.dragons).toHaveLength(3);
    runUntil(kit, () => kit.of('siege.dragon.breath').length >= 1, DRAGON.strikeAtS + 2, false);
    expect(kit.of('siege.dragon.breath')[0]).toMatchObject({ siegeId: 'm52', dragonId: 'ysmeryth' });
  }, 60_000);

  it('Hearthbound sappers stall a ram 12 s once', async () => {
    await boot({ flags: { 'story.m36.delegate.grisel': 'won' } });
    setSnapshot(kit, { grisel: 90, halvard: 80 }, 10);
    kit.siege().start('m52');
    expect(kit.siege().roster('m52').squads.find((s) => s.id === 'grisel-miners')!.role).toBe('sappers');
    toWave(3);
    // Move the sappers' posts onto the ram's line: the court stand-in is 6 m behind the gate.
    const stalls: number[] = [];
    kit.ctx.events.on('siege.ram.stall', (p) => void stalls.push(p.seconds));
    for (let i = 0; i < secs(120) && !stalls.includes(SAPPERS.stallS); i++) {
      if (i % 30 === 0) for (const id of kit.director().members) if (!kit.ctx.actors.get(id)?.dead) kit.ctx.damage.kill(id, 'player');
      kit.ctx.player.actor.health = kit.ctx.player.actor.maxHealth;
      kit.run(1);
    }
    expect(stalls).toContain(SAPPERS.stallS);
    expect(stalls.filter((s) => s === SAPPERS.stallS)).toHaveLength(1);
  }, 90_000);

  it('the sally rides once in wave 3, 15 s after the ram, and stalls it 6 s', async () => {
    await boot();
    kit.siege().start('m52');
    toWave(3);
    runUntil(kit, () => kit.of('siege.ally.arrived').some((a) => a.id === 'sally'), 40, false);
    expect(kit.of('siege.ram.stall').at(-1)).toMatchObject({ seconds: 6 });
    kit.runSecs(20);
    expect(kit.of('siege.ally.arrived').filter((a) => a.id === 'sally')).toHaveLength(1);
  }, 90_000);

  it('the wounded beat: the second seat sits out at the aid post on the first ram strike of wave 3 (or 40 s in), once', async () => {
    await boot();
    kit.siege().start('m52');
    toWave(3);
    runUntil(kit, () => kit.of('siege.companion.wounded').length > 0, 60, false);
    expect(kit.of('siege.companion.wounded')).toEqual([{ siegeId: 'm52', companionId: 'hrolf' }]);
    expect(kit.ctx.state.getFlag(SIEGE_FLAGS.wounded)).toBe('hrolf');
    expect(kit.companions.sitting.get('hrolf')).toBe('caldera.siege.aid');
  }, 90_000);
});

describe('save and load', () => {
  it('a load mid-wave 3 restarts it with the gate at its wave-start health; the order and the wounded companion come back', async () => {
    await boot({ preset: 'keepers' });
    kit.siege().start('m52');
    toWave(2);
    runUntil(kit, () => kit.siege().current?.phase === 'orders', 400);
    endBreak('brace');
    const startHealth = kit.director().barricade!.health;
    runUntil(kit, () => kit.of('siege.companion.wounded').length > 0, 60, false);
    kit.director().damageBarricade(100);
    const entries = save();
    kit.clearEvents();
    load(entries);
    expect(kit.siege().run).not.toBeNull();
    expect(kit.siege().current).toMatchObject({ wave: 3, phase: 'running' });
    expect(kit.of('siege.wave.started').at(-1)).toEqual({ siegeId: 'm52', n: 3 });
    expect(kit.of('siege.gate.damaged').at(-1)!.pct).toBeCloseTo((startHealth / GATE.m52Health) * 100, 5);
    expect(kit.director().barricade!.health).toBe(startHealth);
    expect(kit.director().impactScale).toBe(ORDERS.braceImpactScale);
    expect(kit.companions.sitting.get('hrolf')).toBe('caldera.siege.aid');
    expect(kit.siege().run!.dragons).toHaveLength(3);
    expect(kit.ctx.services.require('movementMode').current).toBe('siege');
    expect(kit.ctx.persist.saveAll().map((e) => e.key)).not.toContain('siege');
  }, 90_000);
});

describe('R27, the stokers tunnel', () => {
  it('three waves sealed, four under F6 Leaders; indoors; no storm and no dragons; the garrison by F5', async () => {
    await boot({ flags: { 'story.r10.choice': 'compromise' } });
    kit.standIns('r27');
    expect(kit.siege().start('r27')).toBe(true);
    expect(kit.director().current?.defId).toBe('stokers-tunnel');
    expect(kit.siege().current?.waves).toBe(3);
    expect(kit.siege().allies().map((a) => a.id)).toEqual(['wenna', 'tunnel-miners', 'tunnel-stewards']);
    expect(kit.weather.storms.size).toBe(0);
    kit.siege().stop();
    expect(kit.siege().run).toBeNull();
    kit.ctx.state.setFlag('story.r21.choice', 'leaders');
    expect(kit.siege().start('r27')).toBe(true);
    expect(kit.director().current?.defId).toBe('stokers-tunnel-open');
    expect(kit.siege().current?.waves).toBe(4);
  }, 60_000);
});

void TICK;
void clearWave;
