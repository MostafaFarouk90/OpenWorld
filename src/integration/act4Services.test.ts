import { describe, expect, it } from 'vitest';
import { REFUGE_STONE, servicesAfterM41, unreachable, harrowmarkVendors, type ServicePorts } from './act4Services';
import { COMPANION_IDS } from '../companions/ids';
import { DEFAULT_KITS, trainerAnchor } from '../classes/kits';
import { CITY_CENTRE } from '../harrowmark/noStrand';
import type { VendorId } from '../economy/stock';

const CITY = { x: CITY_CENTRE.x, z: CITY_CENTRE.z };
const REFUGE = { x: 10000, z: 4450 };
const flags = (on: string[]) => ({ getFlag: (k: string) => on.includes(k) || undefined }) as never;

/** Every shipped shop and desk inside the city, every refuge anchor at the refuge. */
function ports(over: Partial<ServicePorts> = {}): ServicePorts {
  return {
    flags: flags(['story.m38.complete', 'story.m41.complete']),
    anchor: (id) => (id.startsWith('ashgate.') || id === `waystone.${REFUGE_STONE}` ? REFUGE : id.startsWith('shop.') && ['wystan', 'merrin', 'aldous'].some((v) => id.endsWith(v)) ? CITY : id.startsWith('harrowmark.') ? CITY : undefined),
    vendorOpen: (v) => v !== 'aldous',
    stoneLit: () => true,
    stoneDark: () => false,
    vendorPosts: [],
    trainerPosts: [],
    ...over,
  };
}

describe('services reachable after M41', () => {
  it('lists the Harrowmark vendors by their shipped shop inside the walls', () => {
    expect(harrowmarkVendors(ports().anchor).sort()).toEqual(['aldous', 'merrin', 'wystan']);
  });

  it('with no moved posts every Harrowmark service is named as stuck inside, and Aldous (closed) is not a service', () => {
    const rows = servicesAfterM41(ports());
    const bad = unreachable(rows);
    expect(bad).toContain('vendor wystan: shop.wystan stands inside the held walls');
    expect(bad.some((b) => b.startsWith('vendor aldous'))).toBe(false);
    for (const k of Object.values(DEFAULT_KITS)) expect(bad.join('\n')).toContain(trainerAnchor(k));
    // Companions already move to the refuge from M38 (partyPost).
    expect(rows.filter((r) => r.kind === 'companion').every((r) => r.reachable)).toBe(true);
    expect(rows.filter((r) => r.kind === 'companion').map((r) => r.id)).toEqual([...COMPANION_IDS]);
  });

  it('with the refuge rows in place everything is reachable', () => {
    const posts = (['wystan', 'merrin'] as VendorId[]).map((v) => ({ vendorId: v, anchorId: `ashgate.refuge.shop.${v}`, when: { all: ['story.m41.complete'] } }));
    const desks = Object.values(DEFAULT_KITS).map((k) => ({ npcId: k.trainer.npcId, post: `ashgate.refuge.trainer.${k.trainer.npcId}`, when: { all: ['story.m41.complete'] } }));
    const rows = servicesAfterM41(ports({ vendorPosts: posts, trainerPosts: desks }));
    expect(unreachable(rows)).toEqual([]);
    expect(rows.find((r) => r.kind === 'vendor' && r.id === 'wystan')!.anchor).toBe('ashgate.refuge.shop.wystan');
  });

  it('names a missing anchor and an unlit or dark refuge stone', () => {
    const noStone = servicesAfterM41(ports({ stoneLit: () => false }));
    expect(unreachable(noStone)).toContain(`travel ${REFUGE_STONE}: the refuge stone is not lit`);
    const dark = servicesAfterM41(ports({ stoneDark: () => true }));
    expect(unreachable(dark)).toContain(`travel ${REFUGE_STONE}: the refuge stone is dark`);
    const missing = servicesAfterM41(ports({ anchor: (id) => (id.startsWith('shop.wystan') ? CITY : undefined) }));
    expect(unreachable(missing)).toContain(`travel ${REFUGE_STONE}: anchor waystone.${REFUGE_STONE} is not placed`);
  });
});
