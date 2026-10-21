import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASHBLADE_HEAVY_CLIP } from '../classes/ashblade/attackSet';
import { ASH_DRIFT } from '../classes/ashblade/tuning';
import { WARDEN_CLIPS } from '../classes/warden/tuning';
import { HEAVY_CHOP_CLIP, registerHeavyClip } from '../combat/heavyBlow';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { SURGE } from '../vfx/tuning';
import { cartKitUsers } from './cartArt';
import { BarricadeFx, BarricadeState, Carts, cartHitValue, type Cart, type CartOutcome } from './structures';
import { CART, CART_HIT_FRACTION, CART_HIT_VALUE, BARRICADE, EMBER_BUDGET, surgeCastsWithin } from './tuning';
import { makeKit, secs, TICK, type Kit } from './testKit';

let physics: PhysicsWorld;
let kit: Kit;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  kit = await makeKit(physics, { anchors: false });
});
afterEach(() => {
  kit.teardown();
  vi.restoreAllMocks();
});

function spawnCart(carts: Carts, o: { x?: number; z?: number; length?: number } = {}) {
  const x = o.x ?? kit.at.x;
  const z = o.z ?? kit.at.z;
  const resolved: CartOutcome[] = [];
  const cart = carts.spawn({
    id: 'test.cart.0.1',
    start: { x: x - (o.length ?? 50), y: kit.y, z },
    end: { x, y: kit.y, z },
    origin: { x, z },
    onResolve: (_c: Cart, how) => resolved.push(how),
  })!;
  return { cart, resolved };
}

/** The director ticks carts in the game; these tests tick them directly. */
const roll = (carts: Carts, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / TICK); i++) carts.fixedUpdate(TICK);
};
const rollTicks = (carts: Carts, n: number) => {
  for (let i = 0; i < n; i++) carts.fixedUpdate(TICK);
};

const hit = (id: string, req: Record<string, unknown>) =>
  kit.ctx.damage.apply({ attackerId: 'player', targetId: id, amount: 10, kind: 'melee', ...req } as never);

describe('hit-value table', () => {
  it('is 10% and 25% of cart health; pinned numbers', () => {
    expect(CART.maxHealth).toBe(600);
    expect(CART_HIT_FRACTION).toEqual({ chop: 0.1, surge: 0.25 });
    expect(CART_HIT_VALUE).toEqual({ chop: 60, surge: 150 });
    expect(BARRICADE.maxHealth).toBe(400);
    expect(CART.impactDamage).toBe(250);
    // one leaked cart is survivable, two are not
    expect(BARRICADE.maxHealth - CART.impactDamage).toBeGreaterThan(0);
    expect(BARRICADE.maxHealth - 2 * CART.impactDamage).toBeLessThanOrEqual(0);
  });

  it('cartHitValue: chops and Surge count, everything else is 0', () => {
    expect(cartHitValue({ kind: 'melee', attackId: HEAVY_CHOP_CLIP })).toBe(60);
    expect(cartHitValue({ kind: 'spell', attackId: SURGE.spellId })).toBe(150);
    expect(cartHitValue({ kind: 'melee', attackId: '1H_Melee_Attack_Slice_Diagonal' })).toBe(0);
    expect(cartHitValue({ kind: 'melee' })).toBe(0);
    expect(cartHitValue({ kind: 'status', attackId: HEAVY_CHOP_CLIP })).toBe(0);
    expect(cartHitValue({ kind: 'spell', attackId: 'fireball' })).toBe(0);
    expect(cartHitValue({ kind: 'melee', attackId: SURGE.spellId })).toBe(0);
    expect(cartHitValue({ kind: 'script', attackId: SURGE.spellId })).toBe(0);
  });
});

describe('damage on a cart', () => {
  let carts: Carts;
  let cart: Cart;
  beforeEach(() => {
    carts = new Carts(kit.ctx);
    cart = spawnCart(carts).cart;
  });
  afterEach(() => carts.dispose());

  it('Knight, Ashblade and Warden chops each take 60', () => {
    const offs = [registerHeavyClip(ASHBLADE_HEAVY_CLIP), registerHeavyClip(WARDEN_CLIPS.chop)];
    try {
      let expected = 600;
      for (const clip of [HEAVY_CHOP_CLIP, ASHBLADE_HEAVY_CLIP, WARDEN_CLIPS.chop]) {
        const r = hit(cart.actor.id, { attackId: clip, poise: 12 });
        expect(r?.dealt).toBe(60);
        expected -= 60;
        expect(cart.actor.health).toBe(expected);
      }
    } finally {
      offs.forEach((o) => o());
    }
  });

  it('a chop is ignored while its clip is not registered as heavy', () => {
    const r = hit(cart.actor.id, { attackId: WARDEN_CLIPS.chop });
    expect(r?.dealt).toBe(0);
  });

  it('all five Surges take 150, whatever their own amount and poise', () => {
    const forms: Array<[string, number, number]> = [
      ['knight', SURGE.damage, SURGE.poise],
      ['pathfinder', SURGE.damage, SURGE.cinderPoise],
      ['ashblade', ASH_DRIFT.damage, SURGE.poise],
      ['warden', SURGE.damage, SURGE.poise],
      ['emberwright', SURGE.damage * 1.3, SURGE.cinderPoise],
    ];
    for (const [i, [, amount, poise]] of forms.slice(0, 4).entries()) {
      const r = hit(cart.actor.id, { kind: 'spell', attackId: SURGE.spellId, amount, poise });
      expect(r?.dealt, forms[i][0]).toBe(150);
    }
    // the fifth finishes it (600 - 4 * 150 = 0): destroyed
    expect(cart.actor.dead).toBe(true);
    expect(forms).toHaveLength(5);
    // and the fifth form on a fresh cart does the same 150
    const other = spawnCart(carts).cart;
    const r = hit(other.actor.id, { kind: 'spell', attackId: SURGE.spellId, amount: forms[4][1], poise: forms[4][2] });
    expect(r?.dealt).toBe(150);
  });

  it('a class skill with poise >= 30 does nothing, as do light hits, fire and status ticks', () => {
    expect(hit(cart.actor.id, { attackId: 'class.skill', poise: 60, amount: 40 })?.dealt).toBe(0);
    expect(hit(cart.actor.id, { attackId: '1H_Melee_Attack_Slice_Diagonal', poise: 5 })?.dealt).toBe(0);
    expect(hit(cart.actor.id, { kind: 'status', attackId: 'burn', amount: 5, poise: 0, statusKind: 'burn' })?.dealt).toBe(0);
    expect(hit(cart.actor.id, { kind: 'script', amount: 99, poise: 99 })?.dealt).toBe(0);
    expect(cart.actor.health).toBe(600);
  });

  it('has no poise, so no hit staggers it', () => {
    hit(cart.actor.id, { attackId: HEAVY_CHOP_CLIP, poise: 999 });
    expect(cart.actor.maxPoise).toBe(0);
    expect(kit.of('actor.staggered')).toEqual([]);
  });

  it('emits structure.damaged at full health on spawn, then with each new health; destroyed exactly once', () => {
    expect(kit.of('structure.damaged')).toEqual([{ id: 'test.cart.0.1', health: 600 }]);
    hit(cart.actor.id, { kind: 'spell', attackId: SURGE.spellId });
    expect(kit.of('structure.damaged').at(-1)).toEqual({ id: 'test.cart.0.1', health: 450 });
    hit(cart.actor.id, { attackId: '1H_Melee_Attack_Slice_Diagonal' }); // 0 damage: no event
    expect(kit.of('structure.damaged')).toHaveLength(2);
    for (let i = 0; i < 3; i++) hit(cart.actor.id, { kind: 'spell', attackId: SURGE.spellId });
    expect(cart.actor.dead).toBe(true);
    expect(kit.of('structure.destroyed')).toEqual([{ id: 'test.cart.0.1' }]);
    hit(cart.actor.id, { kind: 'spell', attackId: SURGE.spellId }); // dead: dropped
    expect(kit.of('structure.destroyed')).toHaveLength(1);
  });

  it('a destroyed cart never arrives and is cleaned up', () => {
    const { resolved } = { resolved: [] as CartOutcome[] };
    void resolved;
    for (let i = 0; i < 4; i++) hit(cart.actor.id, { kind: 'spell', attackId: SURGE.spellId });
    expect(cart.outcome).toBe('destroyed');
    roll(carts, CART.collapseSeconds + CART.vanishSeconds + 0.2);
    expect(cart.gone).toBe(true);
    expect(carts.all).toHaveLength(0);
    expect(kit.ctx.actors.get(cart.actor.id)).toBeUndefined();
  });

  it('does not touch other targets: a hostile of another kind takes its normal damage', () => {
    const foe = kit.ctx.actors.spawn({ kind: 'ember-hound', team: 'hostile', maxHealth: 40, maxPoise: 15 });
    expect(hit(foe.id, { attackId: '1H_Melee_Attack_Slice_Diagonal', amount: 7, poise: 3 })?.dealt).toBe(7);
    expect(hit(foe.id, { kind: 'spell', attackId: SURGE.spellId, amount: 15 })?.dealt).toBe(15);
  });
});

describe('cart motion', () => {
  it('rolls at 1.2 m/s, winds back, strikes once and is consumed', () => {
    const carts = new Carts(kit.ctx);
    const { cart, resolved } = spawnCart(carts, { length: 12 });
    const stop = 12 - CART.strikeGap;
    rollTicks(carts, secs(stop / CART.speed) - 2);
    expect(cart.phase).toBe('rolling');
    expect(cart.rolled).toBeCloseTo(stop - 2 * TICK * CART.speed, 2);
    rollTicks(carts, 6);
    expect(cart.phase).toBe('windup');
    expect(resolved).toEqual([]);
    roll(carts, CART.windupSeconds * 0.5);
    expect(resolved).toEqual([]);
    expect(cart.visual.root.position.x).toBeLessThan(kit.at.x - 12 + stop - 0.1); // rocked back
    roll(carts, CART.windupSeconds * 0.6);
    expect(resolved).toEqual(['arrived']);
    expect(cart.outcome).toBe('arrived');
    expect(cart.actor.hittable).toBe(false);
    roll(carts, 5);
    expect(resolved).toEqual(['arrived']);
    expect(cart.gone).toBe(true);
    carts.dispose();
  });

  it('a cart stopped during its windup does not arrive', () => {
    const carts = new Carts(kit.ctx);
    const { cart, resolved } = spawnCart(carts, { length: 4 });
    roll(carts, 2.5);
    expect(cart.phase).toBe('windup');
    for (let i = 0; i < 4; i++) hit(cart.actor.id, { kind: 'spell', attackId: SURGE.spellId });
    roll(carts, 3);
    expect(resolved).toEqual(['destroyed']);
    carts.dispose();
  });

  it('builds with at most one light and shares geometry between carts; the last cart frees it', () => {
    const carts = new Carts(kit.ctx);
    const a = spawnCart(carts).cart;
    const b = spawnCart(carts).cart;
    let lights = 0;
    a.visual.root.traverse((o) => void ((o as { isLight?: boolean }).isLight && lights++));
    expect(lights).toBe(1);
    const geos = (c: Cart) => {
      const s = new Set<unknown>();
      c.visual.root.traverse((o) => void ((o as { geometry?: unknown }).geometry && s.add((o as unknown as { geometry: unknown }).geometry)));
      return s;
    };
    for (const g of geos(a)) expect(geos(b).has(g)).toBe(true);
    expect(cartKitUsers()).toBe(2);
    carts.dispose();
    expect(cartKitUsers()).toBe(0);
  });

  it('keeps positions exact far from the origin (Cinderford and x 22000), 60 s on', () => {
    for (const [fx, fz] of [[18200, 2600], [22000, 0]] as const) {
      const carts = new Carts(kit.ctx);
      const { cart } = spawnCart(carts, { x: fx, z: fz, length: 100 });
      roll(carts, 60);
      const expected = 60 * CART.speed;
      expect(cart.rolled).toBeCloseTo(expected, 3);
      // the world position is the origin plus the local offset to float64 precision
      const local = cart.localPosition();
      expect(cart.visual.root.position.x).toBeCloseTo(fx + local.x, 9);
      expect(local.x).toBeCloseTo(-100 + expected, 3);
      expect(cart.visual.root.position.z).toBeCloseTo(fz, 9);
      carts.dispose();
    }
  });
});

describe('reachability (tuning pinned by simulation)', () => {
  it('a Knight with chops alone can stop a cart inside the nominal approach', () => {
    const chops = Math.ceil(CART.maxHealth / CART_HIT_VALUE.chop);
    expect(chops).toBe(10);
    const assumedChopPeriod = 2.5; // seconds per heavy chop incl. recovery (attack 3 is slow); generous
    expect(chops * assumedChopPeriod).toBeLessThan(CART.nominalApproachSeconds);
  });

  it('a Surge-only class (ember 100, +2/s after 2 s, 40 per cast, 6 s cooldown) stops one before it arrives', () => {
    const needed = Math.ceil(CART.maxHealth / CART_HIT_VALUE.surge);
    expect(needed).toBe(4);
    expect(surgeCastsWithin(CART.nominalApproachSeconds)).toBeGreaterThanOrEqual(needed);
    expect(surgeCastsWithin(10)).toBeLessThan(needed);
    expect(EMBER_BUDGET.cost).toBe(SURGE.emberCost);
  });
});

describe('barricade', () => {
  it('is a plain health value: damage, events, destroyed once, restore re-arms', () => {
    const b = new BarricadeState('b', 400, kit.ctx.events);
    b.announce();
    b.damage(250);
    expect(b.health).toBe(150);
    b.damage(0);
    b.damage(-5);
    b.damage(Number.NaN);
    expect(b.health).toBe(150);
    b.damage(250);
    expect(b.health).toBe(0);
    expect(b.destroyed).toBe(true);
    b.damage(10);
    expect(kit.of('structure.destroyed')).toEqual([{ id: 'b' }]);
    expect(kit.of('structure.damaged').map((e) => e.health)).toEqual([400, 150, 0]);
    b.restore(150);
    expect(b.destroyed).toBe(false);
    expect(kit.of('structure.damaged').at(-1)).toEqual({ id: 'b', health: 150 });
    b.damage(150);
    expect(kit.of('structure.destroyed')).toHaveLength(2);
  });

  it('is not an actor, so nothing can hit it', () => {
    const before = [...kit.ctx.actors.all()].length;
    new BarricadeState('b', 400, kit.ctx.events);
    expect([...kit.ctx.actors.all()].length).toBe(before);
  });

  it('draws a palisade, cracks by health, collapses, resets and disposes', () => {
    const pts = [0, 1, 2, 3].map((i) => ({ x: kit.at.x, y: kit.y, z: kit.at.z + i * 4 }));
    const before = kit.ctx.scene.children.length;
    const fx = new BarricadeFx(kit.ctx.scene, pts, 400);
    expect(kit.ctx.scene.children.length).toBeGreaterThan(before + 10);
    const cracks = () => kit.ctx.scene.children.filter((o) => o.name === 'barricade-crack' && o.visible).length;
    expect(cracks()).toBe(0);
    fx.show(290);
    expect(cracks()).toBe(4);
    fx.show(90);
    expect(cracks()).toBe(12);
    expect(fx.standing).toBeGreaterThan(0);
    fx.collapse();
    expect(fx.standing).toBe(0);
    fx.reset(400);
    expect(fx.standing).toBeGreaterThan(0);
    expect(cracks()).toBe(0);
    fx.dispose();
    expect(kit.ctx.scene.children.length).toBe(before);
  });
});
