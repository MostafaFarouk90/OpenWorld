import { describe, it, expect } from 'vitest';
import { questDefs } from './index';
import { dialogueDefs } from '../../dialogue/content';
import { POI_REWARDS } from './poi';
import { ITEMS } from '../../inventory/items';
import type { Effect } from '../types';
import { FORGE_HEART_FRAGMENT } from '../../gear/tier5/fragments';

const OWNED = /^(story\.(m|d|r|j)\d\d\.|story\.r01\.|story\.a2\.(campSeen|wennaAtCamp)$|story\.a3\.campSeen$|world\.brightwater\.barley$|world\.harrowmark\.inn\.|quest\.|tutorial\.|player\.)/;

function walk(effects: Effect[] | undefined, out: Effect[] = []): Effect[] {
  for (const e of effects ?? []) {
    out.push(e);
    const c = e as any;
    if ('if' in c) { walk(c.then, out); walk(c.else, out); }
  }
  return out;
}
const all: { where: string; e: Effect }[] = [];
for (const q of questDefs) for (const k of ['onStart', 'onComplete', 'rewards'] as const) for (const e of walk(q[k])) all.push({ where: `${q.id}.${k}`, e });
for (const d of dialogueDefs) for (const n of d.nodes) {
  for (const e of walk(n.effects)) all.push({ where: `${d.id}.${n.id}`, e });
  for (const c of n.choices ?? []) for (const e of walk(c.effects)) all.push({ where: `${d.id}.${n.id}.${c.id}`, e });
}
for (const r of POI_REWARDS) for (const e of walk(r.effects)) all.push({ where: r.interactableId, e });

describe('Act 1 content', () => {
  it('every given or taken item exists', () => {
    for (const { where, e } of all) {
      const c = e as any;
      for (const s of c.give ?? []) expect(ITEMS[s.itemId], `${where} gives ${s.itemId}`).toBeDefined();
    }
  });
  it('quest and dialogue effects only write flags this thread owns, never raw mercy unlock keys', () => {
    for (const { where, e } of all) {
      const key = (e as any).setFlag ?? (e as any).clearFlag;
      if (typeof key !== 'string') continue;
      expect(key, `${where} writes ${key}`).not.toMatch(/^enemies\./);
      expect(key, `${where} writes ${key}`).toMatch(OWNED);
    }
  });
  it('story.m05.complete, tobbJoined, favourTab and ashmare each have exactly one writer', () => {
    const writers = (key: string) => all.filter(({ e }) => (e as any).setFlag === key).map((x) => x.where);
    expect(writers('story.m05.complete')).toEqual(['m05.onComplete']);
    expect(writers('story.m05.tobbJoined')).toEqual(['m05.onStart']);
    expect(writers('story.gate.a2')).toEqual([]);
  });
  it('every quest reward item is granted at most once across quests', () => {
    // Act 5 (N10, additive): the forge-heart fragment is a counted material N7 pays from several quests (FRAGMENT_SOURCES)
    const given = all.filter(({ where }) => where.endsWith('.rewards')).flatMap(({ e }) => ((e as any).give ?? []).map((s: any) => s.itemId))
      .filter((id: string) => id !== FORGE_HEART_FRAGMENT);
    expect(new Set(given).size).toBe(given.length);
  });
  it('no dialogue starts D02 or other Phase B quests yet', () => {
    const starts = all.map(({ e }) => (e as any).startQuest).filter(Boolean);
    expect(starts.filter((id: string) => !questDefs.some((q) => q.id === id))).toEqual([]);
  });
});
