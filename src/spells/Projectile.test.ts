import { describe, expect, it } from 'vitest';
import { ProjectileSystem, type ProjectileHit } from './Projectile';
import { FakeActor, FakeActors } from './testHost';

function setup(opts: { heightAt?: (x: number, z: number) => number; rayCast?: (o: any, d: any, m: number) => any; capacity?: number } = {}) {
  const player = new FakeActor('player', 'player');
  const actors = new FakeActors(player);
  const ps = new ProjectileSystem({ actors, heightAt: opts.heightAt, rayCast: opts.rayCast }, opts.capacity);
  const hits: ProjectileHit[] = [];
  const base = (extra: Record<string, unknown> = {}) => ({
    casterId: 'player', origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: 1 }, speed: 18, lifetime: 2, radius: 0.3,
    onHit: (r: ProjectileHit) => hits.push(r), ...extra,
  });
  return { actors, ps, hits, base };
}
const run = (ps: ProjectileSystem, seconds: number, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) ps.update(dt); };

describe('ProjectileSystem', () => {
  it('hits an actor before terrain when nearer', () => {
    const s = setup({ heightAt: (_x, z) => (z > 10 ? 5 : 0) });
    s.actors.add(new FakeActor('e', 'hostile', 0, 5));
    expect(s.ps.launch(s.base())).toBe(true);
    run(s.ps, 2);
    expect(s.hits).toHaveLength(1);
    expect(s.hits[0]).toMatchObject({ kind: 'actor', actorId: 'e' });
    expect(s.ps.liveCount).toBe(0);
  });
  it('hits terrain when the heightfield rises first', () => {
    const s = setup({ heightAt: (_x, z) => (z > 4 ? 3 : 0) });
    s.actors.add(new FakeActor('e', 'hostile', 0, 8));
    s.ps.launch(s.base());
    run(s.ps, 2);
    expect(s.hits).toHaveLength(1);
    expect(s.hits[0].kind).toBe('terrain');
    expect(s.hits[0].point.z).toBeGreaterThan(3.5);
    expect(s.hits[0].point.z).toBeLessThan(5);
  });
  it('expires', () => {
    const s = setup();
    s.ps.launch(s.base({ lifetime: 0.5 }));
    run(s.ps, 1);
    expect(s.hits).toHaveLength(1);
    expect(s.hits[0].kind).toBe('expired');
    expect(s.hits[0].point.z).toBeCloseTo(9, 0);
  });
  it('skips the caster, friendlies, the dead and unhittable', () => {
    const s = setup();
    s.actors.add(new FakeActor('ally', 'ally', 0, 2));
    s.actors.add(new FakeActor('dead', 'hostile', 0, 3)).kill();
    const npc = s.actors.add(new FakeActor('npc', 'hostile', 0, 4));
    npc.hittable = false;
    s.actors.get('player')!.pos.set(0, 0, 1);
    s.ps.launch(s.base({ lifetime: 1 }));
    run(s.ps, 1.5);
    expect(s.hits.map((h) => h.kind)).toEqual(['expired']);
  });
  it('neutral hittable targets are hit by the player', () => {
    const s = setup();
    s.actors.add(new FakeActor('dummy', 'neutral', 0, 4));
    s.ps.launch(s.base());
    run(s.ps, 1);
    expect(s.hits[0]).toMatchObject({ kind: 'actor', actorId: 'dummy' });
  });
  it('hostile casters hit the player but not each other', () => {
    const s = setup();
    s.actors.add(new FakeActor('orc', 'hostile', 0, 0));
    s.actors.add(new FakeActor('orc2', 'hostile', 0, 2));
    s.actors.get('player')!.pos.set(0, 0, 6);
    s.ps.launch(s.base({ casterId: 'orc' }));
    run(s.ps, 1);
    expect(s.hits[0]).toMatchObject({ kind: 'actor', actorId: 'player' });
  });
  it('rayCast static collider hit', () => {
    const s = setup({ rayCast: (o, d, m) => (m >= 0 && o.z < 3 && o.z + d.z * m >= 3 ? { point: { x: 0, y: 1, z: 3 } } : null) });
    s.actors.add(new FakeActor('e', 'hostile', 0, 6));
    s.ps.launch(s.base());
    run(s.ps, 1);
    expect(s.hits).toHaveLength(1);
    expect(s.hits[0]).toMatchObject({ kind: 'terrain', point: { z: 3 } });
  });
  it('rejects NaN and zero input', () => {
    const s = setup();
    expect(s.ps.launch(s.base({ direction: { x: 0, y: 0, z: 0 } }))).toBe(false);
    expect(s.ps.launch(s.base({ direction: { x: NaN, y: 0, z: 1 } }))).toBe(false);
    expect(s.ps.launch(s.base({ speed: 0 }))).toBe(false);
    expect(s.ps.launch(s.base({ speed: NaN }))).toBe(false);
    expect(s.ps.launch(s.base({ lifetime: 0 }))).toBe(false);
    expect(s.ps.launch(s.base({ lifetime: NaN }))).toBe(false);
    expect(s.ps.launch(s.base({ origin: { x: NaN, y: 0, z: 0 } }))).toBe(false);
    expect(s.ps.liveCount).toBe(0);
    s.ps.update(NaN);
    expect(s.hits).toHaveLength(0);
  });
  it('pool recycle expires the oldest once', () => {
    const s = setup({ capacity: 2 });
    const calls: string[] = [];
    const mk = (n: string) => s.base({ onHit: (r: ProjectileHit) => calls.push(n + ':' + r.kind) });
    s.ps.launch(mk('a'));
    s.ps.launch(mk('b'));
    s.ps.launch(mk('c'));
    expect(calls).toEqual(['a:expired']);
    expect(s.ps.liveCount).toBe(2);
    run(s.ps, 3);
    expect(calls.sort()).toEqual(['a:expired', 'b:expired', 'c:expired']);
    expect(s.ps.liveCount).toBe(0);
  });
  it('does not tunnel at high speed', () => {
    const s = setup();
    s.actors.add(new FakeActor('e', 'hostile', 0, 30));
    s.ps.launch(s.base({ speed: 400, radius: 0.1, lifetime: 1 }));
    s.ps.update(0.5); // one 200 m step
    expect(s.hits[0]).toMatchObject({ kind: 'actor', actorId: 'e' });
  });
  it('clear expires everything once', () => {
    const s = setup();
    s.ps.launch(s.base());
    s.ps.clear();
    s.ps.clear();
    expect(s.hits).toHaveLength(1);
  });

  it('team rule matches canDamage for all 16 pairs', () => {
    const teams = ['player', 'ally', 'hostile', 'neutral'] as const;
    const canDamage = (a: string, t: string): boolean => {
      if (a === 'neutral' || a === t) return false;
      if (a === 'player' || a === 'ally') return t === 'hostile' || t === 'neutral';
      return t === 'player' || t === 'ally' || t === 'neutral';
    };
    for (const a of teams) {
      for (const t of teams) {
        const s = setup();
        // The real player actor shoots for the 'player' row; other rows add a shooter and park the player away.
        if (a !== 'player') {
          s.actors.add(new FakeActor('shooter', a, 0, 0));
          s.actors.get('player')!.pos.set(50, 0, 50);
        }
        const caster = a === 'player' ? 'player' : 'shooter';
        s.actors.add(new FakeActor('victim', t, 0, 4));
        s.ps.launch(s.base({ casterId: caster, lifetime: 0.6 }));
        run(s.ps, 1);
        const hitVictim = s.hits.some((h) => h.kind === 'actor' && h.actorId === 'victim');
        expect(hitVictim, `${a} -> ${t}`).toBe(canDamage(a, t));
      }
    }
  });
});

describe('ProjectileSystem pierce, hostileOnly and the shared host', () => {
  it('passes through up to `pierce` actors, reporting each once, then stops at the next', () => {
    const s = setup();
    for (const [id, z] of [['a', 3], ['b', 5], ['c', 7]] as const) s.actors.add(new FakeActor(id, 'hostile', 0, z));
    const passed: string[] = [];
    s.ps.launch(s.base({ pierce: 1, onPass: (h: { actorId: string }) => passed.push(h.actorId) }));
    run(s.ps, 2);
    expect(passed).toEqual(['a']);
    expect(s.hits).toHaveLength(1);
    expect(s.hits[0]).toMatchObject({ kind: 'actor', actorId: 'b' });
  });
  it('a pierced actor is never hit twice, even with a wide radius', () => {
    const s = setup();
    s.actors.add(new FakeActor('a', 'hostile', 0, 4));
    const passed: string[] = [];
    s.ps.launch(s.base({ pierce: 3, radius: 1.5, onPass: (h: { actorId: string }) => passed.push(h.actorId) }));
    run(s.ps, 3);
    expect(passed).toEqual(['a']);
    expect(s.hits.map((h) => h.kind)).toEqual(['expired']);
  });
  it('a wall still stops a piercing projectile', () => {
    const s = setup({ rayCast: (o: any) => (o.z < 6 ? { point: { x: 0, y: 1, z: 6 } } : null) });
    s.actors.add(new FakeActor('a', 'hostile', 0, 3));
    s.actors.add(new FakeActor('behind', 'hostile', 0, 8));
    s.ps.launch(s.base({ pierce: 2 }));
    run(s.ps, 2);
    expect(s.hits).toHaveLength(1);
    expect(s.hits[0]).toMatchObject({ kind: 'terrain' });
  });
  it('hostileOnly skips neutral creatures the default rule would hit', () => {
    const s = setup();
    s.actors.add(new FakeActor('beast', 'neutral', 0, 3));
    s.actors.add(new FakeActor('e', 'hostile', 0, 6));
    s.ps.launch(s.base({ hostileOnly: true }));
    run(s.ps, 2);
    expect(s.hits[0]).toMatchObject({ kind: 'actor', actorId: 'e' });
  });
  it('clear(true) drops projectiles without calling back', () => {
    const s = setup();
    s.ps.launch(s.base());
    s.ps.clear(true);
    expect(s.ps.liveCount).toBe(0);
    expect(s.hits).toHaveLength(0);
    s.ps.launch(s.base());
    s.ps.clear();
    expect(s.hits.map((h) => h.kind)).toEqual(['expired']);
  });
  it('pierce state does not leak into the next projectile that reuses the slot', () => {
    const s = setup({ capacity: 1 });
    s.actors.add(new FakeActor('a', 'hostile', 0, 3));
    s.ps.launch(s.base({ pierce: 1 }));
    run(s.ps, 2);
    s.hits.length = 0;
    s.ps.launch(s.base());
    run(s.ps, 2);
    expect(s.hits[0]).toMatchObject({ kind: 'actor', actorId: 'a' });
  });
});
