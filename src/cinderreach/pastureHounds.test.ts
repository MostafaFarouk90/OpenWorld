import { describe, expect, it } from 'vitest';
import { ACT2_SPAWNERS } from '../enemies/act2Spawners';
import { AI } from '../enemies/tuning';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';

/** Dialogue does not pause combat: no pasture hound may be able to notice Ketta's talk spot (sight/hearing plus pack share). */
describe('pasture hounds and Ketta', () => {
  const pos = new Map(CINDERREACH_LAYOUT.anchors.map((x) => [x.id, x]));
  const spawner = ACT2_SPAWNERS.find((s) => s.id === 'cinderreach.hounds.pasture')!;
  const reach = Math.max(AI.sightRange, AI.hearingLoud) + AI.packShareRadius;
  const spots = ['npc-post.ketta.pasture', 'cinderreach.post.pasture.1', 'cinderreach.r05.home'];
  const dist = (a: string, b: string) => {
    const p = pos.get(a)!, q = pos.get(b)!;
    return Math.hypot(p.x - q.x, p.z - q.z);
  };

  it('every hound member anchor exists', () => {
    expect(spawner.memberAnchors?.length).toBe(3);
    for (const id of spawner.memberAnchors ?? []) expect(pos.has(id), id).toBe(true);
  });
  it('Ketta spots lie outside every hound aggro radius', () => {
    for (const id of spawner.memberAnchors ?? []) for (const s of spots) expect(dist(id, s), `${id} to ${s}`).toBeGreaterThan(reach);
  });
  it('the check can fail: the old ring (compass 30, 150, 270 at 90 m) was inside', () => {
    const fold = pos.get('npc-post.ketta.pasture')!;
    const old = [30, 150, 270].map((h) => [17200 + 90 * Math.sin((h * Math.PI) / 180), 2900 + 90 * Math.cos((h * Math.PI) / 180)]);
    expect(Math.min(...old.map(([x, z]) => Math.hypot(x - fold.x, z - fold.z)))).toBeLessThan(reach);
  });
  it('respawn rules are unchanged', () => {
    expect(spawner.respawn).toBe('never');
    expect(spawner.leash).toBe(true);
  });
});
