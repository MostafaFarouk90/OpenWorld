import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorPort } from '../hud/ports';
import { ConsumableUser } from './consumables';
import { Inventory } from './Inventory';
import '../quests/content/act2/items';
import '../economy/items.act3';

let events: { type: string; payload: unknown }[];
let actor: ActorPort & { dead: boolean };
let present: boolean;
let inv: Inventory;
let user: ConsumableUser;
let heal: ReturnType<typeof vi.fn>;

beforeEach(() => {
  events = [];
  present = true;
  actor = {
    id: 'player',
    kind: 'player',
    team: 'player',
    level: 1,
    health: 50,
    maxHealth: 120,
    stamina: 100,
    maxStamina: 100,
    dead: false,
    restoreStamina: () => {},
  } as ActorPort & { dead: boolean };
  const emit = (type: string, payload: unknown) => events.push({ type, payload });
  inv = new Inventory({ emit, logger: { warn: () => {} } });
  heal = vi.fn((amount: number) => {
    const before = actor.health;
    actor.health = Math.min(actor.maxHealth, actor.health + amount);
    return actor.health - before;
  });
  user = new ConsumableUser({ inventory: inv, env: { actor: () => (present ? actor : null), heal, emit } });
  inv.add('healing-flask', 3);
});

const used = () => events.filter((e) => e.type === 'item.used');

describe('begin refusals', () => {
  it('unknown item', () => {
    expect(user.begin('mystery')).toEqual({ ok: false, reason: 'unknown-item' });
  });
  it('not owned', () => {
    expect(user.begin('hearth-bread')).toEqual({ ok: false, reason: 'not-owned' });
  });
  it('not usable (gear, quest item)', () => {
    inv.add('practice-sword', 1);
    inv.add('hearth-stone', 1);
    expect(user.begin('practice-sword')).toEqual({ ok: false, reason: 'not-usable' });
    expect(user.begin('hearth-stone')).toEqual({ ok: false, reason: 'not-usable' });
  });
  it('dead, and no actor at all', () => {
    actor.dead = true;
    expect(user.begin('healing-flask')).toEqual({ ok: false, reason: 'dead' });
    actor.dead = false;
    present = false;
    expect(user.begin('healing-flask')).toEqual({ ok: false, reason: 'dead' });
    expect(inv.count('healing-flask')).toBe(3);
  });
  it('busy while already drinking, even another item', () => {
    inv.add('hearth-bread', 1);
    expect(user.begin('healing-flask').ok).toBe(true);
    expect(user.begin('healing-flask')).toEqual({ ok: false, reason: 'busy' });
    expect(user.begin('hearth-bread')).toEqual({ ok: false, reason: 'busy' });
  });
  it('no charges', () => {
    class Lying extends Inventory {
      override has(): boolean {
        return true;
      }
    }
    const fake = new Lying({ emit: () => {} });
    const u = new ConsumableUser({ inventory: fake, env: { actor: () => actor, heal, emit: () => {} } });
    expect(u.begin('healing-flask')).toEqual({ ok: false, reason: 'no-charges' });
  });
  it('full health, keeps the charge', () => {
    actor.health = actor.maxHealth;
    expect(user.begin('healing-flask')).toEqual({ ok: false, reason: 'full-health' });
    expect(inv.count('healing-flask')).toBe(3);
    expect(user.drinking).toBeNull();
  });
  it('checks dead before busy before full-health', () => {
    user.begin('healing-flask');
    actor.health = actor.maxHealth;
    expect(user.begin('healing-flask')).toEqual({ ok: false, reason: 'busy' });
    actor.dead = true;
    expect(user.begin('healing-flask')).toEqual({ ok: false, reason: 'dead' });
  });
});

describe('drinking', () => {
  it('starts a timed drink without spending the charge', () => {
    expect(user.begin('healing-flask')).toEqual({ ok: true, healed: 0 });
    expect(user.drinking).toEqual({ itemId: 'healing-flask', remaining: 1.2 });
    expect(user.lockSeconds).toBeCloseTo(1.2);
    expect(inv.count('healing-flask')).toBe(3);
    expect(heal).not.toHaveBeenCalled();
  });

  it('counts down and completes: heals 40% of max, spends one charge, emits item.used', () => {
    user.begin('healing-flask');
    user.update(0.6);
    expect(user.drinking?.remaining).toBeCloseTo(0.6);
    expect(user.lockSeconds).toBeCloseTo(0.6);
    expect(inv.count('healing-flask')).toBe(3);
    user.update(0.6);
    expect(heal).toHaveBeenCalledWith(0.4 * 120);
    expect(actor.health).toBe(50 + 48);
    expect(inv.count('healing-flask')).toBe(2);
    expect(used()).toEqual([{ type: 'item.used', payload: { itemId: 'healing-flask' } }]);
    expect(user.drinking).toBeNull();
    expect(user.lockSeconds).toBe(0);
  });

  it('heals a flat amount for bread, in 0.8 s', () => {
    inv.add('hearth-bread', 2);
    user.begin('hearth-bread');
    user.update(0.79);
    expect(heal).not.toHaveBeenCalled();
    user.update(0.02);
    expect(heal).toHaveBeenCalledWith(15);
    expect(actor.health).toBe(65);
    expect(inv.count('hearth-bread')).toBe(1);
  });

  it('the heal is clamped to max health by the env', () => {
    actor.health = 110;
    user.begin('healing-flask');
    user.update(2);
    expect(actor.health).toBe(120);
    expect(inv.count('healing-flask')).toBe(2);
  });

  it('uses the current max health at completion', () => {
    user.begin('healing-flask');
    actor.maxHealth = 200;
    user.update(2);
    expect(heal).toHaveBeenCalledWith(80);
  });

  it('can drink again after finishing', () => {
    user.begin('healing-flask');
    user.update(2);
    expect(user.begin('healing-flask').ok).toBe(true);
    user.update(2);
    expect(inv.count('healing-flask')).toBe(1);
    expect(used()).toHaveLength(2);
  });

  it('update with no drink does nothing', () => {
    events.length = 0;
    user.update(1);
    expect(heal).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('the last charge is spent, then the item is gone', () => {
    inv.remove('healing-flask', 2);
    user.begin('healing-flask');
    user.update(2);
    expect(inv.has('healing-flask')).toBe(false);
    expect(user.begin('healing-flask')).toEqual({ ok: false, reason: 'not-owned' });
  });
});

describe('cancel', () => {
  it('cancel keeps the charge and never heals', () => {
    user.begin('healing-flask');
    user.update(0.5);
    user.cancel();
    expect(user.drinking).toBeNull();
    user.update(5);
    expect(inv.count('healing-flask')).toBe(3);
    expect(heal).not.toHaveBeenCalled();
    expect(used()).toEqual([]);
  });

  it('cancel with nothing drinking is harmless', () => {
    user.cancel();
    expect(user.drinking).toBeNull();
  });

  it('death mid-drink cancels on the next update and keeps the charge', () => {
    user.begin('healing-flask');
    user.update(0.5);
    actor.dead = true;
    user.update(5);
    expect(user.drinking).toBeNull();
    expect(inv.count('healing-flask')).toBe(3);
    expect(heal).not.toHaveBeenCalled();
    actor.dead = false;
    user.update(5);
    expect(heal).not.toHaveBeenCalled();
  });

  it('losing the actor mid-drink cancels too', () => {
    user.begin('healing-flask');
    present = false;
    user.update(5);
    expect(user.drinking).toBeNull();
    expect(inv.count('healing-flask')).toBe(3);
  });

  it('the charge handed in mid-drink means no heal and no event', () => {
    inv.remove('healing-flask', 2);
    user.begin('healing-flask');
    inv.remove('healing-flask', 1);
    user.update(5);
    expect(heal).not.toHaveBeenCalled();
    expect(used()).toEqual([]);
    expect(user.drinking).toBeNull();
  });
});

describe('with the inventory', () => {
  it('equipping during a drink is allowed and does not disturb it', () => {
    inv.add('squires-arming-sword', 1);
    user.begin('healing-flask');
    expect(inv.equip('squires-arming-sword').ok).toBe(true);
    expect(user.drinking).not.toBeNull();
    user.update(2);
    expect(inv.count('healing-flask')).toBe(2);
    expect(inv.equipped('weapon')).toBe('squires-arming-sword');
  });

  it('drinking snapshot is a copy', () => {
    user.begin('healing-flask');
    const d = user.drinking!;
    d.remaining = 99;
    expect(user.lockSeconds).toBeCloseTo(1.2);
  });
});

describe('a consumable with no health effect (the Fox-Fire Ember, A12)', () => {
  beforeEach(() => {
    inv.add('fox-fire-ember', 1);
  });

  it('is usable at full health, spends its charge, heals nothing and says item.used', () => {
    actor.health = actor.maxHealth;
    expect(user.begin('fox-fire-ember')).toEqual({ ok: true, healed: 0 });
    user.update(1);
    expect(heal).not.toHaveBeenCalled();
    expect(inv.count('fox-fire-ember')).toBe(0);
    expect(used()).toEqual([{ type: 'item.used', payload: { itemId: 'fox-fire-ember' } }]);
  });

  it('is usable below full health too, with the same effect', () => {
    expect(user.begin('fox-fire-ember').ok).toBe(true);
    user.update(1);
    expect(heal).not.toHaveBeenCalled();
    expect(actor.health).toBe(50);
    expect(used()).toHaveLength(1);
  });

  it('still refuses a healing flask at full health (the exception is the item\'s own)', () => {
    actor.health = actor.maxHealth;
    expect(user.begin('healing-flask')).toEqual({ ok: false, reason: 'full-health' });
  });
});

describe('burnRelief (Fen Salve)', () => {
  const salveUser = (relieveBurn?: (n: number) => boolean, warn: (m: string) => void = () => {}) =>
    new ConsumableUser({ inventory: inv, env: { actor: () => actor, heal, emit: (t, p) => events.push({ type: t, payload: p }), relieveBurn, warn } });

  it('removes 20 Burn through the spells service, does not heal, and works at full health', () => {
    actor.health = actor.maxHealth;
    inv.add('fen-salve', 2);
    const relieve = vi.fn(() => true);
    const u = salveUser(relieve);
    expect(u.begin('fen-salve').ok).toBe(true);
    u.update(5);
    expect(relieve).toHaveBeenCalledWith(20);
    expect(heal).not.toHaveBeenCalled();
    expect(inv.count('fen-salve')).toBe(1);
    expect(used()).toHaveLength(1);
  });

  it('without a spells service the use still succeeds and warns once', () => {
    inv.add('fen-salve', 3);
    const warn = vi.fn();
    const u = salveUser(undefined, warn);
    for (let i = 0; i < 2; i++) {
      expect(u.begin('fen-salve').ok).toBe(true);
      u.update(5);
    }
    expect(inv.count('fen-salve')).toBe(1);
    expect(used()).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a flask (no burnRelief) never touches Burn', () => {
    const relieve = vi.fn(() => true);
    const u = salveUser(relieve);
    u.begin('healing-flask');
    u.update(5);
    expect(relieve).not.toHaveBeenCalled();
  });
});
