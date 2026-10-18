import { describe, expect, it } from 'vitest';
import { routeFromAnchors, validateRoute } from '../chase/route';
import { M10_CHASE, MIN_CLASS_STAMINA } from '../chase/chases';
import { runPar, timerFor } from '../chase/solvability';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { COUNTING_HOUSE_DEF } from '../interiors/harrowmark';
import { resolveAnchor } from '../region/resolveLayout';
import { heightAt } from '../terrain/heightfield';
import { SECTIONS, validateSection } from './sections';

/** Thread 17's real Harrowmark anchors (PR #51), resolved on the real terrain as the game does. */
const anchors = new Map(HARROWMARK_LAYOUT.anchors.map((s) => [s.id, resolveAnchor(s, heightAt)]));
const find = (id: string) => anchors.get(id);

describe('stealth and chase on the real Harrowmark layout', () => {
  it('M06 South Gate: every anchor exists, hide spots keep 3 m from the gate-square patrol', () => {
    const def = SECTIONS.find((s) => s.id === 'm06.south-gate')!;
    const patrol = HARROWMARK_LAYOUT.patrols.find((p) => p.id === 'patrol.m06.gate-square')!;
    const pts = patrol.points.map((id) => find(id)!.position);
    const loop = patrol.loop ? [...pts, pts[0]] : pts;
    expect(validateSection(def, find, [loop])).toEqual([]);
  });

  it('M10 rooftops: the route reads, validates, and is solvable without the Leap at stamina 80', () => {
    const nodes = routeFromAnchors(find, M10_CHASE.routePrefix);
    expect(nodes).toHaveLength(16);
    expect(validateRoute(nodes)).toEqual([]);
    const timer = timerFor(nodes, MIN_CLASS_STAMINA);
    expect(Number.isFinite(timer)).toBe(true);
    expect(runPar(nodes, { maxStamina: MIN_CLASS_STAMINA, useLeap: false, timer, pace: 0.95 }).outcome).toBe('caught');
    expect(runPar(nodes, { maxStamina: MIN_CLASS_STAMINA, useLeap: false, neverSprint: true, timer }).outcome).toBe('lost');
  });

  it('M09 Counting House (thread 3a): every anchor exists, hide spots keep 3 m from both patrol loops', () => {
    const def = SECTIONS.find((s) => s.id === 'm09.counting-house')!;
    // Interior-local coordinates: distances are what matter, so the def's own frame is enough.
    const local = new Map(COUNTING_HOUSE_DEF.anchors.map((a) => [a.id, { id: a.id, position: { x: a.x, y: 0, z: a.z }, yaw: 0 }]));
    const loop = (prefix: string) => {
      const pts = [...local.values()].filter((a) => a.id.startsWith(prefix)).map((a) => a.position);
      expect(pts.length).toBeGreaterThan(1);
      return [...pts, pts[0]];
    };
    expect(validateSection(def, (id) => local.get(id), [loop('patrol.m09.hall.'), loop('patrol.m09.stacks.')])).toEqual([]);
  });
});
