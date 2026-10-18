import { describe, it, expect } from 'vitest';
import { questDefs } from './index';
import { dialogueDefs } from '../../dialogue/content';
import { ITEMS } from '../../inventory/items';
import { questStrings } from '../strings.en';
import { dialogueStrings } from '../../dialogue/strings.en';
import { journalStrings } from '../journalStrings.en';
import { validateQuest } from '../validate';
import { validateDialogue } from '../../dialogue/validate';
import { M06_BRIBE_GOLD, M06_TIP_GOLD, R03_COIN_GOLD } from './gold';
import { QUEST_PROPS, INTERACT_FLAGS } from './props';
import { FAVOUR_START, CREATURE_MERCY_CAP, bandFor } from '../../state/favour';
import { DialogueRunner } from '../../dialogue/DialogueRunner';
import { QuestManager } from '../QuestManager';
import { createEffectRunner } from '../effects';
import { makeWorld, FakeBus } from '../testKit';
import type { Effect, FlagValue, Condition } from '../types';
import type { FavourBand } from '../types';

const strings = { ...questStrings, ...dialogueStrings, ...journalStrings };
const hasKey = (k: string) => k in strings;
const PHASE_B = ['m06', 'm07', 'm08', 'm09', 'm10', 'd02', 'r03', 'r04'];
const defs = questDefs.filter((d) => PHASE_B.includes(d.id));

function walk(effects: Effect[] | undefined, out: Effect[] = []): Effect[] {
  for (const e of effects ?? []) {
    out.push(e);
    const c = e as any;
    if ('if' in c) { walk(c.then, out); walk(c.else, out); }
  }
  return out;
}
const written: { where: string; key: string }[] = [];
for (const q of defs) for (const k of ['onStart', 'onComplete', 'rewards'] as const) for (const e of walk(q[k])) {
  const key = (e as any).setFlag ?? (e as any).clearFlag; if (typeof key === 'string') written.push({ where: `${q.id}.${k}`, key });
}
for (const d of dialogueDefs) for (const n of d.nodes) {
  for (const e of walk(n.effects)) { const key = (e as any).setFlag ?? (e as any).clearFlag; if (typeof key === 'string') written.push({ where: `${d.id}.${n.id}`, key }); }
  for (const c of n.choices ?? []) for (const e of walk(c.effects)) { const key = (e as any).setFlag ?? (e as any).clearFlag; if (typeof key === 'string') written.push({ where: `${d.id}.${n.id}.${c.id}`, key }); }
}
const writers = (key: string) => written.filter((w) => w.key === key).map((w) => w.where);

describe('Harrowmark quest content', () => {
  it.each(defs.map((d) => [d.id, d] as const))('%s validates and has every string', (_id, def) => {
    expect(validateQuest(def, hasKey)).toEqual([]);
  });
  it('quest items and prompts exist', () => {
    for (const d of defs) for (const e of [...walk(d.onStart), ...walk(d.onComplete), ...walk(d.rewards)]) {
      for (const s of (e as any).give ?? []) expect(ITEMS[s.itemId], `${d.id} gives ${s.itemId}`).toBeDefined();
    }
    for (const p of QUEST_PROPS) {
      expect(strings[p.promptKey], p.promptKey).toBeDefined();
      expect(p.interactableId).toMatch(/^[a-z]+:[a-z0-9-]+$/);
      if (p.give) expect(ITEMS[p.give.itemId], p.give.itemId).toBeDefined();
    }
    for (const b of INTERACT_FLAGS) expect(b.interactableId).toMatch(/^use:m09-invoice-[123]$/);
  });
  it('the quests and dialogues grant none of the class starter gear (thread 12 owns it)', () => {
    const starter = ['woodcutters-axe', 'apprentices-staff', 'alley-knives', 'hunting-crossbow', 'hide-jerkin', 'wool-robe', 'leather-vest', 'rangers-cloak'];
    const granted = new Set<string>();
    const scan = (effects: Effect[] | undefined) => { for (const e of walk(effects)) for (const g of (e as any).give ?? []) granted.add(g.itemId); };
    for (const d of defs) { scan(d.onStart); scan(d.onComplete); scan(d.rewards); }
    for (const d of dialogueDefs) for (const n of d.nodes) { scan(n.effects); for (const c of n.choices ?? []) scan(c.effects); }
    for (const id of starter) expect(granted.has(id), id).toBe(false);
  });
  it('every flag the new content writes is under thread 6\'s prefixes and has the expected single writer', () => {
    const OWNED = /^(story\.(m|d|r)\d\d\.[a-zA-Z0-9_.-]+|world\.harrowmark\.inn\.price|world\.brightwater\.barley)$/;
    const keys = [
      ...written,
      ...QUEST_PROPS.filter((p) => p.usedFlag).map((p) => ({ where: p.interactableId, key: p.usedFlag! })),
      ...INTERACT_FLAGS.map((b) => ({ where: b.interactableId, key: b.flag })),
    ];
    for (const w of keys) {
      if (w.key.startsWith('quest.') || w.key.startsWith('tutorial.') || w.key.startsWith('player.')) continue; // Phase A and slice 1 content
      expect(w.key, `${w.where} writes ${w.key}`).toMatch(OWNED);
    }
    expect(writers('story.m06.started')).toEqual(['m06.onStart']);
    expect(writers('story.m08.keepOpen')).toEqual(['m08.onStart']);
    expect(writers('story.m08.favourTab')).toEqual(['m08.onStart']);
    expect(writers('story.m10.ashmare')).toEqual(['m10.onComplete']);
    expect(writers('story.m07.classOpen')).toHaveLength(1);
    expect(writers('story.m09.houseOpen')).toHaveLength(1);
    expect(writers('story.d02.underwaysOpen')).toHaveLength(1);
    expect(writers('story.d02.campSeen')).toHaveLength(1);
    expect(writers('story.d02.campSeen')[0]).toMatch(/^scene-act1-camp\./);
    expect(writers('story.act1.campSeen')).toEqual([]);
    expect(writers('story.m06.sneakOpen')).toEqual([]);
    expect(writers('story.m09.sneakOpen')).toEqual([]);
    expect(writers('story.m10.chaseOpen')).toEqual([]);
    expect(writers('story.gate.a2')).toEqual([]);
    expect(writers('world.harrowmark.inn.room')).toEqual([]);
  });
});

describe('gold amounts', () => {
  it('match thread 19\'s constants and every spendGold is guarded by a gold condition of at least its amount', () => {
    expect([M06_BRIBE_GOLD, M06_TIP_GOLD, R03_COIN_GOLD]).toEqual([50, 25, 150]);
    let spends = 0;
    for (const d of dialogueDefs) for (const n of d.nodes) {
      for (const c of n.choices ?? []) {
        const spend = walk(c.effects).find((e) => 'spendGold' in e) as { spendGold: { amount: number } } | undefined;
        if (!spend) continue;
        spends += 1;
        const mins: number[] = [];
        const scan = (cond: Condition | undefined): void => {
          if (!cond) return;
          const k = cond as any;
          if (k.gold) mins.push(k.gold.atLeast);
          for (const s of k.all ?? []) scan(s);
          for (const s of k.any ?? []) scan(s);
        };
        scan(c.when);
        expect(Math.max(...mins, 0), `${d.id}.${n.id}.${c.id}`).toBeGreaterThanOrEqual(spend.spendGold.amount);
        const idx = (c.effects ?? []).findIndex((e) => 'spendGold' in e);
        expect(idx, 'spendGold first').toBe(0);
      }
    }
    expect(spends).toBeGreaterThanOrEqual(2);
  });
});

describe('M06 persuasion is reachable', () => {
  it('the highest Halvard favour before M06 is Banked, and the tipped argument is offered there and not at Cold', () => {
    const best = FAVOUR_START.halvard + CREATURE_MERCY_CAP;
    expect(bandFor(best)).toBe('banked');
    const rook = dialogueDefs.find((d) => d.id === 'npc-rook')!;
    const choose = rook.nodes.find((n) => n.id === 'm06-choose')!;
    const bands: Record<string, FavourBand> = { cold: 'cold', banked: 'banked', stoked: 'stoked' };
    const visible = (band: FavourBand, gold: number): string[] => {
      const bus = new FakeBus();
      const flags = new Map<string, FlagValue>();
      const state = {
        getFlag: (k: string) => flags.get(k), setFlag: (k: string, v: FlagValue) => { flags.set(k, v); }, clearFlag: (k: string) => { flags.delete(k); },
        favourBand: () => band, favour: () => (band === 'cold' ? 10 : band === 'banked' ? 40 : 55), addFavour: () => 0,
      };
      const w = makeWorld();
      const quests = new QuestManager({ bus, state, playerId: () => 'p' });
      const effects = createEffectRunner({ state, quests, bus, sourceId: 'x' });
      const d = new DialogueRunner({
        bus, state, quests, effects, strings: { t: (k) => k, has: () => true }, gold: () => gold,
      });
      d.register({ id: 'probe', start: 'm06-choose', nodes: rook.nodes });
      void w; void bands;
      d.start('probe', 'rook');
      return (d.view()?.choices ?? []).map((c) => c.id);
    };
    expect(choose).toBeDefined();
    expect(visible('banked', M06_TIP_GOLD)).toContain('argue-tip');
    expect(visible('banked', M06_TIP_GOLD - 1)).not.toContain('argue-tip');
    expect(visible('banked', 0)).not.toContain('argue-free');
    expect(visible('stoked', 0)).toContain('argue-free');
    expect(visible('cold', 1000)).not.toContain('argue-tip');
    expect(visible('cold', 1000)).not.toContain('argue-free');
    expect(visible('cold', M06_BRIBE_GOLD)).toContain('bribe');
    expect(visible('cold', M06_BRIBE_GOLD - 1)).not.toContain('bribe');
  });
});

describe('every dialogue validates', () => {
  it.each(dialogueDefs.map((d) => [d.id, d] as const))('%s', (_id, d) => {
    const r = validateDialogue(d, hasKey);
    expect(r.errors).toEqual([]);
  });
});
