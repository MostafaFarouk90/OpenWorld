// The env colliders in a real Rapier world: the streamer adds and removes static cuboids as a body walks, the boxes sit where the pure builder says
// (yaw and all), and the chase line, the lanes and the doors stay open at waist height all the way along.
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { CROWD_LANES, DOORS, HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { chaseLines, defaultKeepOut, MIN_LANE_CLEARANCE, CHASE_HALF_WIDTH } from './colliderKeepOut';
import { ColliderStreamer } from './colliderStreamer';
import { buildTileColliders } from './colliders';
import { TILES } from './tiles';

let physics: PhysicsWorld;
let streamer: ColliderStreamer;
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  streamer = new ColliderStreamer({ rapier: physics.rapier, physics, heightAt });
  const ko = defaultKeepOut();
  for (const t of ['h1', 'h2', 'h3', 'h4']) streamer.addBoxes(buildTileColliders(t, TILES[t]!, ko).boxes);
});
afterAll(() => {
  streamer.dispose();
  physics.dispose();
});

/** Stands the "player" at (x, z): loads the cells around it (one per update, so a few updates), then lets Rapier see them. */
function standAt(x: number, z: number): void {
  for (let i = 0; i < 6; i++) streamer.update(x, z);
  physics.step();
}
/** Distance from the waist (0.5 m up) at (x, z) to the nearest env collider; 0 inside one. */
function waistClearance(x: number, z: number): number {
  const at = { x, y: heightAt(x, z) + 0.5, z };
  const pr = physics.world.projectPoint(at, false);
  if (!pr) return Infinity;
  return pr.isInside ? 0 : Math.hypot(pr.point.x - at.x, pr.point.y - at.y, pr.point.z - at.z);
}
const along = (pts: ReadonlyArray<readonly [number, number]>, step: number): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
};

describe('env colliders in Rapier', () => {
  it('creates real static cuboids near the player and none far away', () => {
    standAt(8100, 1500); // Forge Row
    expect(streamer.liveColliders).toBeGreaterThan(20);
    const near = streamer.liveColliders;
    // far away (the south gate, 300 m off): the Forge Row cells go
    standAt(8500, 1260);
    for (let i = 0; i < 4; i++) standAt(8500, 1260);
    expect(streamer.liveColliders).not.toBe(near);
    expect(waistClearance(8100, 1500)).toBeGreaterThan(0); // not inside anything, and the cells there are gone
    expect(physics.world.colliders.len()).toBe(streamer.liveColliders);
  });

  it('is solid where a Forge Row fence stands, and a hit on its face stops a ray', () => {
    const fence = buildTileColliders('h4', TILES.h4!, defaultKeepOut()).boxes.find((b) => b.id === 'wattle-fence' && b.hx > 5)!;
    standAt(fence.cx, fence.cz);
    expect(waistClearance(fence.cx, fence.cz)).toBe(0);
    // a ray along the fence's own thin axis from 4 m away hits its side at the right distance
    const nz = Math.cos(fence.yaw);
    const nx = Math.sin(fence.yaw);
    const g = heightAt(fence.cx, fence.cz) + 0.8;
    const hit = physics.raycast({ x: fence.cx - nx * 4, y: g, z: fence.cz - nz * 4 }, { x: nx, y: 0, z: nz }, 10);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(4 - fence.hz, 1);
  });

  it('keeps the M10 chase line (and its alternative) open 1.5 m each side at waist height, loading cells as it goes', () => {
    let peak = 0;
    for (const l of chaseLines([HARROWMARK_LAYOUT])) {
      for (const [x, z] of along(l.points, 3)) {
        standAt(x, z);
        peak = Math.max(peak, streamer.liveColliders);
        expect(waistClearance(x, z), `${l.id} at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeGreaterThanOrEqual(CHASE_HALF_WIDTH - 0.05);
      }
    }
    expect(peak).toBeLessThan(900);
  });

  it('keeps every crowd lane open to its half width', () => {
    const at = new Map(HARROWMARK_LAYOUT.anchors.map((a) => [a.id, a] as const));
    for (const lane of CROWD_LANES) {
      const pts = lane.points.map((id) => at.get(id)!).map((a) => [a.x, a.z] as const);
      if (lane.loop) pts.push(pts[0]!);
      for (const [x, z] of along(pts, 4)) {
        standAt(x, z);
        expect(waistClearance(x, z), `${lane.id} at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeGreaterThanOrEqual(Math.max(lane.halfWidth, MIN_LANE_CLEARANCE) - 0.05);
      }
    }
  });

  it('keeps the door arrival points open', () => {
    for (const d of DOORS) {
      standAt(d.x, d.z);
      expect(waistClearance(d.x, d.z), d.doorId).toBeGreaterThanOrEqual(2 - 0.05);
    }
  });

  it('removes everything on dispose', () => {
    streamer.dispose();
    physics.step();
    expect(physics.world.colliders.len()).toBe(0);
    expect(streamer.liveColliders).toBe(0);
  });
});
