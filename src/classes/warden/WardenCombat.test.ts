import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatusSpec } from '../../actors/status';
import { FakeActor, FakeActors, FakeEvents } from '../../spells/testHost';
import { WardenCombat, type WardenCombatPorts } from './WardenCombat';
import { CLEAVE_ATTACK_ID, DEEP_WOUND, SKILL_IDS, SURGE_AXE, WARDEN_CLIPS } from './tuning';

const SLICE = WARDEN_CLIPS.slice;

function rig() {
  const events = new FakeEvents();
  const player = new FakeActor('player', 'player', 0, 0, 100);
  const actors = new FakeActors(player);
  const learned = new Set<string>(Object.values(SKILL_IDS));
  const applied: any[] = [];
  const staggers: Array<{ id: string; by: string; poise: number }> = [];
  const statuses: Array<{ id: string; spec: StatusSpec }> = [];
  const restore = vi.fn();
  const triggers: string[] = [];
  const warn = vi.fn();
  const st = {
    now: 0,
    attack: null as { clip: string; swingId: number; active: boolean } | null,
    interrupted: false,
    status: true,
    spells: true,
    yaw: 0,
  };
  const ports: WardenCombatPorts = {
    events,
    actors,
    damage: {
      apply: (r) => void applied.push(r),
      stagger: (id, by, poise) => (staggers.push({ id, by, poise }), true),
    },
    now: () => st.now,
    feet: () => ({ x: 0, y: 0, z: 0 }),
    facingYaw: () => st.yaw,
    learned: (id) => learned.has(id),
    status: () => (st.status ? { apply: (id, spec) => (statuses.push({ id, spec }), true) } : undefined),
    spells: () => (st.spells ? { restoreEmber: restore } : {}),
    attack: () => st.attack,
    interrupted: () => st.interrupted,
    reportTrigger: (id) => void triggers.push(id),
    warn,
  };
  const combat = new WardenCombat(ports, () => 'player');
  const foe = (id: string, x: number, z: number, team: FakeActor['team'] = 'hostile') => actors.add(new FakeActor(id, team, x, z));
  /** The player looks along -z at yaw 0, so z < 0 is in front. */
  const dealt = (o: Record<string, unknown> = {}) =>
    events.emit('damage.dealt', {
      attackerId: 'player', targetId: 'a', kind: 'melee', outcome: 'hit', attackId: SLICE, swingId: 1,
      amount: 10, poise: 10, dealt: 10, healthAfter: 50, ...o,
    } as never);
  const hurt = (healthAfter: number, o: Record<string, unknown> = {}) => {
    player.health = healthAfter;
    dealt({ attackerId: 'x', targetId: 'player', attackId: 'claw', dealt: 10, healthAfter, ...o });
  };
  /** One full slice swing: active, then the window closes. */
  const swing = (id = 1) => {
    st.attack = { clip: SLICE, swingId: id, active: true };
    combat.tick();
    st.attack = { clip: SLICE, swingId: id, active: false };
    combat.tick();
  };
  return { events, player, actors, learned, applied, staggers, statuses, restore, triggers, warn, st, combat, foe, dealt, hurt, swing };
}

describe('Cleaving Swing', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => (r = rig()));

  it('hits every hostile in the front arc that the blade did not hit, once, with the weapon\'s base numbers', () => {
    r.foe('a', 0, -2);
    r.foe('b', 1, -2);
    r.foe('c', -1.5, -2.5);
    r.st.attack = { clip: SLICE, swingId: 1, active: true };
    r.combat.tick();
    r.dealt({ targetId: 'a', amount: 14, poise: 12 });
    r.swing();
    const extras = r.applied.filter((a) => a.attackId === CLEAVE_ATTACK_ID);
    expect(extras.map((a) => a.targetId).sort()).toEqual(['b', 'c']);
    for (const e of extras) {
      expect(e).toMatchObject({ attackerId: 'player', kind: 'melee', amount: 10, poise: 10, swingId: 1 });
      expect(e.direction).toBeInstanceOf(THREE.Vector3);
    }
    r.combat.tick();
    r.combat.tick();
    expect(r.applied.filter((a) => a.attackId === CLEAVE_ATTACK_ID)).toHaveLength(2);
  });

  it('a target on the blade path takes no cleave extra (no double hit through the per-swing dedupe)', () => {
    r.foe('a', 0, -2);
    r.st.attack = { clip: SLICE, swingId: 7, active: true };
    r.combat.tick();
    r.dealt({ targetId: 'a', swingId: 7 });
    r.st.attack = { clip: SLICE, swingId: 7, active: false };
    r.combat.tick();
    expect(r.applied).toEqual([]);
  });

  it('leaves out targets behind, to the side, out of range, dead, friendly and unhittable ones', () => {
    r.foe('behind', 0, 2);
    r.foe('side', 3, 0);
    r.foe('far', 0, -3.5);
    r.foe('ally', 0, -1, 'ally');
    r.foe('dead', 0, -1.5).kill();
    r.foe('ghost', 0, -1.2).hittable = false;
    r.foe('ok', 0, -1);
    r.swing();
    expect(r.applied.map((a) => a.targetId)).toEqual(['ok']);
  });

  it('follows the facing: turned around, the enemy behind the player is the one in front', () => {
    r.foe('north', 0, -2);
    r.foe('south', 0, 2);
    r.st.yaw = Math.PI;
    r.swing();
    expect(r.applied.map((a) => a.targetId)).toEqual(['south']);
  });

  it('a target that blocked, parried or was immune to the blade is not cleaved again', () => {
    r.foe('a', 0, -2);
    r.foe('b', 0.5, -2);
    r.st.attack = { clip: SLICE, swingId: 1, active: true };
    r.combat.tick();
    r.dealt({ targetId: 'a', outcome: 'blocked' });
    r.dealt({ targetId: 'b', outcome: 'immune' });
    r.swing();
    expect(r.applied).toEqual([]);
  });

  it('extras use the weapon base, not the blade\'s modified (bone, back-hit, scarecrow) numbers', () => {
    r.foe('a', 0, -2);
    r.foe('b', 0.5, -2);
    r.st.attack = { clip: SLICE, swingId: 1, active: true };
    r.combat.tick();
    r.dealt({ targetId: 'a', amount: 1, poise: 1 });
    r.swing();
    expect(r.applied[0]).toMatchObject({ targetId: 'b', amount: 10, poise: 10 });
  });

  it('does nothing when unlearned, for the other attacks, when interrupted, or when the window never opened', () => {
    r.foe('a', 0, -2);
    r.learned.delete(SKILL_IDS.cleavingSwing);
    r.swing();
    expect(r.applied).toEqual([]);

    r.learned.add(SKILL_IDS.cleavingSwing);
    for (const clip of [WARDEN_CLIPS.spinning, WARDEN_CLIPS.chop, WARDEN_CLIPS.stab]) {
      r.st.attack = { clip, swingId: 2, active: true };
      r.combat.tick();
      r.st.attack = null;
      r.combat.tick();
    }
    expect(r.applied).toEqual([]);

    r.st.attack = { clip: SLICE, swingId: 3, active: true };
    r.combat.tick();
    r.st.interrupted = true;
    r.st.attack = null;
    r.combat.tick();
    expect(r.applied).toEqual([]);
    r.st.interrupted = false;

    r.st.attack = { clip: SLICE, swingId: 4, active: false };
    r.combat.tick();
    r.st.attack = null;
    r.combat.tick();
    expect(r.applied).toEqual([]);
  });

  it('a new swing id closes the old swing and a second swing cleaves again', () => {
    r.foe('a', 0, -2);
    r.swing(1);
    r.swing(2);
    expect(r.applied.filter((a) => a.targetId === 'a')).toHaveLength(2);
  });
});

describe('Deep Wound and the burning axe', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => (r = rig()));

  it('applies a 5 s bleed with the Warden as the source on an axe hit, and cleave extras count too', () => {
    r.dealt({ attackId: WARDEN_CLIPS.chop });
    r.dealt({ attackId: CLEAVE_ATTACK_ID, targetId: 'b' });
    expect(r.statuses).toHaveLength(2);
    expect(r.statuses[0]).toEqual({
      id: 'a',
      spec: { id: DEEP_WOUND.id, kind: 'bleed', dps: DEEP_WOUND.dps, seconds: DEEP_WOUND.seconds, sourceId: 'player' },
    });
  });

  it('ignores blocked hits, other attack ids, status damage, other attackers and an unlearned skill', () => {
    r.dealt({ outcome: 'blocked' });
    r.dealt({ outcome: 'parried' });
    r.dealt({ attackId: 'rim-bash' });
    r.dealt({ kind: 'spell', attackId: WARDEN_CLIPS.slice });
    r.dealt({ attackerId: 'someone' });
    r.learned.delete(SKILL_IDS.deepWound);
    r.dealt();
    expect(r.statuses).toEqual([]);
  });

  it('looks the status service up at hit time and warns once when it is absent', () => {
    r.st.status = false;
    r.dealt();
    r.dealt();
    expect(r.statuses).toEqual([]);
    expect(r.warn).toHaveBeenCalledTimes(1);
    r.st.status = true;
    r.dealt();
    expect(r.statuses).toHaveLength(1);
  });

  it('the Surge lights the axe for 8 s: hits ignite as well, then the buff ends', () => {
    r.learned.delete(SKILL_IDS.deepWound);
    r.combat.igniteAxe();
    expect(r.combat.axeBurning).toBe(true);
    expect(r.events.log.at(-1)).toEqual({ type: 'buff.applied', payload: { id: SURGE_AXE.buffId, nameKey: SURGE_AXE.nameKey, seconds: 8 } });
    r.dealt();
    expect(r.statuses[0].spec).toMatchObject({ id: 'warden.axeIgnite', kind: 'ignite', dps: 3, seconds: 3, sourceId: 'player' });
    r.st.now = 7.9;
    r.combat.tick();
    expect(r.combat.axeBurning).toBe(true);
    r.st.now = 8;
    r.combat.tick();
    expect(r.combat.axeBurning).toBe(false);
    expect(r.events.log.at(-1)).toEqual({ type: 'buff.removed', payload: { id: SURGE_AXE.buffId } });
    r.dealt();
    expect(r.statuses).toHaveLength(1);
  });

  it('a second Surge refreshes the timer; reset, death and a load put the axe out', () => {
    r.combat.igniteAxe();
    r.st.now = 5;
    r.combat.igniteAxe();
    r.st.now = 12;
    r.combat.tick();
    expect(r.combat.axeBurning).toBe(true);
    r.combat.reset();
    expect(r.combat.axeBurning).toBe(false);
    r.combat.igniteAxe();
    r.events.emit('actor.died', { actorId: 'player' } as never);
    expect(r.combat.axeBurning).toBe(false);
    r.combat.igniteAxe();
    r.events.emit('save.loaded', {} as never);
    expect(r.combat.axeBurning).toBe(false);
    const removed = r.events.log.filter((l) => l.type === 'buff.removed');
    expect(removed).toHaveLength(3);
  });

  it('dispose unsubscribes', () => {
    r.combat.dispose();
    r.dealt();
    expect(r.statuses).toEqual([]);
    expect(r.events.count()).toBe(0);
  });
});

describe('War Howl', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => {
    r = rig();
    r.foe('weak', 0, -3);
    r.foe('far', 0, -7);
    r.foe('ally', 1, 1, 'ally');
  });

  it('fires once on the downward crossing of 50%, staggers hostiles within 6 m and reports the trigger', () => {
    r.hurt(60);
    expect(r.staggers).toEqual([]);
    r.hurt(45);
    expect(r.staggers).toEqual([{ id: 'weak', by: 'player', poise: 35 }]);
    expect(r.triggers).toEqual([SKILL_IDS.warHowl]);
    r.hurt(30);
    r.hurt(20);
    expect(r.staggers).toHaveLength(1);
  });

  it('re-arms above 50% but the 30 s cooldown still applies', () => {
    r.hurt(45);
    r.player.health = 80;
    r.st.now = 10;
    r.combat.tick();
    r.hurt(40);
    expect(r.staggers).toHaveLength(1);
    r.player.health = 80;
    r.st.now = 31;
    r.combat.tick();
    r.hurt(40);
    expect(r.staggers).toHaveLength(2);
  });

  it('needs the skill, a survivor, and ignores status ticks and blocked hits', () => {
    r.learned.delete(SKILL_IDS.warHowl);
    r.hurt(40);
    expect(r.staggers).toEqual([]);
    r.learned.add(SKILL_IDS.warHowl);
    r.hurt(0);
    r.hurt(40, { kind: 'status' });
    r.hurt(40, { outcome: 'blocked' });
    expect(r.staggers).toEqual([]);
  });

  it('after a reset below 50% (a load at low health) the first hit does not howl; it re-arms above 50%', () => {
    r.player.health = 30;
    r.combat.reset();
    r.hurt(25);
    expect(r.staggers).toEqual([]);
    r.player.health = 80;
    r.combat.tick();
    r.hurt(40);
    expect(r.staggers).toHaveLength(1);
  });

  it('an unlearned skill does not consume the trigger: learned later, the next hit below 50% fires', () => {
    r.learned.delete(SKILL_IDS.warHowl);
    r.hurt(40);
    r.learned.add(SKILL_IDS.warHowl);
    r.hurt(30);
    expect(r.staggers).toHaveLength(1);
  });
});

describe('Ember Rage', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => (r = rig()));

  it('gives 3 Ember per hit taken, at most every half second', () => {
    r.hurt(90);
    expect(r.restore).toHaveBeenCalledWith(3);
    r.st.now = 0.3;
    r.hurt(80);
    expect(r.restore).toHaveBeenCalledTimes(1);
    r.st.now = 0.5;
    r.hurt(70);
    expect(r.restore).toHaveBeenCalledTimes(2);
  });

  it('ignores status damage, blocked hits, zero damage and an unlearned skill', () => {
    r.hurt(90, { kind: 'status' });
    r.hurt(90, { outcome: 'blocked' });
    r.hurt(90, { dealt: 0 });
    r.learned.delete(SKILL_IDS.emberRage);
    r.st.now = 5;
    r.hurt(90);
    expect(r.restore).not.toHaveBeenCalled();
  });

  it('warns once and does nothing when the spells service has no restoreEmber', () => {
    r.st.spells = false;
    r.hurt(90);
    r.st.now = 1;
    r.hurt(80);
    expect(r.warn).toHaveBeenCalledTimes(1);
    expect(r.restore).not.toHaveBeenCalled();
  });
});
