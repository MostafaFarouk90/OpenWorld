// Act 4 thread L1: the Act 4 world's anchors, the refuge's layout and the master positions (plans/act4-L1.md 1 and 6).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CENTER, RING_RADIUS, gatePosition } from '../../harrowmark/city';
import { heightAt } from '../../terrain/heightfield';
import { ASHGATE_PLATEAU, CALDERA_BOX, NE_GATE, WASTE_BOX } from '../../terrain/shape/waste';
import { renderAnchorsDoc } from '../anchorsDoc';
import { ACT4_PLACES, REFUGE_NPCS, REFUGE_POSTS, REFUGE_TRAINERS, REFUGE_VENDORS, SHOP_OFFSET, TRAINER_OFFSET, refugeShop, refugeTrainer } from './act4Places';
import { ACT4_WORLD_DOC, ACT4_WORLD_LAYOUT } from './act4World.layout';

const ids = ACT4_WORLD_LAYOUT.anchors.map((a) => a.id);
const anchor = (id: string) => {
  const a = ACT4_WORLD_LAYOUT.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const PREFIXES = ['ashroad.', 'ashgate.', 'waste.', 'harrowmark.a4.', 'waystone.', 'npc-post.'];

describe('ACT4_WORLD_ANCHORS.md', () => {
  it('matches the layout (regenerate with npx vite-node tools/gen-region-docs.ts)', () => {
    expect(readFileSync('src/region/act4/ACT4_WORLD_ANCHORS.md', 'utf8')).toBe(renderAnchorsDoc(ACT4_WORLD_LAYOUT, ACT4_WORLD_DOC));
  });
});

describe('the Act 4 world layout', () => {
  it('has unique ids, all under the Act 4 prefixes (or the contract waystone and post names)', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(PREFIXES.some((p) => id.startsWith(p)), id).toBe(true);
    for (const t of ACT4_WORLD_LAYOUT.triggers) expect(t.id.startsWith('trg.waste.'), t.id).toBe(true);
  });

  it('defines every id L0 reserved and the other threads asked for', () => {
    for (const id of [
      'harrowmark.a4.m41.camp',
      'ashgate.refuge.rest',
      'ashgate.refuge.companions',
      'waste.glasslands.singing-slag',
      'waste.rimfoot.fire',
      'waystone.ashgate',
      'ashgate.horse-post',
      'npc-post.hild',
      'ashgate.shop.hild',
      'ashgate.refuge.anvil',
      'ashgate.refuge.companion.tobb',
      'ashgate.refuge.companion.hrolf',
      'ashgate.refuge.companion.aelfreda',
      ...REFUGE_NPCS.map((n) => `npc-post.${n}.refuge`),
      ...REFUGE_VENDORS.map((v) => `ashgate.refuge.shop.${v}`),
      ...REFUGE_TRAINERS.map((t) => `ashgate.refuge.trainer.${t}`),
    ]) {
      expect(ids, id).toContain(id);
    }
    expect(ACT4_WORLD_LAYOUT.triggers.map((t) => t.id).sort()).toEqual(['trg.waste.cinder-chapel', 'trg.waste.husk-cathedral', 'trg.waste.rimfoot', 'trg.waste.walker-camp']);
  });

  it('puts the north-east gate where the city has it, and the M41 camp outside the wall', () => {
    const g = gatePosition('northeast');
    expect(Math.hypot(NE_GATE[0] - g.x, NE_GATE[1] - g.z)).toBeLessThan(0.5);
    const c = anchor('harrowmark.a4.m41.camp');
    expect(Math.hypot(c.x - CENTER.x, c.z - CENTER.z)).toBeGreaterThan(RING_RADIUS + 50);
  });
});

describe('Ashgate and its refuge', () => {
  const refugeIds = ids.filter((id) => id.startsWith('ashgate.') || id.endsWith('.refuge') || id === 'npc-post.hild' || id === 'waystone.ashgate');

  it('sit on Ashgate plateau, south of the Waste box', () => {
    const b = ASHGATE_PLATEAU.box;
    for (const id of refugeIds) {
      const a = anchor(id);
      expect(a.x >= b.minX && a.x <= b.maxX && a.z >= b.minZ && a.z <= b.maxZ, id).toBe(true);
      expect(a.z, id).toBeLessThan(WASTE_BOX.z0);
      expect(heightAt(a.x, a.z), id).toBeCloseTo(ASHGATE_PLATEAU.height, 3);
    }
  });

  it('keeps every talk post, the waystone and the rest point at least 3 m from each other (focus)', () => {
    const focus = ids.filter((id) => id.startsWith('npc-post.') || id === 'waystone.ashgate' || id === 'ashgate.refuge.rest' || id.startsWith('ashgate.refuge.companion.'));
    for (let i = 0; i < focus.length; i++) {
      for (let j = i + 1; j < focus.length; j++) {
        const a = anchor(focus[i]);
        const b = anchor(focus[j]);
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${focus[i]} and ${focus[j]}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('puts each shop 1.6 m and each trainer spot 2.5 m from its own post, and nearer it than any other post', () => {
    const posts = REFUGE_NPCS.map((n) => REFUGE_POSTS[n]);
    const nearestPost = (p: readonly [number, number]) => posts.reduce((best, q) => (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(p[0] - best[0], p[1] - best[1]) ? q : best));
    for (const v of REFUGE_VENDORS) {
      const s = refugeShop(v);
      expect(Math.hypot(s[0] - REFUGE_POSTS[v][0], s[1] - REFUGE_POSTS[v][1])).toBeCloseTo(SHOP_OFFSET, 6);
      expect(nearestPost(s)).toBe(REFUGE_POSTS[v]);
    }
    for (const t of REFUGE_TRAINERS) {
      const s = refugeTrainer(t);
      expect(Math.hypot(s[0] - REFUGE_POSTS[t][0], s[1] - REFUGE_POSTS[t][1])).toBeCloseTo(TRAINER_OFFSET, 6);
      expect(nearestPost(s)).toBe(REFUGE_POSTS[t]);
    }
  });
});

describe('the master positions', () => {
  it('put every Waste site inside the Waste and outside the Caldera hole, Ashgate outside the Waste', () => {
    for (const id of ['crossing', 'walker-camp', 'r24-spring', 'cinder-chapel', 'glasslands', 'husk-cathedral', 'rimfoot'] as const) {
      const p = ACT4_PLACES[id];
      expect(p.x >= WASTE_BOX.x0 && p.x < WASTE_BOX.x1 && p.z >= WASTE_BOX.z0 && p.z < WASTE_BOX.z1, id).toBe(true);
      expect(p.x >= CALDERA_BOX.x0 && p.x < CALDERA_BOX.x1 && p.z >= CALDERA_BOX.z0 && p.z < CALDERA_BOX.z1, id).toBe(false);
    }
    expect(ACT4_PLACES.ashgate.z).toBeLessThan(WASTE_BOX.z0);
  });

  it('keep the distances the plan publishes (straight line, plus or minus 5%)', () => {
    const d = (a: keyof typeof ACT4_PLACES, b: keyof typeof ACT4_PLACES) => Math.hypot(ACT4_PLACES[a].x - ACT4_PLACES[b].x, ACT4_PLACES[a].z - ACT4_PLACES[b].z);
    const within = (v: number, km: number) => expect(Math.abs(v / 1000 - km) / km).toBeLessThan(0.05);
    within(d('ashgate', 'walker-camp'), 2.16);
    within(d('walker-camp', 'cinder-chapel'), 2.35);
    within(d('glasslands', 'husk-cathedral'), 2.26);
    within(d('ashgate', 'rimfoot'), 2.0);
    within(d('ashgate', 'husk-cathedral'), 5.13);
    within(d('walker-camp', 'r24-spring'), 1.5);
  });

  it('give each site its ground height', () => {
    for (const [id, p] of Object.entries(ACT4_PLACES)) if (id !== 'sunforge-column') expect(p.y, id).toBeCloseTo(heightAt(p.x, p.z), 1);
  });
});
