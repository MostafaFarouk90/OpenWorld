import { describe, expect, it } from 'vitest';
import { applyEraKit, ERA_PARTY, ERA_TEMPER, eraGear, suitsClass, wantsEraKit, type EraKitPorts } from './act3EraKit';
import { getItem } from '../inventory/items';
import '../gear/catalog';
import '../gear/tier4/catalog';
import { SKILLS } from '../progression/skills';

function harness(opts: { items?: Record<string, number>; equipped?: Record<string, string>; points?: number; flaskCap?: number; refuseParty?: boolean } = {}) {
  const counts = new Map(Object.entries(opts.items ?? { 'squires-arming-sword': 1, 'wooden-round-shield': 1, 'gauts-spare-tabard': 1, 'healing-flask': 3 }));
  const slots = new Map(Object.entries(opts.equipped ?? { weapon: 'squires-arming-sword', offhand: 'wooden-round-shield', armour: 'gauts-spare-tabard' }));
  const temper = new Map<string, number>();
  const learned: string[] = [];
  let points = opts.points ?? 15;
  const anvil: number[] = [];
  let party: readonly string[] | null = null;
  const cap = (id: string) => (id === 'healing-flask' ? (opts.flaskCap ?? 5) : (getItem(id)?.stackMax ?? 1));
  const ports: EraKitPorts = {
    inventory: {
      has: (id) => (counts.get(id) ?? 0) > 0,
      add: (id, n) => {
        if (!getItem(id)) return 0;
        const have = counts.get(id) ?? 0;
        const add = Math.min(n, cap(id) - have);
        if (add > 0) counts.set(id, have + add);
        return Math.max(0, add);
      },
      count: (id) => counts.get(id) ?? 0,
      capOf: cap,
      items: () => [...counts].map(([id, count]) => ({ id, count })),
      equip: (id) => {
        const slot = getItem(id)?.slot;
        if (!slot || !counts.get(id)) return { ok: false };
        slots.set(slot, id);
        return { ok: true };
      },
      equipped: (slot) => slots.get(slot) ?? null,
      gear: (id) => ({ temper: temper.get(id) ?? 0 }),
      setTemper: (id, level) => (temper.set(id, level), true),
    },
    itemInfo: (id) => {
      const d = getItem(id);
      return d ? { slot: d.slot, stat: d.slot === 'weapon' ? (d.stats?.attack ?? 0) : (d.stats?.defense ?? 0) } : undefined;
    },
    progression: {
      get skillPoints() { return points; },
      learn: (id) => {
        const s = SKILLS.find((x) => x.id === id)!;
        // The master's book is not held: tiers 4 and 5 refuse, as Progression.canLearn does.
        if (s.tier >= 4 || points < s.cost || (s.requires && !learned.includes(s.requires))) return { ok: false };
        points -= s.cost;
        learned.push(id);
        return { ok: true };
      },
    },
    companions: { setActive: (ids) => (opts.refuseParty ? false : ((party = ids), true)) },
    markAnvilTier: (t) => void anvil.push(t),
  };
  return { ports, counts, slots, temper, learned, anvil, get party() { return party; }, get points() { return points; } };
}

describe('K16 era kit', () => {
  it('applies to the Dragonspine and the summit only', () => {
    expect(wantsEraKit('spine')).toBe(true);
    expect(wantsEraKit('summit')).toBe(true);
    expect(wantsEraKit('greyfen')).toBe(false);
    expect(wantsEraKit(undefined)).toBe(false);
  });

  it('gives, equips and tempers the Knight tier 3 set over the starter kit', () => {
    const h = harness();
    const r = applyEraKit(h.ports, 'knight', 'spine');
    expect(r.given).toEqual(['ashforged-longsword', 'spike-shield', 'ashplate']);
    expect(Object.fromEntries(h.slots)).toEqual({ weapon: 'ashforged-longsword', offhand: 'spike-shield', armour: 'ashplate' });
    for (const id of r.given) expect(h.temper.get(id)).toBe(ERA_TEMPER.spine);
    expect(h.anvil).toEqual([2, 3]);
  });

  it('wears a better held piece (R12 reed armour) and a class-suited tier 4 reward, never another class\'s weapon', () => {
    const h = harness({ items: { 'squires-arming-sword': 1, 'reed-armour': 1, 'ranger-longbow': 1, 'rimewood-haft': 1, 'healing-flask': 1 }, equipped: { weapon: 'squires-arming-sword' } });
    applyEraKit(h.ports, 'knight', 'summit');
    expect(h.slots.get('armour')).toBe('reed-armour');
    expect(h.slots.get('weapon')).toBe('rimewood-haft');
    expect(suitsClass('ranger-longbow', 'knight')).toBe(false);
    expect(h.temper.get('rimewood-haft')).toBe(ERA_TEMPER.summit);
  });

  it('never lowers a higher temper', () => {
    const h = harness();
    h.counts.set('ashforged-longsword', 1);
    h.temper.set('ashforged-longsword', 5);
    applyEraKit(h.ports, 'knight', 'spine');
    expect(h.temper.get('ashforged-longsword')).toBe(5);
  });

  it('spends the points tier by tier across the branches and stops at the master\'s book', () => {
    const h = harness({ points: 15 });
    const r = applyEraKit(h.ports, 'knight', 'spine');
    const tiers = r.learned.map((id) => SKILLS.find((s) => s.id === id)!.tier);
    expect(tiers).toEqual([...tiers].sort());
    expect(tiers.filter((t) => t === 1)).toHaveLength(3);
    expect(tiers.filter((t) => t === 2)).toHaveLength(3);
    expect(tiers.filter((t) => t === 3)).toHaveLength(3);
    expect(h.points).toBe(3);
  });

  it('with few points learns what it can afford and nothing it cannot', () => {
    const h = harness({ points: 2 });
    const r = applyEraKit(h.ports, 'knight', 'spine');
    expect(r.learned).toHaveLength(2);
    expect(h.points).toBe(0);
  });

  it('tops flasks up to the cap and seats Aelfreda and Hrolf', () => {
    const h = harness({ flaskCap: 15 });
    const r = applyEraKit(h.ports, 'knight', 'spine');
    expect(h.counts.get('healing-flask')).toBe(15);
    expect(h.party).toEqual(ERA_PARTY);
    expect(r.party).toBe(true);
  });

  it('a refused party or missing services do not stop the rest of the kit', () => {
    const h = harness({ refuseParty: true });
    const ports = { ...h.ports, progression: undefined, markAnvilTier: undefined };
    const r = applyEraKit(ports, 'knight', 'spine');
    expect(r.party).toBe(false);
    expect(r.learned).toEqual([]);
    expect(h.slots.get('weapon')).toBe('ashforged-longsword');
  });

  it('every class has a tier 3 set to give', () => {
    for (const c of ['knight', 'warden', 'emberwright', 'ashblade', 'pathfinder']) expect(eraGear(c).length).toBeGreaterThanOrEqual(2);
  });
});
