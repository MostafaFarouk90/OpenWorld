import { describe, expect, it } from 'vitest';
import { AnchorRegistry } from '../../layout/AnchorRegistry';
import { partyPost } from '../CompanionController';
import {
  BENCH_FALLBACK_RADIUS,
  BENCHED_IDS,
  benchPostFor,
  campPost,
  defineBenchPosts,
  l1RefugeSpot,
  refugePost,
} from './benchPosts';

const flags = (...on: string[]) => ({ getFlag: (k: string) => on.includes(k) });

describe('benchPostFor', () => {
  it('walks the Anvil, then the M41 camp, then the refuge', () => {
    expect(benchPostFor('tobb')).toBe('npc-post.tobb.tilted-anvil');
    expect(benchPostFor('tobb', flags())).toBe('npc-post.tobb.tilted-anvil');
    expect(benchPostFor('tobb', flags('story.m38.complete'))).toBe('harrowmark.a4.m41.camp.companions.tobb');
    expect(benchPostFor('tobb', flags('story.m38.complete', 'story.m41.complete'))).toBe('ashgate.refuge.companions.tobb');
  });

  it('never leaves the Anvil on M41 alone (a broken save without M38 keeps the shipped post)', () => {
    expect(benchPostFor('hrolf', flags('story.m41.complete'))).toBe('npc-post.hrolf.tilted-anvil');
  });

  it('is what the controller reads', () => {
    for (const f of [flags(), flags('story.m38.complete'), flags('story.m38.complete', 'story.m41.complete')]) {
      expect(partyPost('aelfreda', f)).toBe(benchPostFor('aelfreda', f));
    }
  });
});

describe('defineBenchPosts', () => {
  it('defines nothing before the bases exist, and stays idempotent', () => {
    const a = new AnchorRegistry();
    expect(defineBenchPosts(a)).toBe(0);
    a.define({ id: 'harrowmark.a4.m41.camp', position: { x: 8915, y: 27, z: 3330 }, yaw: 0 });
    expect(defineBenchPosts(a)).toBe(3);
    expect(defineBenchPosts(a)).toBe(3);
  });

  it('rings the companions 2 m round the camp and the refuge rest, apart from each other', () => {
    const a = new AnchorRegistry();
    a.define({ id: 'harrowmark.a4.m41.camp', position: { x: 100, y: 5, z: 200 }, yaw: 0.4 });
    a.define({ id: 'ashgate.refuge.rest', position: { x: -50, y: 9, z: 10 }, yaw: 0 });
    expect(defineBenchPosts(a)).toBe(6);
    for (const [base, post] of [[{ x: 100, z: 200 }, campPost], [{ x: -50, z: 10 }, refugePost]] as const) {
      const spots = BENCHED_IDS.map((id) => a.get(post(id)).position);
      for (const p of spots) expect(Math.hypot(p.x - base.x, p.z - base.z)).toBeCloseTo(BENCH_FALLBACK_RADIUS, 6);
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(3);
      }
    }
  });

  it("takes L1's per-companion refuge spot over the ring", () => {
    const a = new AnchorRegistry();
    a.define({ id: 'ashgate.refuge.rest', position: { x: 0, y: 0, z: 0 }, yaw: 0 });
    a.define({ id: l1RefugeSpot('hrolf'), position: { x: 7, y: 1, z: -3 }, yaw: 1.2 });
    defineBenchPosts(a);
    expect(a.get(refugePost('hrolf'))).toMatchObject({ position: { x: 7, y: 1, z: -3 }, yaw: 1.2 });
    expect(Math.hypot(a.get(refugePost('tobb')).position.x, a.get(refugePost('tobb')).position.z)).toBeCloseTo(2, 6);
  });
});
