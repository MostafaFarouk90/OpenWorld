// Fixes from the headless real-game run: every talk target stands on foot-reachable ground, one stoop pair arms per haul.
import { afterEach, describe, expect, it } from 'vitest';
import { dragonspineBuild } from '../../../../dragonspine/layout';
import { DRAGONSPINE_POST_RULES } from '../../../../dragonspine/postRules';
import { DRAGONSPINE_QUEST_DEFS } from './dragonspine.content';
import { DRAGONSPINE_SPAWNERS } from './spawners';
import { M28_HUNTERS } from './m28.quest';
import { R15_HAULING, R15_SLEDS, R15_SLED_FLAGS, R15_STOOP_FLAGS } from './r15.quest';
import { makeRig, type Rig } from './director/rig.testkit';
import { autoplay, autoplayAll, haulSled } from './director/autoplay.testkit';
import { routeById } from './director/climb';

const anchors = dragonspineBuild().layout.anchors as Array<{ id: string; dy?: number; tags?: string[] }>;

describe('every K13 talk target can be reached on foot', () => {
  const targets = [...new Set(DRAGONSPINE_QUEST_DEFS.flatMap((q) => q.objectives).filter((o) => o.type === 'talk').map((o) => String(o.target)))]
    .filter((t) => !t.startsWith('scene.'));
  it('has talk targets to check', () => { expect(targets.length).toBeGreaterThan(8); });
  it.each(targets)('%s: its NPC post is at ground level and not tagged elevated', (t) => {
    const posts = anchors.filter((a) => a.id.startsWith(`npc-post.${t}`) && !a.id.endsWith('.out'));
    expect(posts.length, `post anchors for ${t}`).toBeGreaterThan(0);
    for (const p of posts) {
      expect(p.dy ?? 0, p.id).toBe(0);
      expect(p.tags ?? [], p.id).not.toContain('elevated');
    }
  });
  it('M28 no longer sends Cael to the tower hunter', () => {
    expect(M28_HUNTERS).not.toContain('lodge-hunter-3');
    expect(M28_HUNTERS).toHaveLength(4);
    expect(DRAGONSPINE_POST_RULES.length).toBeGreaterThan(0);
  });
});

describe('R15 stoops: one pair per haul', () => {
  it('the three stoop groups hold two hawks each and are armed by three different flags', () => {
    const groups = DRAGONSPINE_SPAWNERS.filter((s) => s.id.startsWith('dragonspine.q.r15.stoop.'));
    expect(groups).toHaveLength(3);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(6);
    const flags = groups.map((g) => (g.activation as { flag: string }).flag);
    expect(new Set(flags).size).toBe(3);
    expect(flags).toEqual([...R15_STOOP_FLAGS]);
    expect(flags).not.toContain(R15_HAULING);
  });

  let rig: Rig | null = null;
  afterEach(() => { rig?.dispose(); rig = null; });
  const toHauls = (): Rig => {
    const r = (rig = makeRig({ flags: { 'story.gate.a3': true } }));
    autoplayAll(r, ['m28']);
    r.manager.start('r15');
    autoplay(r, 'r15', { stopAt: ['r15', 'hauls'] });
    r.step(2);
    return r;
  };
  const armed = (r: Rig): number[] => R15_STOOP_FLAGS.map((f, i) => (r.flag(f) ? i + 1 : 0)).filter(Boolean);
  const take = (r: Rig, n: number): void => {
    r.player.feet = { ...routeById(R15_SLEDS[n - 1]!)!.checkpoints[0]! };
    expect(r.sleds.take(R15_SLEDS[n - 1]!)).toBe(true);
  };

  it('taking sled N arms only stoop group N, and setting it down stands it down', () => {
    const r = toHauls();
    expect(armed(r)).toEqual([]);
    for (const n of [1, 2, 3]) {
      take(r, n);
      expect(armed(r), `haul ${n}`).toEqual([n]);
      r.sleds.drop();
      r.step(2);
      expect(armed(r)).toEqual([]);
      if (n < 3) haulSled(r, n); else expect(R15_SLED_FLAGS.length).toBe(3);
    }
  });

  it('a retried haul arms the same group again, and a load mid-haul leaves none armed', () => {
    const r = toHauls();
    haulSled(r, 1);
    take(r, 2);
    expect(armed(r)).toEqual([2]);
    r.saveLoad();
    expect(armed(r)).toEqual([]);
    r.sleds.drop?.();
    haulSled(r, 2);
    take(r, 3);
    expect(armed(r)).toEqual([3]);
  });

  it('the three hauls still finish R15', () => {
    const r = toHauls();
    [1, 2, 3].forEach((n) => haulSled(r, n));
    expect(r.done('r15', 'hauls')).toBe(true);
    expect(armed(r)).toEqual([]);
  });
});
