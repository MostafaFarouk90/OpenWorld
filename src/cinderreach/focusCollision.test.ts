import { describe, expect, it } from 'vitest';
import { ACT2_CARRY } from '../quests/content/act2/carry';
import { ACT2_NOTE_LIST, ACT2_QUEST_NOTES } from '../quests/content/act2/notes';
import { ACT2_PROPS } from '../quests/content/act2/props';
import { CINDERREACH_LAYOUT } from './cinderreach.layout';
import { CINDERREACH_NPCS } from './npcDefs';

/**
 * An NPC's talk interactable (radius 2.5) and a quest prop (radius 2) at the same spot tie on distance and the lower id wins:
 * `npc:` beats `use:`, so a prop under a standing NPC could never be used. A prop an NPC can stand on must outrank him
 * (`priority`) for as long as its objective is current.
 */
describe('NPC posts and quest interactables', () => {
  const pos = new Map(CINDERREACH_LAYOUT.anchors.map((a) => [a.id, a]));
  const near = (a: string, b: string, r = 1.2) => {
    const p = pos.get(a);
    const q = pos.get(b);
    return !!p && !!q && Math.hypot(p.x - q.x, p.z - q.z) < r;
  };
  it('the props and notes an NPC stands on carry a priority', () => {
    expect(ACT2_PROPS.filter((p) => p.priority).map((p) => p.interactableId).sort()).toEqual(['use:m15-free-carter', 'use:r05-hollow-2', 'use:r07-sign-1']);
    expect(ACT2_QUEST_NOTES.filter((n) => n.priority).map((n) => n.interactableId).sort()).toEqual(['use:note-m13-shield', 'use:note-m15-map', 'use:note-r11-camp-1']);
  });
  it('no NPC post sits within 1.2 m of a prop, note or carry pickup unless the prop outranks the NPC', () => {
    const bad: string[] = [];
    for (const npc of CINDERREACH_NPCS) {
      for (const p of ACT2_PROPS) if (near(npc.post, p.anchorId) && !((p.priority ?? 0) > 0)) bad.push(`${npc.id} on ${p.interactableId}`);
      for (const n of ACT2_NOTE_LIST) if (near(npc.post, n.anchorId) && !((ACT2_QUEST_NOTES.find((q) => q.interactableId === `use:${n.id}`)?.priority ?? 0) > 0)) bad.push(`${npc.id} on note ${n.id}`);
      for (const c of ACT2_CARRY) if (near(npc.post, c.homeAnchor)) bad.push(`${npc.id} on pickup ${c.interactableId}`);
    }
    expect(bad).toEqual([]);
  });
});
