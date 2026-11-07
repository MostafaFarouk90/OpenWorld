// Plan 3, the inside-the-walls check: every Act 1 to 3 objective whose target (a talk's NPC post, an interact's prop, an interior
// entered) lies
// inside the ring wall and that can still be open once `story.gate.a4` is set. The main quests are closed by their own chain
// before the gate; a target who leaves the city with the King (their Act 4 posts are at the camp and the refuge) can still be
// found. Everything else must be a quest Edric's offer warns about before the doors close.
import { describe, expect, it } from 'vitest';
import { questDefs } from '../..';
import { QUEST_PROPS } from '../../props';
import { ACT2_PROPS } from '../../act2';
import { SIDE_PROPS } from '../../side';
import { ACT3_PROPS } from '../../act3';
import { HARROWMARK_LAYOUT } from '../../../../harrowmark/harrowmark.layout';
import { insideRingWall } from '../../../../harrowmark/noStrand';
import { HARROWMARK_INTERIORS } from '../../../../interiors/harrowmark';
import { UNDERWAYS_DEF } from '../../../../interiors/underways/generate';
import { HARROWMARK_A4_QUEST_IDS } from './harrowmark.content';
import { M38_SIDE_JOBS } from './m38.quest';
import { isAct5Id } from '../../../lint/act5Ids';

/** Who can still be found after the Council: at the camp, then at the refuge (Rook as a refuge trainer, Wenna and Dunstan by
 * L7's refuge vendor posts). Wystan and Merrin have no refuge post, so a step with them would count. */
const LEAVERS = new Set(['rook', 'wenna', 'dunstan']);
/** The shipped interiors under and inside the city (an `interior.entered` step there cannot be done once it is Vey's). */
const CITY_INTERIORS = new Set([...HARROWMARK_INTERIORS.map((d) => d.id), UNDERWAYS_DEF.id]);
/** Act 1 to 3 main quests: all done before the gate (A4 is M34 and D06, at the end of every chain). */
const MAIN = /^m(0[1-9]|[12]\d|3[0-4])$/;

function insideHits(): Map<string, string[]> {
  const pos = new Map(HARROWMARK_LAYOUT.anchors.map((a) => [a.id, a]));
  const props = new Map([...QUEST_PROPS, ...ACT2_PROPS, ...SIDE_PROPS, ...ACT3_PROPS].map((p) => [p.interactableId, p.anchorId]));
  const hits = new Map<string, string[]>();
  for (const q of questDefs) {
    // Act 5's quests start after the walls close and meet everyone at the Rim Camp (their own posts), so none is stranded
    if (HARROWMARK_A4_QUEST_IDS.includes(q.id) || MAIN.test(q.id) || isAct5Id(q.id)) continue;
    for (const o of q.objectives) {
      const inId = (o.match as { interiorId?: unknown } | undefined)?.interiorId;
      if (o.target === 'interior.entered' && typeof inId === 'string' && CITY_INTERIORS.has(inId)) hits.set(q.id, [...(hits.get(q.id) ?? []), `${o.id}:${inId}`]);
      for (const t of Array.isArray(o.target) ? o.target : [o.target]) {
        if (typeof t !== 'string' || (o.type === 'talk' && LEAVERS.has(t))) continue;
        const a = o.type === 'talk' ? pos.get(`npc-post.${t}`) : o.type === 'interact' ? pos.get(props.get(t) ?? '') : undefined;
        if (a && insideRingWall(a.x, a.z)) hits.set(q.id, [...(hits.get(q.id) ?? []), `${o.id}:${t}`]);
      }
    }
  }
  return hits;
}

describe('nothing left open inside the walls', () => {
  it('every side quest with a step inside the walls is one Edric\'s offer warns about', () => {
    const hits = insideHits();
    expect(hits.size).toBeGreaterThan(0); // the check sees the city (a broken lookup would pass vacuously)
    for (const id of hits.keys()) expect(M38_SIDE_JOBS as readonly string[], `${id}: ${hits.get(id)!.join(', ')}`).toContain(id);
  });
});
