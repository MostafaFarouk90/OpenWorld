// M15's hunters' camp (`m15.camp`) on the real Cinderreach layout: the watch guards as their spawner places them, the camp's
// props as sight blockers, and a careful player sneaking the road-side approach round either side of the south tent.
import { describe, expect, it } from 'vitest';
import { CINDERREACH_LAYOUT } from '../cinderreach/cinderreach.layout';
import { CINDER_KINDS } from '../cinderreach/structureKinds';
import { patrolForSlot } from '../enemies/spawners';
import { AI } from '../enemies/tuning';
import { ACT2_SPAWNERS_A12 } from '../quests/content/act2/spawners';
import { CALM, IDLE_PLAYER, detectTick } from './detection';
import type { P3 } from './perceptionPort';
import { SECTIONS, validateSection } from './sections';
import { KinematicPatrol, boxLineOfSight, runScript, type ScriptStep, type SolidBox } from './testing/patrolSim';

const anchors = new Map(CINDERREACH_LAYOUT.anchors.map((a) => [a.id, { id: a.id, position: { x: a.x, y: 0, z: a.z }, yaw: 0 }]));
const find = (id: string) => anchors.get(id);
const at = (id: string): P3 => {
  const a = find(id);
  if (!a) throw new Error(`missing anchor ${id}`);
  return { ...a.position };
};
const section = SECTIONS.find((s) => s.id === 'm15.camp')!;
const watch = ACT2_SPAWNERS_A12.find((s) => s.id === section.guardGroups[0])!;
const loop = (watch.patrol as string[]).map(at);

/** The camp's solid props as sight blockers, at their kinds' heights (tents 3.2 m, cages 2.4 m, desks 1.1 m, crates 1.4 m). */
const campSolids = CINDERREACH_LAYOUT.structures.filter((s) => s.mode === 'solid' && s.id.startsWith('cinderreach-camp-'));
const SOLIDS: SolidBox[] = campSolids.map((s) => {
  const [w, d] = s.footprint;
  return { minX: s.x - w / 2, maxX: s.x + w / 2, minZ: s.z - d / 2, maxZ: s.z + d / 2, top: s.height ?? CINDER_KINDS[s.kind]?.height ?? 1.4 };
});
const los = boxLineOfSight(SOLIDS);
const tent = campSolids.find((s) => s.id === 'cinderreach-camp-tent-3')!; // the south tent, between the start and the camp

/** Each watch guard as the runtime walks it: from its member anchor to its slot's first waypoint, then round the loop. */
const guards = (phase: number) =>
  Array.from({ length: watch.count }, (_, k) => {
    const route = patrolForSlot(loop, k, watch.patrolStride).map((p) => ({ x: p.x, y: 0, z: p.z }));
    return new KinematicPatrol(route, 1.4, phase, at(watch.memberAnchors![k]));
  });

/** A careful player stands at the start until no guard they can see from there is within 22 m (beyond an upright sight range). */
const CAREFUL_RANGE = 22;
const clear = (feet: P3, gs: readonly KinematicPatrol[]) =>
  gs.every((g) => Math.hypot(g.feet.x - feet.x, g.feet.z - feet.z) >= CAREFUL_RANGE || !los({ ...feet, y: 1.5 }, { ...g.feet, y: 1.5 }));

const sneak = (to: P3): ScriptStep => ({ to, sneak: true });
const start = at('cinderreach.stealth.m15.start');
const inside = at('cinderreach.stealth.m15.cp.inside');
const end = at('cinderreach.stealth.m15.end');
/** Round the south tent on its west or east side (4 m off its centre line), up to the inside checkpoint, on to the cage. */
const lanes: Record<'west' | 'east', ScriptStep[]> = {
  west: [sneak({ x: tent.x - 4, y: 0, z: tent.z - 4 }), sneak({ x: tent.x - 4, y: 0, z: tent.z + 6 }), sneak(inside), sneak(end)],
  // East of the tent the carter's cage stands by the checkpoint: step back to the centre line before going up.
  east: [sneak({ x: tent.x + 4, y: 0, z: tent.z - 4 }), sneak({ x: tent.x + 4, y: 0, z: tent.z + 5 }), sneak({ x: tent.x, y: 0, z: tent.z + 7 }), sneak(inside), sneak(end)],
};
/** One full patrol lap and more (8 legs of about 27.5 m at 1.4 m/s with a 2 s wait at each node), every 2 s. */
const PHASES = Array.from({ length: 90 }, (_, i) => i * 2);

describe('M15 hunters\' camp stealth (real layout)', () => {
  it('every anchor exists, the hide spots keep 3 m from the watch loop, the guards spawn on their slot\'s first node', () => {
    expect(validateSection(section, find, [[...loop, loop[0]]])).toEqual([]);
    expect(watch.enemy).toBe('watch-guard');
    // patrolForSlot starts member k at waypoint k: spawned anywhere else the guard first walks across the camp to it.
    watch.memberAnchors!.forEach((a, k) => expect(at(a)).toEqual(loop[(k * (watch.patrolStride ?? 1)) % loop.length]));
  });

  it('the three guards start spread round the loop: the largest gap between neighbours is at most 45% of it', () => {
    const legs = loop.map((p, i) => Math.hypot(loop[(i + 1) % loop.length].x - p.x, loop[(i + 1) % loop.length].z - p.z));
    const total = legs.reduce((s, l) => s + l, 0);
    const starts = Array.from({ length: watch.count }, (_, k) => (k * (watch.patrolStride ?? 1)) % loop.length).sort((a, b) => a - b);
    const along = (i: number) => legs.slice(0, i).reduce((s, l) => s + l, 0);
    const gaps = starts.map((s, i) => (i + 1 < starts.length ? along(starts[i + 1]) : total + along(starts[0])) - along(s));
    expect(Math.max(...gaps) / total).toBeLessThanOrEqual(0.45);
    // And the routes the runtime walks really start there (patrolForSlot rotates the list).
    starts.forEach((s, i) => expect(patrolForSlot(loop, i, watch.patrolStride)[0]).toEqual({ x: loop[s].x, z: loop[s].z }));
  });

  it('a guard spawned on its first waypoint faces the next one, not the zero vector (sim yaw)', () => {
    const route = patrolForSlot(loop, 0, watch.patrolStride).map((p) => ({ x: p.x, y: 0, z: p.z }));
    const g = new KinematicPatrol(route, 1.4, 0, at(watch.memberAnchors![0]));
    expect(g.yaw).toBeCloseTo(Math.atan2(-(route[1].x - route[0].x), -(route[1].z - route[0].z)), 6);
  });

  it('the watch loop goes round the camp, at least 3 m clear of every prop (no leg grazes a tent)', () => {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      for (const s of SOLIDS) {
        // Sample the leg against the prop's box.
        for (let t = 0; t <= 1; t += 0.01) {
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          const dx = Math.max(s.minX - x, 0, x - s.maxX);
          const dz = Math.max(s.minZ - z, 0, z - s.maxZ);
          expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('the start checkpoint is beyond sneaking sight of the loop and inside upright sight of it', () => {
    let d = Infinity;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((start.x - a.x) * dx + (start.z - a.z) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(start.x - (a.x + dx * t), start.z - (a.z + dz * t)));
    }
    expect(d).toBeGreaterThan(AI.sightRange * 0.5 + 1); // 9 m sneaking
    expect(d).toBeLessThan(AI.sightRange); // 18 m upright
  });

  for (const lane of ['west', 'east'] as const) {
    it(`a careful sneak round the ${lane} side of the south tent reaches the cage unseen at every patrol phase`, () => {
      const bad: string[] = [];
      for (const phase of PHASES) {
        const script: ScriptStep[] = [{ until: clear, max: 150, sneak: true }, ...lanes[lane]];
        const r = runScript(start, script, guards(phase), los);
        if (r.noticed || r.caught) bad.push(`phase ${phase}: noticed ${r.noticed}, caught ${r.caught}, watched ${r.watched.toFixed(1)} s`);
        // The watch never pins the player at the start: a gap comes within one loop.
        expect(r.watched).toBeLessThan(150);
      }
      expect(bad).toEqual([]);
    });
  }

  it('it is not trivial: walking in upright, or sneaking in without watching, is noticed at some phases', () => {
    const upright = PHASES.filter((p) => runScript(start, lanes.west, guards(p), los, true).noticed > 0);
    const headlong = PHASES.filter((p) => runScript(start, lanes.east, guards(p), los).noticed > 0);
    expect(upright.length).toBeGreaterThan(0);
    expect(headlong.length).toBeGreaterThan(0);
  });

  it('a walking or sprinting player in a watch guard\'s cone is still noticed; a sneaking one at the same spot is not', () => {
    // A guard on the loop's south leg looking along it, the player 12 m ahead in the open (beyond sneaking sight, inside upright sight).
    const guard = { feet: { x: 0, y: 0, z: 0 }, yaw: 0 };
    const feet = { x: 0, y: 0, z: -12 };
    const run = (player: typeof IDLE_PLAYER, seconds: number) => {
      let s = { awareness: 0, alert: CALM };
      let noticedAt = -1;
      for (let i = 0; i < seconds * 60; i++) {
        const r = detectTick(guard, feet, player, s, 1 / 60);
        s = { awareness: r.awareness, alert: r.alert };
        if (r.awareness >= 1 && noticedAt < 0) noticedAt = i / 60;
      }
      return noticedAt;
    };
    const walking = run({ ...IDLE_PLAYER, moving: true }, 10);
    const sprinting = run({ ...IDLE_PLAYER, moving: true, loud: true }, 10);
    expect(walking).toBeGreaterThan(0);
    expect(walking).toBeLessThan(3);
    expect(sprinting).toBeGreaterThan(0);
    expect(sprinting).toBeLessThan(3);
    expect(run({ ...IDLE_PLAYER, moving: true, sneaking: true }, 10)).toBe(-1);
  });
});
