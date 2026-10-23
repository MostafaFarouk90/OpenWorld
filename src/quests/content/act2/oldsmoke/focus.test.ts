// Two interactables on one anchor sit at the same distance from the player, so the lower id always wins the focus and the
// other can never be used (InteractionSystem: distance minus `priority`, ties to the lower id, so `door:` beats `npc:` beats
// `use:`). No quest prop, note or NPC of Phase D may share an anchor with another unless one of them carries a `priority`
// that beats the rest (a quest prop that is only enabled while its objective is current, over a note read afterwards).
import { describe, expect, it } from 'vitest';
import { ACT2_PROPS, ACT2_QUEST_NOTES } from '../index';
import { OLDSMOKE_NPCS } from '../../../../oldsmoke/npcDefs';
import { M17R08_NPCS } from './mines/m17r08.content';
import { M18M19_NPCS } from './mines/m18m19.content';
import { M20D04_NPCS } from './mines/m20d04.content';

interface Thing { id: string; kind: 'prop' | 'note' | 'npc'; priority: number }

const OLDSMOKE_RE = /m1[6-9]|m2[0-2]|r0[89]|r10|d04|oldsmoke/;

const props = ACT2_PROPS.map((p): [string, Thing] => [p.anchorId, { id: p.interactableId, kind: 'prop', priority: p.priority ?? 0 }]);
const notes = ACT2_QUEST_NOTES.map((n): [string, Thing] => [n.anchorId, { id: n.interactableId, kind: 'note', priority: n.priority ?? 0 }]);
const NPC_SPECS = [...OLDSMOKE_NPCS, ...M17R08_NPCS, ...M18M19_NPCS, ...M20D04_NPCS];
const npcs = NPC_SPECS.map((s): [string, Thing] => [s.post, { id: `npc:${s.id}`, kind: 'npc', priority: 0 }]);

function byAnchor(entries: Array<[string, Thing]>): Map<string, Thing[]> {
  const m = new Map<string, Thing[]>();
  for (const [anchor, t] of entries) m.set(anchor, [...(m.get(anchor) ?? []), t]);
  return m;
}

/** Anchors where focus cannot reach every interactable: more than one thing and no single one with a strictly higher priority. */
function clashes(entries: Array<[string, Thing]>): string[] {
  const out: string[] = [];
  for (const [anchor, things] of byAnchor(entries)) {
    if (things.length < 2) continue;
    const sorted = [...things].sort((a, b) => b.priority - a.priority);
    // the winner (higher priority) must be a quest prop or note, and everything else must sit strictly below it
    const ok = sorted[0].priority > sorted[1].priority && sorted[0].kind !== 'npc';
    if (!ok) out.push(`${things.map((t) => t.id).join(' and ')} on ${anchor}`);
  }
  return out;
}

/** Doors, lift menus and landings: the interior door, the lift's stop menu and the hall door hold nothing else. */
const LANDINGS = ['oldsmoke.shaft.floor', 'oldsmoke.old.lift', 'oldsmoke.lower.lift', 'oldsmoke.bellows.lift', 'oldsmoke.deepdelve.lift'];
const RESERVED = [
  'oldsmoke.shaft.door', 'oldsmoke.shaft.lift.top', 'oldsmoke.hall.door',
  ...LANDINGS, ...LANDINGS.flatMap((l) => [`${l}.call`, `${l}.up`]),
];

describe('Phase D interactables do not share anchors', () => {
  it('each prop and note stands alone on its anchor (unless a priority decides it)', () => {
    expect(clashes([...props, ...notes]).filter((c) => OLDSMOKE_RE.test(c))).toEqual([]);
  });

  it('no Oldsmoke NPC post shares an anchor with a prop, a note or another NPC', () => {
    expect(clashes([...props, ...notes, ...npcs]).filter((c) => /npc:/.test(c))).toEqual([]);
  });

  it('every Oldsmoke NPC spec is seen (the lists are not empty and no post is shared by two NPCs)', () => {
    expect(NPC_SPECS.length).toBeGreaterThan(20);
    const posts = NPC_SPECS.map((s) => s.post);
    expect(posts.filter((p, i) => posts.indexOf(p) !== i)).toEqual([]);
  });

  it('the doors, lift menus and landings are reserved: no NPC, prop or note stands on them', () => {
    const all = byAnchor([...props, ...notes, ...npcs]);
    for (const anchor of RESERVED) expect(all.get(anchor)?.map((t) => t.id) ?? [], anchor).toEqual([]);
  });
});
