import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from './FollowModel';
import { RayBudget, findSpot, groundAt, lineOfSight, type GroundPorts, type RayHitLike } from './ground';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

type Ray = (origin: Vec3, dir: Vec3, max: number) => RayHitLike | null;

function ports(over: Partial<GroundPorts> & { ray?: Ray } = {}) {
  const { ray, ...rest } = over;
  const raycast = vi.fn<Ray>(ray ?? (() => null));
  const heightAt = vi.fn((_x: number, _z: number) => 5);
  const p: GroundPorts = { raycast, isResident: () => true, heightAt, indoors: () => false, ...rest };
  return { p, raycast, heightAt };
}

describe('RayBudget', () => {
  it('takes up to its max and then refuses', () => {
    const b = new RayBudget(3);
    expect(b.take()).toBe(true);
    expect(b.take(2)).toBe(true);
    expect(b.spent).toBe(3);
    expect(b.take()).toBe(false);
    expect(b.spent).toBe(3);
  });
  it('refuses a take that would overshoot without spending anything', () => {
    const b = new RayBudget(3);
    expect(b.take(2)).toBe(true);
    expect(b.take(2)).toBe(false);
    expect(b.spent).toBe(2);
    expect(b.take(1)).toBe(true);
  });
  it('reset restores the whole budget', () => {
    const b = new RayBudget(2);
    b.take(2);
    expect(b.take()).toBe(false);
    b.reset();
    expect(b.spent).toBe(0);
    expect(b.take(2)).toBe(true);
  });
  it('defaults to 6 rays per tick', () => {
    const b = new RayBudget();
    expect(b.take(6)).toBe(true);
    expect(b.take()).toBe(false);
  });
  it('a budget of 0 refuses everything', () => {
    expect(new RayBudget(0).take()).toBe(false);
  });
});

describe('groundAt', () => {
  it('uses the ray hit point, casting down from 1.5 m above the hint', () => {
    const { p, raycast, heightAt } = ports({ ray: () => ({ distance: 2, point: v(1, 2.5, 3) }) });
    expect(groundAt(p, 1, 3, 2)).toBe(2.5);
    const [origin, dir, reach] = raycast.mock.calls[0];
    expect(origin).toEqual(v(1, 3.5, 3));
    expect(dir).toEqual(v(0, -1, 0));
    expect(reach).toBe(8);
    expect(heightAt).not.toHaveBeenCalled();
  });
  it.each([0, 0.03, 0.05])('keeps yHint when the ray starts inside a solid (distance %f)', (distance) => {
    const { p } = ports({ ray: () => ({ distance, point: v(0, -50, 0) }) });
    expect(groundAt(p, 0, 0, 7)).toBe(7);
  });
  it('trusts a hit just beyond the inside-solid threshold', () => {
    const { p } = ports({ ray: () => ({ distance: 0.06, point: v(0, 1, 0) }) });
    expect(groundAt(p, 0, 0, 7)).toBe(1);
  });
  it('falls back to heightAt on a miss outdoors when resident', () => {
    const { p, heightAt } = ports();
    expect(groundAt(p, 2, 3, 0)).toBe(5);
    expect(heightAt).toHaveBeenCalledWith(2, 3);
  });
  it('gives null outdoors when not resident, without casting', () => {
    const { p, raycast, heightAt } = ports({ isResident: () => false });
    expect(groundAt(p, 0, 0, 0)).toBeNull();
    expect(raycast).not.toHaveBeenCalled();
    expect(heightAt).not.toHaveBeenCalled();
  });
  it('indoors with a miss uses nav.floorAt when there is a grid', () => {
    const { p, heightAt } = ports({ indoors: () => true, nav: { hasGrid: () => true, floorAt: () => 150.2 } });
    expect(groundAt(p, 0, 0, 150)).toBe(150.2);
    expect(heightAt).not.toHaveBeenCalled();
  });
  it('indoors ignores residency', () => {
    const { p } = ports({ indoors: () => true, isResident: () => false, nav: { hasGrid: () => true, floorAt: () => 1 } });
    expect(groundAt(p, 0, 0, 1)).toBe(1);
  });
  it('indoors with no nav returns null and never asks the heightfield', () => {
    const { p, heightAt } = ports({ indoors: () => true });
    expect(groundAt(p, 0, 0, 150)).toBeNull();
    expect(heightAt).not.toHaveBeenCalled();
  });
  it.each([
    ['no grid', { hasGrid: (): boolean => false, floorAt: (): number | null => 3 }],
    ['grid but no floorAt', { hasGrid: (): boolean => true }],
    ['floorAt null', { hasGrid: (): boolean => true, floorAt: (): number | null => null }],
    ['floorAt NaN', { hasGrid: (): boolean => true, floorAt: (): number | null => NaN }],
  ])('indoors with nav (%s) and a miss gives null, never heightAt', (_n, nav) => {
    const { p, heightAt } = ports({ indoors: () => true, nav });
    expect(groundAt(p, 0, 0, 150)).toBeNull();
    expect(heightAt).not.toHaveBeenCalled();
  });
  it('outdoors, a nav floor that is unusable falls through to the heightfield', () => {
    const { p } = ports({ nav: { hasGrid: () => true, floorAt: () => NaN } });
    expect(groundAt(p, 0, 0, 0)).toBe(5);
  });
  it('outdoors, a usable nav floor wins over the heightfield', () => {
    const { p, heightAt } = ports({ nav: { hasGrid: () => true, floorAt: () => 2 } });
    expect(groundAt(p, 0, 0, 0)).toBe(2);
    expect(heightAt).not.toHaveBeenCalled();
  });
  it('a null nav service is tolerated', () => {
    const { p } = ports({ nav: null });
    expect(groundAt(p, 0, 0, 0)).toBe(5);
  });
  it.each([
    [NaN, 0, 0],
    [0, NaN, 0],
    [0, 0, NaN],
    [Infinity, 0, 0],
    [0, 0, -Infinity],
  ])('non-finite input (%f, %f, %f) gives null without touching the world', (x, z, y) => {
    const { p, raycast, heightAt } = ports();
    expect(groundAt(p, x, z, y)).toBeNull();
    expect(raycast).not.toHaveBeenCalled();
    expect(heightAt).not.toHaveBeenCalled();
  });
});

describe('lineOfSight', () => {
  it('is clear when the ray hits nothing', () => {
    const { p, raycast } = ports();
    expect(lineOfSight(p, v(0, 1, 0), v(3, 1, 4))).toBe(true);
    const [origin, dir, max] = raycast.mock.calls[0];
    expect(origin).toEqual(v(0, 1, 0));
    expect(max).toBeCloseTo(5);
    expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1);
  });
  it('is blocked by a hit well before the target', () => {
    const { p } = ports({ ray: () => ({ distance: 2, point: v(0, 0, 0) }) });
    expect(lineOfSight(p, v(0, 1, 0), v(0, 1, -5))).toBe(false);
  });
  it('treats a hit at the target (within 5 cm) as clear', () => {
    expect(lineOfSight(ports({ ray: () => ({ distance: 4.97, point: v(0, 0, 0) }) }).p, v(0, 1, 0), v(0, 1, -5))).toBe(true);
    expect(lineOfSight(ports({ ray: () => ({ distance: 4.9, point: v(0, 0, 0) }) }).p, v(0, 1, 0), v(0, 1, -5))).toBe(false);
  });
  it('coincident points are clear without casting', () => {
    const { p, raycast } = ports();
    expect(lineOfSight(p, v(1, 1, 1), v(1, 1, 1))).toBe(true);
    expect(raycast).not.toHaveBeenCalled();
  });
});

describe('findSpot', () => {
  // Player at the origin facing -Z: behind (0,0,3), left (-3,0,0.5), right (3,0,0.5).
  const player = v(0, 0, 0);
  const isDown = (d: Vec3) => d.y === -1;
  /** Down-rays hit the floor at `floorY`; sight rays are blocked where `blocked(dir)` says so. */
  const world = (blocked: (dir: Vec3) => boolean, floorY = 0): Ray => (origin, dir, max) => {
    if (isDown(dir)) return { distance: 1.5, point: v(origin.x, floorY, origin.z) };
    return blocked(dir) ? { distance: max / 2, point: v(0, 0, 0) } : null;
  };
  const q = { player, playerYaw: 0 };

  it('returns the behind candidate when clear', () => {
    const { p } = ports({ ray: world(() => false) });
    const r = findSpot(p, q, new RayBudget(), { next: 0 });
    expect(r).toEqual(v(0, 0, 3));
  });
  it('casts the sight ray from the player chest (1.2 m) to the candidate chest', () => {
    const { p, raycast } = ports({ ray: world(() => false) });
    findSpot(p, q, new RayBudget(), { next: 0 });
    const sight = raycast.mock.calls.find(([, d]) => !isDown(d))!;
    expect(sight[0]).toEqual(v(0, 1.2, 0));
    expect(sight[2]).toBeCloseTo(3);
  });
  it('skips a candidate whose sight ray is blocked and returns the next one (left)', () => {
    const { p } = ports({ ray: world((d) => d.z > 0.5) });
    const r = findSpot(p, q, new RayBudget(), { next: 0 }) as Vec3;
    expect(r.x).toBeCloseTo(-3);
    expect(r.z).toBeCloseTo(0.5);
  });
  it('then right, then the trail point', () => {
    const rightOnly = ports({ ray: world((d) => d.x < 0.5) });
    const r = findSpot(rightOnly.p, q, new RayBudget(), { next: 0 }) as Vec3;
    expect(r.x).toBeCloseTo(3);

    const trailPoint = v(0, 0, -9);
    const w = ports({ ray: world((d) => d.z > -0.5) });
    const t = findSpot(w.p, { ...q, trailPoint }, new RayBudget(8), { next: 0 });
    expect(t).toEqual(trailPoint);
  });
  it('uses the ground height under the candidate', () => {
    const { p } = ports({ ray: world(() => false, 1.5) });
    expect((findSpot(p, q, new RayBudget(), { next: 0 }) as Vec3).y).toBe(1.5);
  });
  it("returns 'unresident' when the player's ground is not resident outdoors", () => {
    const { p, raycast } = ports({ isResident: () => false });
    expect(findSpot(p, q, new RayBudget(), { next: 0 })).toBe('unresident');
    expect(raycast).not.toHaveBeenCalled();
  });
  it('skips a candidate that is not resident', () => {
    const { p } = ports({ ray: world(() => false), isResident: (_x, z) => z < 2.5 });
    const r = findSpot(p, q, new RayBudget(), { next: 0 }) as Vec3;
    expect(r.x).toBeCloseTo(-3);
  });
  it("returns 'later' when the budget runs out mid-search and continues from the cursor with a fresh budget", () => {
    const { p } = ports({ ray: world((d) => d.z > 0.5) });
    const cursor = { next: 0 };
    const first = new RayBudget(2);
    expect(findSpot(p, q, first, cursor)).toBe('later');
    expect(cursor.next).toBe(1);
    const r = findSpot(p, q, new RayBudget(2), cursor) as Vec3;
    expect(r.x).toBeCloseTo(-3);
  });
  it("'later' straight away when the budget cannot afford even one candidate", () => {
    const { p, raycast } = ports({ ray: world(() => false) });
    const cursor = { next: 0 };
    expect(findSpot(p, q, new RayBudget(1), cursor)).toBe('later');
    expect(cursor.next).toBe(0);
    expect(raycast).not.toHaveBeenCalled();
  });
  it("the default budget (6 rays) covers behind, left and right and then reports 'later' on the trail point", () => {
    const { p } = ports({ ray: world(() => true) });
    const cursor = { next: 0 };
    const r = findSpot(p, { ...q, trailPoint: v(0, 0, -9) }, new RayBudget(), cursor);
    expect(r).toBe('later');
    expect(cursor.next).toBe(3);
  });
  it("returns 'exhausted' outdoors when every candidate fails", () => {
    const { p } = ports({ ray: world(() => true) });
    expect(findSpot(p, { ...q, trailPoint: v(0, 0, -9) }, new RayBudget(8), { next: 0 })).toBe('exhausted');
  });
  it('and stays exhausted when the cursor is already past the end', () => {
    const { p } = ports({ ray: world(() => false) });
    expect(findSpot(p, q, new RayBudget(), { next: 3 })).toBe('exhausted');
  });
  it('rejects candidates more than 3 m above or below the player', () => {
    expect(findSpot(ports({ ray: world(() => false, 3.1) }).p, q, new RayBudget(), { next: 0 })).toBe('exhausted');
    expect(findSpot(ports({ ray: world(() => false, -3.1) }).p, q, new RayBudget(), { next: 0 })).toBe('exhausted');
    expect(findSpot(ports({ ray: world(() => false, 2.9) }).p, q, new RayBudget(), { next: 0 })).toEqual(v(0, 2.9, 3));
  });
  it('rejects a candidate with no ground (outdoors, miss and the heightfield far below)', () => {
    const { p } = ports({ ray: (_o, d) => (isDown(d) ? null : null) });
    // heightAt says 5 m, i.e. over the 3 m limit
    expect(findSpot(p, q, new RayBudget(), { next: 0 })).toBe('exhausted');
  });

  describe('indoors', () => {
    it('returns the indoorFallback when no candidate is on a grid', () => {
      const { p } = ports({ indoors: () => true, nav: { hasGrid: () => false } });
      const fb = v(7, 8, 9);
      expect(findSpot(p, { ...q, indoorFallback: fb }, new RayBudget(), { next: 0 })).toEqual(fb);
    });
    it("returns a copy of the player's feet when there is no fallback", () => {
      const { p } = ports({ indoors: () => true, nav: { hasGrid: () => false } });
      const r = findSpot(p, { player: v(1, 150, 2), playerYaw: 0 }, new RayBudget(), { next: 0 });
      expect(r).toEqual(v(1, 150, 2));
    });
    it('does not return a reference to the caller player object', () => {
      const { p } = ports({ indoors: () => true, nav: { hasGrid: () => false } });
      const pl = v(1, 150, 2);
      const r = findSpot(p, { player: pl, playerYaw: 0 }, new RayBudget(), { next: 0 });
      expect(r).not.toBe(pl);
    });
    it('does not report unresident or exhausted, even when nothing is resident', () => {
      const { p } = ports({ indoors: () => true, isResident: () => false });
      expect(findSpot(p, q, new RayBudget(), { next: 0 })).toEqual(player);
    });
    it('picks a candidate on a grid, never touching the heightfield', () => {
      const { p, heightAt } = ports({
        indoors: () => true,
        nav: { hasGrid: (at) => at.z > 2 && Math.abs(at.x) < 1, floorAt: () => 0 },
      });
      expect(findSpot(p, q, new RayBudget(), { next: 0 })).toEqual(v(0, 0, 3));
      expect(heightAt).not.toHaveBeenCalled();
    });
    it('with a grid on only a later candidate, skips the earlier ones', () => {
      const { p } = ports({
        indoors: () => true,
        nav: { hasGrid: (at) => at.x > 2, floorAt: () => 0 },
      });
      const r = findSpot(p, q, new RayBudget(), { next: 0 }) as Vec3;
      expect(r.x).toBeCloseTo(3);
    });
    it('falls back when the grid candidates are walled off', () => {
      const { p } = ports({
        indoors: () => true,
        nav: { hasGrid: () => true, floorAt: () => 0 },
        ray: world(() => true),
      });
      const fb = v(0, 0, -1);
      expect(findSpot(p, { ...q, indoorFallback: fb }, new RayBudget(), { next: 0 })).toEqual(fb);
    });
  });
});
